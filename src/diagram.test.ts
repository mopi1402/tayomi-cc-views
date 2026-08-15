// What this module owes the pipeline above it, and the two halves are tested apart on purpose: the CACHE answers
// without the renderer ever being reached, and it is the half a stream depends on. The DRAWING half runs everywhere,
// the renderer being a dependency of this package rather than something a machine may or may not hold.

import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONSOLE_WIDTH } from "@tayomi/termaid-ts";
import {
  DARK_BACKGROUND,
  diagramCachePath,
  LIGHT_BACKGROUND,
  measureDiagram,
  renderDiagram,
  requestedPaint,
  TALL,
  WIDE,
} from "./diagram.js";
import { ENGINE_VERSION } from "./data/engine.js";
import { MERMAID_THEME_ENV, THEME_ENV } from "./data/markup.js";
import { printedText, printedWidth } from "./layout/measure.js";
import { ANSI_RE } from "./style.js";

/** Two widths, because the same graph drawn at each is two different drawings and the key has to say so. */
const WIDTH = 72;
const OTHER_WIDTH = 40;
/** A box on a terminal wider than the renderer's own console, which is the case the fold used to get wrong. */
const BOX_WIDTH = 120;
const SOURCE = "flowchart TD\n    A[un] --> B[deux]\n";

/** Text no renderer could produce, which is what makes a cache HIT provable rather than plausible. */
const SENTINEL = "cache-hit-sentinel";

/** No theme asked for: the DEFAULT this suite pins, immune to whatever the machine running it exports. */
const NO_PAINT_ENV: NodeJS.ProcessEnv = {};
/** A theme the renderer ships, and the same name one letter off, which must do exactly what unset does. */
const A_THEME = "nord";
const NEAR_MISS_THEME = "nordd";
/** The host's side pinned too, so the paint under test never depends on this machine's settings file. */
const PAINTED_ENV: NodeJS.ProcessEnv = { [MERMAID_THEME_ENV]: A_THEME, [THEME_ENV]: DARK_BACKGROUND };

/** A chain wide ACROSS and tall DOWN (measured: 55 columns against 26), so its two footprints are tellable apart. */
const CHAIN =
  "flowchart LR\n    A[premier long libelle] --> B[deuxieme long libelle] --> C[troisieme long libelle]\n";

/** Whether two labels share a LINE, which is what tells a drawing read across from one read down. */
function onOneLine(drawn: string, a: string, b: string): boolean {
  return drawn.split("\n").some((line) => {
    const text = printedText(line);
    return text.includes(a) && text.includes(b);
  });
}

const CACHE_SUBDIR = "diagram";

let stateDir = "";

beforeEach(() => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-diagram-"));
});

