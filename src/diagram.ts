// A diagram source, drawn. The renderer is a LIBRARY here: a draw is a function call, nothing spawns, and nothing on
// the machine can be missing that the lockfile did not already promise.
//
// Why a cache all the same: each flush is a fresh process (hook/runner.ts), so nothing survives between two deltas,
// while transform() re-renders every block of the message on every one of them. Reading a drawing back from disk is an
// order of magnitude cheaper than laying it out again, and a diagram sitting at the top of a long message is
// re-rendered once per delta, thousands of times.
//
// The cache discipline is stream-state.ts's, for the same reason: up to three flushes are in flight at once. Write-once
// under a content hash, temporary file then atomic rename, never a read-modify-write. A key names its own value, so two
// racing writers write the same bytes and neither can lose an update.

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { ENGINE_VERSION } from "./data/engine.js";
import { printedWidth } from "./layout/measure.js";
import { DEFAULT_STATE_DIR } from "./platform/scratch.js";
// TYPES alone, erased at compile time. Naming the module in a VALUE import is exactly what load() exists to avoid.
import type * as Termaid from "@tayomi/termaid-ts";

/** The renderer's npm home. Resolved from THIS module, so the engine's own dependency answers wherever it is installed. */
const RENDERER_PKG = "@tayomi/termaid-ts";

/** The palette every drawing is painted in. */
const THEME = "neon";

let renderer: typeof Termaid | undefined;

/**
 * The renderer, loaded on the FIRST draw of a process and never before. This module sits on the path of every flush,
 * where the cache answers most of them without drawing at all, and loading the renderer costs some forty milliseconds
 * measured: hoisted to a static import, that price would be paid by every flush of every message, diagram or not.
 *
 * `require` and not `import()`, because a draw is synchronous all the way down to the pipeline that calls it. Node
 * requires an ES module from synchronous code since 22.12, which is the floor this package declares.
 */
function load(): typeof Termaid {
  renderer ??= createRequire(import.meta.url)(RENDERER_PKG) as typeof Termaid;
  return renderer;
}

/** What a renderer ends its output with, and what a DRAWING does not include. */
const TRAILING_NEWLINES = /\n+$/;

/** Enough of a digest to name a file, and far past collision for the handful of diagrams one message holds. */
const KEY_CHARS = 32;
const DIGEST = "sha256";
const HEX = "hex";

const CACHE_SUBDIR = "diagram";

/**
 * The header naming a flowchart's direction, and the only directions a caller may force: `BT` and `RL` are deliberate
 * rarities and stay the author's word. Anchored to a line's start, so a label spelling `graph TD` is text.
 */
const FLOWCHART_DIRECTION_RE = /^([ \t]*(?:flowchart|graph)[ \t]+)(TD|TB|LR)\b/m;
/** Reads ACROSS the terminal. */
export const WIDE = "LR";
/** Reads DOWN, as narrow as the same graph gets. */
export const TALL = "TD";
export type Direction = typeof WIDE | typeof TALL;

/** A drawing's footprint on screen, in COLUMNS and lines: a sequence costs bytes and no screen space. */
export interface DiagramSize {
  cols: number;
  lines: number;
}

/** The same graph, asked to run in `direction`. A source whose header names no arbitrable direction is untouched. */
function orient(source: string, direction: Direction): string {
  return source.replace(FLOWCHART_DIRECTION_RE, `$1${direction}`);
}

function sizeOf(drawn: string): DiagramSize {
  const lines = drawn.split("\n");
  return { cols: Math.max(...lines.map(printedWidth)), lines: lines.length };
}

/**
 * The key a source draws under. The WIDTH is part of it: the same graph at two terminal widths is two different
 * drawings, and a key that ignored it would hand a narrow screen the wide render.
 */
function cacheKey(source: string, width: number): string {
  return createHash(DIGEST)
    .update(`${width}\n${source}`)
    .digest(HEX)
    .slice(0, KEY_CHARS);
}

