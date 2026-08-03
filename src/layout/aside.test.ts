// The @aside region, driven through the RENDER ENTRY at fixed widths.
//
// Width is a NUMBER in the options, first in the resolution order, so no env var, no ps-probe and no terminal can reach
// an assertion below. The fixtures live in a temp dir handed in as the search path, so nothing here depends on a real
// views/ either.

import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderView, ANSI_RE } from "../index.js";
import { ASIDE_GUTTER, ASIDE_MIN_MAIN, asideMainWidth } from "./aside.js";
import { BOX_CHROME } from "./box.js";
import { printedWidth } from "./measure.js";

// Raw ANSI art: a colour sequence, then cells whose TRANSPARENT pixels are spaces. Those spaces are what the wrapper
// breaks on and the language has no bypass mark, so a row reaching the screen whole is a claim about the composition
// rather than about a flag.
//
// The escape is built from a char code rather than typed: a control character in a source file has been mangled by an
// editing pass once, and these fixtures live on their bytes.
const ESC = String.fromCharCode(27);
const ART_WIDTH = 10;
const artRow = (glyph: string): string =>
  `${ESC}[38;2;239;140;62m${(glyph + " ").repeat(5)}${ESC}[0m`;
const ART = ["▀", "▄", "▀", "▄", "▀"].map(artRow);
const SHORT_ART = ["▀", "▄"].map(artRow);
const UPPER = "▀";
const LOWER = "▄";

// Both widths are BOX CEILINGS. At 80 the main column gets 80 - 4 - 10 - 5 = 61 printed columns and the region
// composes; at 58 it would get 39, one under the floor, and the column goes. The arithmetic is spelled from the
// constants so a change to either one fails here instead of drifting silently.
const FITS = 80;
const NARROW = 58;
const contentWidth = (limit: number): number => limit - BOX_CHROME;
const mainWidth = (limit: number): number => contentWidth(limit) - ART_WIDTH - ASIDE_GUTTER;

// Long enough to need more than the main column, short enough to fit the box: the one shape that tells "full width" and
// "inside the region" apart on sight.
const ABOVE = "ABOVE a line long enough to need more than the main column can give it";
const BELOW = "BELOW the region, the flow returns to the whole width of the box content";

import { ASIDE, BOX, ENDASIDE, ENDBOX, HEAD, USE } from "../data/language.js";
import { SCRATCH_DIR, VIEW_EXT } from "../data/markup.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${SCRATCH_DIR}-aside-`));
const write = (name: string, lines: string[]): void =>
  fs.writeFileSync(path.join(dir, name + VIEW_EXT), [...lines, ""].join("\n"));

write("art", ART);
write("short", SHORT_ART);
write("region", [
  BOX,
  `${HEAD} ASIDE`,
  ABOVE,
  `${ASIDE} art`,
  "ONE the region's first line",
  "",
  "TWO after a breathing line",
  ENDASIDE,
  BELOW,
  ENDBOX,
]);
write("tall", [BOX, `${ASIDE} art`, "M1", "M2", ENDASIDE, ENDBOX]);
write("tall-top", [BOX, `${ASIDE} art top`, "M1", "M2", ENDASIDE, ENDBOX]);
write("tall-bottom", [BOX, `${ASIDE} art bottom`, "M1", "M2", ENDASIDE, ENDBOX]);
write("wide-flow", [
  BOX,
  `${ASIDE} short`,
  "M1",
  "M2",
  "M3",
  "M4",
  "M5",
  ENDASIDE,
  ENDBOX,
]);
write("missing", [
  BOX,
  `${ASIDE} nowhere-on-the-path`,
  "ONLY the main flow, and the box still stands",
  ENDASIDE,
  ENDBOX,
]);
// A BOX inside a region: a border is the one thing here that cannot survive being cut to size after the fact.
write("inner-box", [BOX, `${HEAD} INCLUDED`, "a line the included view drew", ENDBOX]);
write("nested", [BOX, `${ASIDE} art`, `${USE} inner-box`, ENDASIDE, ENDBOX]);

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const render = (name: string, width: number): string =>
  renderView(name, {}, [dir], undefined, { width });

const rows = (out: string): string[] => out.replace(ANSI_RE, "").split("\n");
// A framed line carries two borders; a line the region composed carries the separator between them, so counting bars is
// what tells the two apart. The glyph is spelled here because box.ts keeps its own private.
const BAR_RE = /│/g;
const CORNER_OPEN = "╭";
const CORNER_CLOSE = "╮";
const FRAME_BARS = 2;
const REGION_BARS = FRAME_BARS + 1;
const bars = (line: string): number => (line.match(BAR_RE) ?? []).length;
const regionRows = (out: string): string[] => rows(out).filter((l) => bars(l) === REGION_BARS);
const rowWith = (out: string, text: string): string[] =>
  rows(out).filter((l) => l.includes(text));

