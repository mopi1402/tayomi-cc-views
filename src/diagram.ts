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
import { MERMAID_BORDERS_ENV, MERMAID_THEME_ENV } from "./data/markup.js";
import { printedWidth } from "./layout/measure.js";
import { DEFAULT_STATE_DIR } from "./platform/scratch.js";
import { activeTheme, isLight } from "./platform/theme.js";
// TYPES alone, erased at compile time. Naming the module in a VALUE import is exactly what load() exists to avoid.
import type * as Renderer from "@tayomi/mermaid2term";

/** The renderer's npm home. Resolved from THIS module, so the engine's own dependency answers wherever it is installed. */
const RENDERER_PKG = "@tayomi/mermaid2term";

let renderer: typeof Renderer | undefined;

/**
 * The renderer, loaded on the FIRST draw of a process and never before. This module sits on the path of every flush,
 * where the cache answers most of them without drawing at all, and loading the renderer costs some forty milliseconds
 * measured: hoisted to a static import, that price would be paid by every flush of every message, diagram or not.
 *
 * `require` and not `import()`, because a draw is synchronous all the way down to the pipeline that calls it. Node
 * requires an ES module from synchronous code since 22.12, which is the floor this package declares.
 */
function load(): typeof Renderer {
  renderer ??= createRequire(import.meta.url)(RENDERER_PKG) as typeof Renderer;
  return renderer;
}

/** What a renderer ends its output with, and what a DRAWING does not include. */
const TRAILING_NEWLINES = /\n+$/;

/** The SIDE a drawing is painted for, in the two words the renderer's `background` option takes. */
export const DARK_BACKGROUND = "dark";
export const LIGHT_BACKGROUND = "light";
export type Background = typeof DARK_BACKGROUND | typeof LIGHT_BACKGROUND;

/** A theme and a border mode the operator asked for, and the side of the terminal it will be painted onto. */
export interface Paint {
  theme: string;
  background: Background;
  borders?: string;
}

/** Mermaid's own default palette: what an unasked drawing takes, so a diagram looks here as it does on a forge. */
export const UNASKED_THEME = "default";
/** No padding inside a node's frame: the tighter drawing a terminal column can afford. */
export const UNASKED_BORDERS = "padless";

const asked = (env: NodeJS.ProcessEnv, name: string, unasked: string): string => {
  const named = (env[name] ?? "").trim();
  return named === "" ? unasked : named;
};

/** Never undefined: an unasked drawing has a side too, and the two sides are two entries in the cache key. */
export function requestedPaint(env: NodeJS.ProcessEnv = process.env): Paint {
  return {
    theme: asked(env, MERMAID_THEME_ENV, UNASKED_THEME),
    background: isLight(activeTheme(env)) ? LIGHT_BACKGROUND : DARK_BACKGROUND,
    borders: asked(env, MERMAID_BORDERS_ENV, UNASKED_BORDERS),
  };
}

/** Enough of a digest to name a file, and far past collision for the handful of diagrams one message holds. */
const KEY_CHARS = 32;
const DIGEST = "sha256";
const HEX = "hex";

const CACHE_SUBDIR = "diagram";
/** What a folded drawing's file adds to the name its unfolded twin would have. */
const FOLDED_SUFFIX = ".folded";

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
 * The key a source draws under. Width and paint are both in it: the same graph at another width, under another theme
 * or on the other side is another drawing, and a key blind to any of them hands one screen another's render.
 */
