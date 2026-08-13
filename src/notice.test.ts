// What the notice kit owes its callers: a box that is SQUARE whatever the rows carry, because the one reason this kit
// exists is the measure (ANSI discounted, wide glyphs counted double). A crooked box is worse than none: it reads as a
// broken tool exactly where the host is trying to look trustworthy.

import { describe, it, expect } from "vitest";
import { middleEllipsis, notice } from "./notice.js";
import { displayWidth } from "./layout/width.js";
import { sgr, RESET } from "@tayomi/utils";

/** Any accent tells the story; this is the bold orange the mixed-fleet warning wears. */
const ACCENT = sgr("1;38;5;208");


/** The box's left rail, the column every row stands behind. */
const RAIL = "│ ";

/** A line's visible length: what the terminal shows, escapes discounted, wide glyphs counted double. */
const visibleLength = (line: string): number => displayWidth(line.replace(/\x1b\[[0-9;]*m/g, ""));

describe("notice", () => {
  it("draws the header above one closed box, rows in written order behind the rail", () => {
    const drawn = notice("HEAD", ["first", "second"]);
    const lines = drawn.split("\n");
    expect(lines[0]).toBe("HEAD");
    expect(lines[1].startsWith("╭") && lines[1].endsWith("╮")).toBe(true);
    expect(lines[2]).toBe(`${RAIL}first  │`);
    expect(lines[3]).toBe(`${RAIL}second │`);
    expect(lines[4].startsWith("╰") && lines[4].endsWith("╯")).toBe(true);
  });

  it("is SQUARE whatever the rows carry: every line pads to the same visible width, escapes discounted", () => {
    // The one reason the kit exists. A short accented row and a long plain one must land their │ in one column.
    const drawn = notice("HEAD", [`${ACCENT}short${RESET}`, "a longer plain row"]);
    const lines = drawn.split("\n").slice(1);
    const widths = new Set(lines.map(visibleLength));
    expect(widths.size).toBe(1);
    for (const line of lines.slice(1, -1)) expect(line.endsWith("│")).toBe(true);
  });

  it("counts a wide glyph as the two columns it prints", () => {
    const drawn = notice("HEAD", [`${ACCENT}漢字漢字${RESET}`, "12345678"]);
    const lines = drawn.split("\n");
    // Both rows fill the box exactly: 漢字漢字 prints eight columns, as the digits do.
    expect(visibleLength(lines[2])).toBe(visibleLength(lines[3]));
    expect(visibleLength(lines[1])).toBe(displayWidth("漢字漢字") + RAIL.length + " │".length);
  });

  it("draws a null row as the divider between facts and the call to action", () => {
    const drawn = notice("HEAD", ["fact", null, "act"]);
    expect(drawn.split("\n")[3].startsWith("├")).toBe(true);
  });

  it("leaves a rowless notice as its header alone: a frame around nothing dresses nothing", () => {
    expect(notice("HEAD", [])).toBe("HEAD");
    expect(notice("HEAD", [null])).toBe("HEAD");
  });
});

describe("middleEllipsis", () => {
  const PATH = "/Users/someone/very/deep/project/node_modules/@scope/pkg/dist/platform/peers.js";

  it("folds the MIDDLE and keeps both identifying ends, marked in plain ASCII dots", () => {
    // ASCII on purpose: the one-char "…" is ambiguous-width, and a host drawing it wide snaps a closed box's border.
    const folded = middleEllipsis(PATH, 40);
    expect(folded.length).toBe(40);
    expect(folded.startsWith("/Users/someone")).toBe(true);
    expect(folded.endsWith("peers.js")).toBe(true);
    expect(folded).toContain("...");
    expect(folded).not.toContain("…");
  });

  it("leaves what already fits exactly as written", () => {
    expect(middleEllipsis("short", 40)).toBe("short");
    expect(middleEllipsis(PATH, PATH.length)).toBe(PATH);
  });

  it("returns the text WHOLE under a budget too small to fold into: wide beats meaningless", () => {
    expect(middleEllipsis(PATH, 2)).toBe(PATH);
  });
});