describe("a region at a width that fits both columns", () => {
  const out = render("region", FITS);

  it("keeps the lines outside the region at the full content width, on one row", () => {
    // Wider than the main column, narrower than the content: one row each proves the flow above and below the region
    // never entered it.
    expect(printedWidth(ABOVE)).toBeGreaterThan(mainWidth(FITS));
    expect(printedWidth(ABOVE)).toBeLessThanOrEqual(contentWidth(FITS));
    expect(rowWith(out, "ABOVE")).toHaveLength(1);
    expect(rowWith(out, "BELOW")).toHaveLength(1);
    expect(bars(rowWith(out, "ABOVE")[0])).toBe(2);
    expect(bars(rowWith(out, "BELOW")[0])).toBe(2);
  });

  it("puts no aside content outside the region", () => {
    expect(rowWith(out, "ABOVE")[0]).not.toContain(UPPER);
    expect(rowWith(out, "BELOW")[0]).not.toContain(UPPER);
  });

  it("carries the aside row, the separator and the main line on every region line", () => {
    expect(regionRows(out)).toHaveLength(ART.length);
    expect(rowWith(out, "ONE the region's first line")).toHaveLength(1);
    expect(rowWith(out, "TWO after a breathing line")).toHaveLength(1);
    expect(bars(rowWith(out, "ONE the region's first line")[0])).toBe(3);
    expect(bars(rowWith(out, "TWO after a breathing line")[0])).toBe(3);
  });

  it("keeps a blank main-flow line, because the composed line is no longer empty", () => {
    // The breathing line between the two sections: the box collapses blank runs, and this one survives only because it
    // carries the art and the separator.
    const region = regionRows(out);
    const one = region.findIndex((l) => l.includes("ONE"));
    const two = region.findIndex((l) => l.includes("TWO"));
    expect(one).toBeGreaterThanOrEqual(0);
    expect(two).toBe(one + 2);
  });
});

describe("a region at a width that starves the main column", () => {
  const out = render("region", NARROW);

  it("is one under the floor, which is what makes this the drop case", () => {
    expect(mainWidth(NARROW)).toBe(ASIDE_MIN_MAIN - 1);
  });

  it("drops the aside and its separator entirely", () => {
    expect(out).not.toContain(UPPER);
    expect(out).not.toContain(LOWER);
    expect(regionRows(out)).toHaveLength(0);
  });

  it("gives the main flow the full content width and overruns nothing", () => {
    expect(rowWith(out, "ONE the region's first line")).toHaveLength(1);
    expect(rowWith(out, "TWO after a breathing line")).toHaveLength(1);
    for (const line of rows(out)) {
      expect(printedWidth(line)).toBeLessThanOrEqual(NARROW);
    }
  });
});

describe("the shorter column, padded against the region", () => {
  const indexOf = (out: string, text: string): number =>
    regionRows(out).findIndex((l) => l.includes(text));

  it("centres by default, with the odd padding row BELOW", () => {
    // Five art rows, two flow lines: three rows to spend, one above and two below.
    const out = render("tall", FITS);
    expect(regionRows(out)).toHaveLength(ART.length);
    expect(indexOf(out, "M1")).toBe(1);
    expect(indexOf(out, "M2")).toBe(2);
  });

  it("goes flush to the top when the region declares it", () => {
    const out = render("tall-top", FITS);
    expect(indexOf(out, "M1")).toBe(0);
    expect(indexOf(out, "M2")).toBe(1);
  });

  it("goes flush to the bottom when the region declares it", () => {
    const out = render("tall-bottom", FITS);
    expect(indexOf(out, "M1")).toBe(3);
    expect(indexOf(out, "M2")).toBe(4);
  });

  it("pads the ASIDE column when the flow is the taller one", () => {
    // Two art rows, five flow lines: same three rows to spend, same distribution, this time on the picture.
    const out = render("wide-flow", FITS);
    const region = regionRows(out);
    expect(region).toHaveLength(5);
    expect(region.map((l) => l.includes(UPPER) || l.includes(LOWER))).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
  });
});

describe("the art itself", () => {
  const out = render("region", FITS);

  it("reaches the screen verbatim: not wrapped, not split, not restyled", () => {
    for (const row of ART) expect(out).toContain(row);
  });

  it("holds the separator on one printed column for the whole region", () => {
    const columns = new Set(regionRows(out).map((l) => l.indexOf("│", 1)));
    expect(columns.size).toBe(1);
    expect([...columns][0]).toBe(2 + ART_WIDTH + 2);
  });
});

describe("the width the main column gets", () => {
  it("is the number the composition actually lays the flow out to", () => {
    expect(asideMainWidth(ART, contentWidth(FITS))).toBe(mainWidth(FITS));
  });

  it("hands the whole content back wherever the aside is dropped", () => {
    expect(asideMainWidth([], contentWidth(FITS))).toBe(contentWidth(FITS));
    expect(mainWidth(NARROW)).toBeLessThan(ASIDE_MIN_MAIN);
    expect(asideMainWidth(ART, contentWidth(NARROW))).toBe(contentWidth(NARROW));
  });
});

describe("a region whose body INCLUDES a view that draws a box", () => {
  const out = render("nested", FITS);

  it("draws that box at the width of the column, its border whole on one row", () => {
    // Over EVERY corner rather than the inner one alone, so the outer frame answers here too.
    const opens = rows(out).filter((l) => l.includes(CORNER_OPEN));
    expect(opens).toHaveLength(2);
    for (const line of opens) expect(line).toContain(CORNER_CLOSE);
  });

  it("puts the included view's own content beside the art and not under it", () => {
    expect(rowWith(out, "a line the included view drew")).toHaveLength(1);
    expect(rowWith(out, "INCLUDED")).toHaveLength(1);
  });
});

describe("an aside naming a view that resolves nowhere", () => {
  const out = render("missing", FITS);

  it("degrades to the full-width main flow instead of failing the block", () => {
    expect(out).toContain("╭");
    expect(out).toContain("╰");
    expect(rowWith(out, "ONLY the main flow, and the box still stands")).toHaveLength(1);
    expect(regionRows(out)).toHaveLength(0);
  });
});
