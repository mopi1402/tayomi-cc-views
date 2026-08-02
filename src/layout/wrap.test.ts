// Wrapping a RENDERED line, which is not wrapping a string.
//
// The line already carries markup that costs no column, so every case here is one the naive split gets wrong: a tag cut
// in two, a code span left open, a bullet reprinted on every continuation, a wide glyph halved. The continuation's
// prefix is the other half of the module: a wrapped remainder has to read as the same section, which means keeping the
// gutter bar and blanking everything before it.

import { describe, it, expect } from "vitest";
import { RESET_MARK, RESUME_MARK, SPAN_MARK, chip, tagMark } from "../style.js";
import { HANG_MARK } from "./marks.js";
import { printedWidth } from "./measure.js";
import { wrapLine } from "./wrap.js";

/** The section bar a template draws down its left margin; wrap.ts keeps it private. */
const BAR = "▎";
const TICK = "`";
const LIMIT = 20;
/** Under this the module refuses to wrap at all, rather than shred a line. */
const TOO_NARROW = 7;

const fits = (rows: string[], limit: number): boolean =>
  rows.every((r) => printedWidth(r) <= limit);

describe("when it declines to wrap", () => {
  it("leaves a line that already fits", () => {
    expect(wrapLine("short", LIMIT)).toEqual(["short"]);
  });

  it("leaves a line whole under a limit too narrow to be worth wrapping into", () => {
    const long = "far too long for this limit";
    expect(wrapLine(long, TOO_NARROW)).toEqual([long]);
  });

  it("leaves a line whose prefix eats the whole column, rather than emit letters", () => {
    const deep = " ".repeat(LIMIT - 2) + "some text that will not fit";
    expect(wrapLine(deep, LIMIT)).toEqual([deep]);
  });
});