function cacheKey(source: string, width: number, paint: Paint, height?: number): string {
  return createHash(DIGEST)
    .update(`${width}\n${height ?? ""}\n${paint.theme}\n${paint.background}\n${paint.borders ?? ""}\n${source}`)
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
  stateDir: string = DEFAULT_STATE_DIR,
  paint: Paint = requestedPaint(),
  height?: number
): string {
  return path.join(stateDir, CACHE_SUBDIR, ENGINE_VERSION, cacheKey(source, width, paint, height));
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
 * THROWS where the source declares no type the renderer knows and where the renderer answers a void, and that is the
 * contract: the caller's fail-open turns the throw into the block's own markdown on screen, which for a diagram source
 * is a graph that draws itself anywhere the hook does not run.
 *
 * `height` is a ceiling the renderer tightens toward, never a promise: a graph that cannot get that short comes back
 * as short as it gets. `whole` THROWS where the drawing only fits folded, for a caller with somewhere better to put it
 * than a graph cut into strips.
 */
export function renderDiagram(
  source: string,
  width: number,
  stateDir: string | undefined = DEFAULT_STATE_DIR,
  direction?: Direction,
  env: NodeJS.ProcessEnv = process.env,
  height?: number,
  whole = false
): string {
  const dir = stateDir ?? DEFAULT_STATE_DIR;
  const paint = requestedPaint(env);
  const once = (towards: Direction | undefined): Drawing => {
    // Forcing rewrites the SOURCE, so the cache needs no direction in its key: an oriented twin IS another source.
    const oriented = towards === undefined ? source : orient(source, towards);
    const file = diagramCachePath(oriented, width, dir, paint, height);
    // A folded drawing is kept APART, so a hit says which it is without a second layout.
    const foldedFile = file + FOLDED_SUFFIX;
    const hit = readCache(file);
    if (hit !== undefined) return { drawn: hit, folded: false };
    const foldedHit = readCache(foldedFile);
    if (foldedHit !== undefined) return { drawn: foldedHit, folded: true };
    const drawing = draw(oriented, width, paint, height);
    writeCache(drawing.folded ? foldedFile : file, drawing.drawn);
    return drawing;
  };
  const drawing = once(direction);
  if (whole && drawing.folded) throw new Error(`diagram: wider than the ${width} columns it was given`);
  // Turned only under a height ceiling it misses: everywhere a drawing has the room it wants, the author's direction
  // stands. The turn is kept only when it fits UNFOLDED and is SHORTER.
  if (height === undefined || direction !== undefined) return drawing.drawn;
  const declared = source.match(FLOWCHART_DIRECTION_RE)?.[2];
  const lines = sizeOf(drawing.drawn).lines;
  if (declared === undefined || lines <= height) return drawing.drawn;
  const turned = once(declared === WIDE ? TALL : WIDE);
  return !turned.folded && sizeOf(turned.drawn).lines < lines ? turned.drawn : drawing.drawn;
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

/** A drawing, and whether it only fit the width by being FOLDED into strips. */
interface Drawing {
  drawn: string;
  folded: boolean;
}

/** One drawing, laid out: THROWS on a source the renderer does not know, and where it answers a void. */
function draw(source: string, width: number, paint: Paint, height?: number): Drawing {
  const mermaid2term = load();
  // The version-skew seam: a type from a mermaid newer than this renderer is no error to it, the fallback draws ANY
  // text as flowchart boxes of its own syntax. `undefined` is the renderer's own word that it holds no parser for this
  // source, and the one chance to show the fence instead of nonsense.
  if (mermaid2term.declaredType(source) === undefined) {
    throw new Error("diagram: the source declares no type the renderer knows");
  }
  // A name the renderer does not hold falls to the unasked one, as the border mode does: a typo changes nothing.
  const theme = mermaid2term.THEMES.has(paint.theme) ? paint.theme : UNASKED_THEME;
  const modes: readonly string[] = mermaid2term.BORDER_MODES;
  const borders = (modes.includes(paint.borders ?? "") ? paint.borders : UNASKED_BORDERS) as Renderer.BorderMode;
  // Folded at the width this module was GIVEN, which is the box the drawing has to sit in. Worth saying because the
  // reference binary cannot: it folds at its own console's 80 columns whatever `--width` asked for, so any box wider
  // than that came back cut through its own frame. A graph too wide to lay out still folds, at the right number now.
  const text = mermaid2term.renderThemedText(source, { width, height, background: paint.background, borders }, theme);
  const folded = text.plain.split("\n").some((line) => mermaid2term.displayWidth(line) > width);
  const drawn = mermaid2term.printToConsole(text, width, paint.background);
  // A renderer drawing nothing is a failure the caller must see as one, or the view renders a void. An empty source and
  // ordinary prose both land here: neither is an error to the renderer, and both come back blank.
  if (drawn.trim() === "") throw new Error("diagram: the renderer drew nothing");
  // The renderer's own trailing newline comes OFF: what this returns is the drawing, and a view's render is a value the
  // pipeline puts its own separator after (pipeline.ts). Left on, the two stack and the diagram floats a blank line
  // above the prose that follows it.
  return { drawn: drawn.replace(TRAILING_NEWLINES, ""), folded };
}