function prime(source: string, width: number, text: string): void {
  const file = diagramCachePath(source, width, stateDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

const cacheFiles = (): string[] => {
  try {
    return fs.readdirSync(path.join(stateDir, CACHE_SUBDIR, ENGINE_VERSION));
  } catch {
    return []; // nothing drawn yet, so no directory
  }
};

describe("how the renderer is reached", () => {
  /** This module's own source, which is where a load-time property is readable and nowhere else. */
  const OWN_SOURCE = fs.readFileSync(fileURLToPath(new URL("./diagram.ts", import.meta.url)), "utf8");
  /** A VALUE import of the renderer, anywhere in the file. `import type` is erased and costs nothing, so it passes. */
  const STATIC_VALUE_IMPORT = /^import\s+(?!type\b)[^;]*from\s+"@tayomi\/termaid-ts"/m;

  it("never STATICALLY imports the renderer, the forty milliseconds being what the cache exists to skip", () => {
    // The one invariant of this module a running test cannot see. diagram.ts is on the path of EVERY flush, cache hit
    // or not, and a flush is a fresh process: hoisted to a static import, the renderer's load would be paid by every
    // delta of every message, including the ones holding no diagram at all. This turns red the day someone hoists it.
    expect(OWN_SOURCE).not.toMatch(STATIC_VALUE_IMPORT);
  });
});

describe("the diagram cache", () => {
  it("answers from disk without ever reaching the renderer", () => {
    // The half a stream leans on: one draw per message, then a file read on every delta after it. Proven with text no
    // renderer could produce, so only the file can be answering.
    prime(SOURCE, WIDTH, SENTINEL);
    expect(renderDiagram(SOURCE, WIDTH, stateDir)).toBe(SENTINEL);
  });

  it("keys on the WIDTH too, so a narrow screen is never handed the wide drawing", () => {
    prime(SOURCE, WIDTH, SENTINEL);
    expect(diagramCachePath(SOURCE, OTHER_WIDTH, stateDir)).not.toBe(
      diagramCachePath(SOURCE, WIDTH, stateDir)
    );
  });

  it("keys on the SOURCE, so two diagrams of one message never share a drawing", () => {
    expect(diagramCachePath(SOURCE, WIDTH, stateDir)).not.toBe(
      diagramCachePath(`${SOURCE}    B --> C[trois]\n`, WIDTH, stateDir)
    );
  });

  it("files a drawing under the ENGINE's version, so an upgrade never serves the old engine's render", () => {
    // The state dir outlives an upgrade. Without this, the day a render changes shape every entry the previous engine
    // wrote would be handed back as if it were the new one, and the change would land on nobody's screen.
    expect(diagramCachePath(SOURCE, WIDTH, stateDir).split(path.sep)).toContain(ENGINE_VERSION);
  });
});

describe("the drawing itself", () => {
  it("draws a flowchart as box-drawing text, UNPAINTED, in the terminal's own foreground", () => {
    const out = renderDiagram(SOURCE, WIDTH, stateDir, undefined, NO_PAINT_ENV);
    expect(printedText(out)).toContain("un");
    expect(printedText(out)).toContain("deux");
    // Plain by DECISION, not by accident: every theme the renderer ships writes white-ish labels, unreadable on a
    // light terminal this module cannot see. The env var is the ONE door to paint, and this pins the door shut being
    // the default.
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/\x1b\[/);
  });

  it("paints with the theme the env var names, the operator's word being the one door to colour", () => {
    const out = renderDiagram(SOURCE, WIDTH, stateDir, undefined, PAINTED_ENV);
    // eslint-disable-next-line no-control-regex
    expect(out).toMatch(/\x1b\[/);
    expect(printedText(out)).toContain("un");
    expect(printedText(out)).toContain("deux");
  });

  it("paints NOTHING for a theme name the renderer does not hold: a typo does exactly what unset does", () => {
    // The near-miss the renderer itself would hide: its own lookup falls back to the DEFAULT PALETTE silently, and a
    // typoed name would paint the screen the operator never asked for. Falling to unpainted is what tells them.
    const out = renderDiagram(SOURCE, WIDTH, stateDir, undefined, {
      [MERMAID_THEME_ENV]: NEAR_MISS_THEME,
      [THEME_ENV]: DARK_BACKGROUND,
    });
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/\x1b\[/);
  });

  it("keys the cache on the THEME too, so a themed screen is never handed the plain drawing", () => {
    const painted = { theme: A_THEME, background: DARK_BACKGROUND } as const;
    expect(diagramCachePath(SOURCE, WIDTH, stateDir, painted)).not.toBe(diagramCachePath(SOURCE, WIDTH, stateDir));
  });

  it("keys the cache on the SIDE as well: one theme is two drawings, and neither may serve the other's screen", () => {
    const onDark = diagramCachePath(SOURCE, WIDTH, stateDir, { theme: A_THEME, background: DARK_BACKGROUND });
    const onLight = diagramCachePath(SOURCE, WIDTH, stateDir, { theme: A_THEME, background: LIGHT_BACKGROUND });
    expect(onLight).not.toBe(onDark);
  });

  it("MIRRORS the palette for a light terminal, the same drawing under different escapes", () => {
    const strip = (drawn: string): string => drawn.replace(ANSI_RE, "");
    const onDark = renderDiagram(SOURCE, WIDTH, stateDir, undefined, PAINTED_ENV);
    const onLight = renderDiagram(SOURCE, WIDTH, stateDir, undefined, {
      [MERMAID_THEME_ENV]: A_THEME,
      [THEME_ENV]: LIGHT_BACKGROUND,
    });
    expect(onLight).not.toBe(onDark);
    expect(strip(onLight)).toBe(strip(onDark)); // a side is a palette, never a layout
  });

  it("resolves the SIDE a paint is for from the host's own theme, and hands it to the renderer", () => {
    // Resolved from the same chain the ink adaptation reads (platform/theme.ts), and absent entirely where no theme
    // was asked for.
    expect(requestedPaint({ [MERMAID_THEME_ENV]: A_THEME, [THEME_ENV]: LIGHT_BACKGROUND })?.background).toBe(
      LIGHT_BACKGROUND
    );
    expect(requestedPaint(PAINTED_ENV)?.background).toBe(DARK_BACKGROUND);
    expect(requestedPaint({ [THEME_ENV]: LIGHT_BACKGROUND })).toBeUndefined();
  });

  it("DROPS a colour the source declares, the accepted cost of the unpainted render", () => {
    // Written down because it is a loss an author can hit: a linkStyle says something about the graph, and paint was
    // its only carrier. The drawing itself must still stand, the declaration consumed rather than printed as text.
    const drawn = renderDiagram(`${SOURCE}    linkStyle 0 stroke:#00cc00\n`, WIDTH, stateDir, undefined, NO_PAINT_ENV);
    expect(drawn).not.toContain("\x1b[38;2;0;204;0m");
    expect(printedText(drawn)).not.toContain("stroke");
    expect(printedText(drawn)).toContain("un");
  });

  it("ends on the drawing, never on the renderer's own trailing newline", () => {
    // The pipeline puts its own separator after a view's render. A newline left on here stacks with it and the diagram
    // floats a blank line above the prose below, which is what it did the first time it ran end to end.
    const out = renderDiagram(SOURCE, WIDTH, stateDir);
    expect(out).not.toMatch(/\n$/);
    expect(out.trimEnd()).toBe(out);
  });

  it("holds the drawing to the width it was given, so nothing folds at the terminal's hand", () => {
    const out = renderDiagram(SOURCE, WIDTH, stateDir);
    // COLUMNS, never code units: an escape sequence costs bytes and no screen space, so a byte count would pass a
    // drawing twice too wide for the terminal it was drawn for.
    for (const line of out.split("\n")) expect(printedWidth(line)).toBeLessThanOrEqual(WIDTH);
  });

  it("folds a WIDE drawing at that width and not at a console's default, which is what the binary could not do", () => {
    // The reference binary folds every drawing at its own console's width, whatever `--width` asked for, so a box drawn
    // for a terminal wider than that came back cut through its own frame. Proven with a graph laying out past the
    // default on purpose: the old path could not put a single column past it, and the new one fills the box.
    const chain = Array.from(
      { length: 6 },
      (_, i) => `    N${i}[etape numero ${i} du pipeline] --> N${i + 1}[suite]`
    ).join("\n");
    const out = renderDiagram(`flowchart LR\n${chain}\n`, BOX_WIDTH, stateDir);
    const widest = Math.max(...out.split("\n").map(printedWidth));
    expect(widest).toBeGreaterThan(CONSOLE_WIDTH);
    expect(widest).toBeLessThanOrEqual(BOX_WIDTH);
  });

  it("writes exactly one cache entry per source and width", () => {
    renderDiagram(SOURCE, WIDTH, stateDir);
    expect(cacheFiles()).toHaveLength(1);
    renderDiagram(SOURCE, WIDTH, stateDir);
    expect(cacheFiles()).toHaveLength(1); // the second call read the first one's file
    renderDiagram(SOURCE, OTHER_WIDTH, stateDir);
    expect(cacheFiles()).toHaveLength(2);
  });

  it("draws the source AS WRITTEN where no direction forces it", () => {
    // SOURCE says TD and 72 columns would take LR: the header stays the author's word, nothing flips on its own.
    const out = renderDiagram(SOURCE, WIDTH, stateDir);
    expect(onOneLine(out, "un", "deux")).toBe(false);
  });

  it("FORCES a direction by rewriting the header, byte for byte what the oriented twin draws", () => {
    const forced = renderDiagram(SOURCE, WIDTH, stateDir, WIDE);
    expect(onOneLine(forced, "un", "deux")).toBe(true);
    expect(renderDiagram(SOURCE.replace("TD", "LR"), WIDTH, stateDir)).toBe(forced);
  });

  it("measures BOTH footprints, and they say which way the graph spreads", () => {
    const sizes = measureDiagram(CHAIN, OTHER_WIDTH, stateDir);
    expect(sizes).toBeDefined();
    if (sizes === undefined) return;
    expect(sizes[WIDE].cols).toBeGreaterThan(sizes[TALL].cols);
    expect(sizes[TALL].lines).toBeGreaterThan(sizes[WIDE].lines);
  });

  it("measures through the CACHE, so forcing a direction after costs no third drawing", () => {
    measureDiagram(SOURCE, WIDTH, stateDir);
    expect(cacheFiles()).toHaveLength(2); // one per orientation
    renderDiagram(SOURCE, WIDTH, stateDir, TALL);
    expect(cacheFiles()).toHaveLength(2);
  });

  it("declines to measure what it would not arbitrate: BT stays the author's word", () => {
    const upward = "flowchart BT\n    A[un] --> B[deux]\n";
    expect(measureDiagram(upward, WIDTH, stateDir)).toBeUndefined();
    // Forcing declines the same way: the header is not rewritten, the drawing reads as written.
    expect(onOneLine(renderDiagram(upward, WIDTH, stateDir, WIDE), "un", "deux")).toBe(false);
  });

  it("does not read a LABEL spelling a direction as the header, anchored as it is to a line's start", () => {
    // The near-miss: `graph LR` sitting in a node's text. A match there would rewrite the label, not the graph.
    const out = renderDiagram("flowchart BT\n    A[graph LR] --> B[deux]\n", WIDTH, stateDir, WIDE);
    expect(onOneLine(out, "graph LR", "deux")).toBe(false);
  });

  it("THROWS on an empty source, which the renderer answers with nothing at all", () => {
    expect(() => renderDiagram("", WIDTH, stateDir)).toThrow();
  });

  it("THROWS where the renderer is perfectly happy having drawn nothing, which is prose handed to it", () => {
    // The guard this module adds, and it earns its place here: ordinary prose is no error to the renderer and comes
    // back blank. Without the guard the view would draw a void, where a throw reaches the caller's fail-open and puts
    // the block's own text back on screen.
    expect(() => renderDiagram("ceci est une phrase, pas un diagramme.\n", WIDTH, stateDir)).toThrow();
  });

  it("THROWS on a type the renderer does not know, so the fence shows instead of boxes of its syntax", () => {
    // The version-skew seam: a sankey-beta is a real diagram to a newer mermaid and NOTHING to this renderer, whose
    // fallback would draw its data lines as flowchart nodes. declaredType is the renderer's own word on what it holds.
    expect(() => renderDiagram("sankey-beta\nAmont,Aval,30\n", WIDTH, stateDir)).toThrow();
  });

  it("does NOT fail open on malformed syntax of a KNOWN type: the renderer draws it, and that is the known hole", () => {
    // Written down because it is the one failure this chain cannot catch. A broken graph comes back as boxes of
    // nonsense, so a reader gets garbage on the terminal rather than the readable source. It costs nothing in the
    // transcript, where the block keeps its own text and renders natively. Any future guard belongs HERE, and this
    // case is what would turn red when one lands.
    const drawn = renderDiagram("flowchart TD\n    A[ --> B]]] {{{\n", WIDTH, stateDir);
    expect(drawn.trim()).not.toBe("");
  });
});