describe("the fill", () => {
  it("breaks at a space, never inside a word", () => {
    const rows = wrapLine("alpha beta gamma delta", LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(fits(rows, LIMIT)).toBe(true);
    expect(rows.join(" ").split(/\s+/).filter(Boolean)).toEqual([
      "alpha",
      "beta",
      "gamma",
      "delta",
    ]);
  });

  it("hard-splits a token wider than the whole column, which must break somewhere", () => {
    const path = "a".repeat(LIMIT * 2);
    const rows = wrapLine(path, LIMIT);
    expect(fits(rows, LIMIT)).toBe(true);
    expect(rows.join("")).toBe(path);
  });

  it("keeps every glyph of a wide script whole", () => {
    const rows = wrapLine("仕様".repeat(20), LIMIT);
    expect(fits(rows, LIMIT)).toBe(true);
    expect(rows.join("")).not.toContain("�");
  });

  it("charges nothing for a tag, so a coloured line wraps at the same word", () => {
    const plain = "alpha beta gamma delta";
    const dressed = `${tagMark("b")}alpha${RESET_MARK} beta gamma delta`;
    const rows = wrapLine(dressed, LIMIT);
    expect(rows).toHaveLength(wrapLine(plain, LIMIT).length);
    expect(rows[0]).toContain(tagMark("b"));
  });

  it("charges nothing for a resume either, so no break point moves behind one", () => {
    const shed = (rows: string[], mark: string): string[] =>
      rows.map((r) => r.split(mark).join(""));
    const closed = `${tagMark("b")}alpha${RESET_MARK} beta gamma delta`;
    const resumed = `${tagMark("b")}alpha${RESUME_MARK} beta gamma delta`;
    expect(shed(wrapLine(resumed, LIMIT), RESUME_MARK)).toEqual(
      shed(wrapLine(closed, LIMIT), RESET_MARK)
    );
  });

  it("charges nothing for a resume on a row that is already FULL", () => {
    // The case the comparison above cannot see: it sheds the mark from both sides, so a mark costing a column would
    // only show where the row has no slack left to hide it.
    const full = "a".repeat(LIMIT);
    expect(wrapLine(`${full}${RESUME_MARK} b`, LIMIT)).toEqual([`${full}${RESUME_MARK}`, " b"]);
  });
});

describe("a code span the wrap cuts", () => {
  it("is closed on the first row and reopened on the next", () => {
    const rows = wrapLine(`text ${TICK}one two three four${TICK} tail`, LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      // An odd count would leave the terminal with an orphan delimiter.
      expect([...row].filter((c) => c === TICK).length % 2).toBe(0);
    }
  });
});

describe("the continuation's prefix", () => {
  it("keeps a plain indent, so a nested line stays nested", () => {
    const indent = "    ";
    const rows = wrapLine(indent + "alpha beta gamma delta epsilon", LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((r) => r.startsWith(indent))).toBe(true);
  });

  it("keeps the gutter bar and BLANKS the label before it", () => {
    const rows = wrapLine(`CHECKS ${BAR} alpha beta gamma delta`, LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]).toContain("CHECKS");
    expect(rows[1]).toContain(BAR);
    expect(rows[1]).not.toContain("CHECKS");
    // Blanked to the same width, so the bars line up in one column.
    expect(rows[1].indexOf(BAR)).toBe(rows[0].indexOf(BAR));
  });

  it("keeps the bar's own colour on the continuation", () => {
    const dressed = `${tagMark("dim")}${BAR}${RESET_MARK} alpha beta gamma delta`;
    const rows = wrapLine(dressed, LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[1]).toContain(tagMark("dim"));
  });

  it("keeps BOTH ends of a span in the prefix, the boundary as much as the terminator", () => {
    // A real chip sitting in the label, asked of the module that builds one. Drop the terminator and the fill runs on,
    // painting every continuation row out to the border. Drop the boundary and the terminator that survives it unwinds
    // the ROW's own tags instead of the chip's. Neither weighs a column, which is why these are cases and not notes:
    // nothing the measurer sees would ever report the loss. The chip sits AFTER a word, so neither mark is alone at the
    // edge of a part. A keep-list that splits on one and tests for the other would pass on an isolated mark and blank
    // this one, which is where a real label puts it.
    const dressed = `run ${chip("b", "OK")} ${BAR} alpha beta gamma delta`;
    const rows = wrapLine(dressed, LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[1]).toContain(SPAN_MARK);
    expect(rows[1]).toContain(tagMark("b"));
    expect(rows[1]).toContain(RESUME_MARK);
  });

  it("stops at the LAST bar, so a two-bar line hangs from the inner one", () => {
    const rows = wrapLine(`${BAR} LABEL ${BAR} alpha beta gamma delta`, LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect([...rows[1]].filter((c) => c === BAR)).toHaveLength(2);
    expect(rows[1]).not.toContain("LABEL");
  });
});

describe("a declared bullet", () => {
  const bulleted = (marker: string, text: string): string => marker + HANG_MARK + text;

  it("is consumed: the marker never reaches the screen", () => {
    const rows = wrapLine(bulleted("- ", "alpha beta gamma delta"), LIMIT);
    expect(rows.join("\n")).not.toContain(HANG_MARK);
  });

  it("prints once, and the continuation hangs under the text rather than repeating it", () => {
    const MARKER = "* ";
    const rows = wrapLine(bulleted(MARKER, "alpha beta gamma delta"), LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].startsWith(MARKER)).toBe(true);
    expect(rows[1].startsWith(" ".repeat(MARKER.length))).toBe(true);
    expect(rows.filter((r) => r.includes(MARKER))).toHaveLength(1);
  });

  it("wins over the inferred prefix, so a bullet AFTER a bar is not left in the text", () => {
    const rows = wrapLine(bulleted(`${BAR} - `, "alpha beta gamma delta"), LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[1]).toContain(BAR);
    expect(rows[1]).not.toContain("-");
  });
});