/**
 * Where a source's drawing is kept. EXPORTED because a sidecar must name that file to prove a hit is a hit, and asking
 * the owner beats a test recomputing the same digest and drifting from it.
 *
 * Under the ENGINE'S OWN version, because a drawing belongs to the engine that made it: the state dir outlives an
 * upgrade, and the day a render changes shape, every entry an older engine wrote would otherwise be served as if it
 * were the new one. A version is what a redraw costs, and a redraw is a fraction of a millisecond.
 */
export function diagramCachePath(
  source: string,
  width: number,
  stateDir: string = DEFAULT_STATE_DIR
): string {
  return path.join(stateDir, CACHE_SUBDIR, ENGINE_VERSION, cacheKey(source, width));
}

/** Best effort by construction: a cache that cannot be read is a cache miss, never an error on screen. */
function readCache(file: string): string | undefined {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

/** Write-once and atomic, so a reader sees the whole drawing or no file at all. */
function writeCache(file: string, text: string): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.part`;
    fs.writeFileSync(tmp, text, "utf8");
    fs.renameSync(tmp, file);
  } catch {
    // the draw still stands: a cache miss next time costs a redraw, never a render
  }
}

/**
 * One diagram source, drawn to the text a terminal shows.
 *
 * THROWS where the renderer answers a void, and that is the contract: the caller's fail-open turns the throw into the
 * block's own markdown on screen, which for a diagram source is a graph that draws itself anywhere the hook does not run.
 */
export function renderDiagram(
  source: string,
  width: number,
  stateDir: string | undefined = DEFAULT_STATE_DIR,
  direction?: Direction
): string {
  stateDir = stateDir ?? DEFAULT_STATE_DIR;
  // Forcing rewrites the SOURCE, so the cache needs no direction in its key: an oriented twin IS another source.
  const oriented = direction === undefined ? source : orient(source, direction);
  const file = diagramCachePath(oriented, width, stateDir);
  const hit = readCache(file);
  if (hit !== undefined) return hit;
  const drawn = draw(oriented, width);
  writeCache(file, drawn);
  return drawn;
}

/**
 * Both footprints of one graph, for the layer that DECIDES: this module makes direction measurable and forceable only.
 * `undefined` where the header names no arbitrable direction. Each measure is a cached render, forcing after is free.
 */
export function measureDiagram(
  source: string,
  width: number,
  stateDir: string | undefined = DEFAULT_STATE_DIR
): Record<Direction, DiagramSize> | undefined {
  if (!FLOWCHART_DIRECTION_RE.test(source)) return undefined;
  return {
    [WIDE]: sizeOf(renderDiagram(source, width, stateDir, WIDE)),
    [TALL]: sizeOf(renderDiagram(source, width, stateDir, TALL)),
  };
}

/** One drawing, laid out and painted: THROWS where the renderer answers a void. */
function draw(source: string, width: number): string {
  const termaid = load();
  // Folded at the width this module was GIVEN, which is the box the drawing has to sit in. Worth saying because the
  // reference binary cannot: it folds at its own console's 80 columns whatever `--width` asked for, so any box wider
  // than that came back cut through its own frame. A graph too wide to lay out still folds, at the right number now.
  const drawn = termaid.printToConsole(termaid.renderThemedText(source, { width }, THEME), width);
  // A renderer drawing nothing is a failure the caller must see as one, or the view renders a void. An empty source and
  // ordinary prose both land here: neither is an error to the renderer, and both come back blank.
  if (drawn.trim() === "") throw new Error("diagram: the renderer drew nothing");
  // The renderer's own trailing newline comes OFF: what this returns is the drawing, and a view's render is a value the
  // pipeline puts its own separator after (pipeline.ts). Left on, the two stack and the diagram floats a blank line
  // above the prose that follows it.
  return drawn.replace(TRAILING_NEWLINES, "");
}
