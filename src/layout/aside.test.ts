// The @aside region, driven through the RENDER ENTRY at fixed widths.
//
// Width is a NUMBER in the options (first in the resolution order, platform/
// tty-width.ts), so no env var, no ps-probe and no terminal can reach a single
// assertion below: the two widths this file names are the two the region has to
// behave differently at, and they are named here rather than found at runtime.
//
// The fixtures live in a temp dir handed in as the search path, so nothing here
// depends on the package's own views/ or on a project's.

import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderView, ANSI_RE } from "../index.js";
import { ASIDE_GUTTER, ASIDE_MIN_MAIN } from "./aside.js";
import { BOX_CHROME } from "./box.js";
import { printedWidth } from "./measure.js";

// Raw ANSI art, the thing the region exists to carry: a colour sequence, then cells
// whose TRANSPARENT pixels are spaces. Those spaces are exactly what the wrapper
// breaks on, and the language has no bypass mark, so a row reaching the screen whole
// is a real claim about the composition rather than about a flag.
//
// The escape is built from a char code rather than typed, exactly as marks.ts builds
// its own: a control character living in a source file has already been mangled by an
// editing pass once, and the whole point of these fixtures is that their bytes are real.
const ESC = String.fromCharCode(27);
const ART_WIDTH = 10;
const artRow = (glyph: string): string =>
  `${ESC}[38;2;239;140;62m${(glyph + " ").repeat(5)}${ESC}[0m`;
const ART = ["▀", "▄", "▀", "▄", "▀"].map(artRow);
const SHORT_ART = ["▀", "▄"].map(artRow);
const UPPER = "▀";
const LOWER = "▄";

// Both widths are BOX CEILINGS. At 80 the main column gets 80 - 4 - 10 - 5 = 61
// printed columns and the region composes; at 58 it would get 39, one under the
// floor, and the column goes. The arithmetic is spelled from the constants so a
// change to either one fails here instead of drifting silently.
const FITS = 80;
const NARROW = 58;
const contentWidth = (limit: number): number => limit - BOX_CHROME;
const mainWidth = (limit: number): number => contentWidth(limit) - ART_WIDTH - ASIDE_GUTTER;

// Long enough to need more than the main column, short enough to fit the box: the
// one shape that tells "full width" and "inside the region" apart on sight.
const ABOVE = "ABOVE a line long enough to need more than the main column can give it";
const BELOW = "BELOW the region, the flow returns to the whole width of the box content";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-aside-"));
const write = (name: string, lines: string[]): void =>
  fs.writeFileSync(path.join(dir, name + ".view"), [...lines, ""].join("\n"));

write("art", ART);
write("short", SHORT_ART);
write("region", [
  "@box",
  "@head ASIDE",
  ABOVE,
  "@aside art",
  "ONE the region's first line",
  "",
  "TWO after a breathing line",
  "@endaside",
  BELOW,
  "@endbox",
]);
write("tall", ["@box", "@aside art", "M1", "M2", "@endaside", "@endbox"]);
write("tall-top", ["@box", "@aside art top", "M1", "M2", "@endaside", "@endbox"]);
write("tall-bottom", ["@box", "@aside art bottom", "M1", "M2", "@endaside", "@endbox"]);
write("wide-flow", [
  "@box",
  "@aside short",
  "M1",
  "M2",
  "M3",
  "M4",
  "M5",
  "@endaside",
  "@endbox",
]);
write("missing", [
  "@box",
  "@aside nowhere-on-the-path",
  "ONLY the main flow, and the box still stands",
  "@endaside",
  "@endbox",
]);

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const render = (name: string, width: number): string =>
  renderView(name, {}, [dir], undefined, { width });

const rows = (out: string): string[] => out.replace(ANSI_RE, "").split("\n");
// A framed line carries two borders; a line the region composed carries the
// separator between them, so counting bars is what tells the two apart.
const bars = (line: string): number => (line.match(/│/g) ?? []).length;
const regionRows = (out: string): string[] => rows(out).filter((l) => bars(l) === 3);
const rowWith = (out: string, text: string): string[] =>
  rows(out).filter((l) => l.includes(text));

describe("a region at a width that fits both columns", () => {
  const out = render("region", FITS);

  it("keeps the lines outside the region at the full content width, on one row", () => {
    // Wider than the main column, narrower than the content: one row each proves
    // the flow above and below the region never entered it.
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
    // The breathing line between the two sections: the box collapses blank runs,
    // and this one survives only because it carries the art and the separator.
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
    // Two art rows, five flow lines: same three rows to spend, same distribution,
    // this time on the picture.
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

describe("an aside naming a view that resolves nowhere", () => {
  const out = render("missing", FITS);

  it("degrades to the full-width main flow instead of failing the block", () => {
    expect(out).toContain("╭");
    expect(out).toContain("╰");
    expect(rowWith(out, "ONLY the main flow, and the box still stands")).toHaveLength(1);
    expect(regionRows(out)).toHaveLength(0);
  });
});
