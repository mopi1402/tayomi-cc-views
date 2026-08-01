// The @box frame: the one thing a template cannot express, because the width of the
// top rule depends on every line the body has not produced yet.
//
// The invariant every case below re-checks is that ALL rows print the same width. A box
// is the most visible thing on screen and the least forgiving: one row off by a column
// and the border is visibly broken, so the arithmetic is asserted rather than eyeballed.

import { describe, it, expect } from "vitest";
import { RESET_MARK, tagMark } from "../style.js";
import { RULE_MARK } from "./marks.js";
import { BOX_CHROME, collapseBlanks, frameBox } from "./box.js";
import { printedWidth } from "./measure.js";

const DASH = "─";
const TL = "╭";
const TR = "╮";
const BL = "╰";
const BR = "╯";
const LIMIT = 40;
const NO_TONE = undefined;

/** Every row of a frame prints the same width, or the border is ragged. */
const oneWidth = (rows: string[]): number => {
  const widths = new Set(rows.map(printedWidth));
  expect([...widths]).toHaveLength(1);
  return [...widths][0];
};

const plain = (rows: string[]): string => rows.join("\n");

describe("collapseBlanks", () => {
  it("drops the blanks leading and trailing the body", () => {
    expect(collapseBlanks(["", "", "a", "b", "", ""])).toEqual(["a", "b"]);
  });

  it("collapses a run between two sections to a single separator", () => {
    expect(collapseBlanks(["a", "", "", "", "b"])).toEqual(["a", "", "b"]);
  });

  it("keeps a rule BETWEEN two lines that printed", () => {
    expect(collapseBlanks(["a", RULE_MARK, "b"])).toEqual(["a", RULE_MARK, "b"]);
  });

  it("drops a rule with nothing above it: a one-half section needs no division", () => {
    expect(collapseBlanks([RULE_MARK, "b"])).toEqual(["b"]);
  });

  it("drops a rule with nothing below it", () => {
    expect(collapseBlanks(["a", RULE_MARK])).toEqual(["a"]);
  });

  it("drops a rule against a blank, and leaves the blank doing the separating", () => {
    expect(collapseBlanks(["a", "", RULE_MARK, "b"])).toEqual(["a", "", "b"]);
    expect(collapseBlanks(["a", RULE_MARK, "", "b"])).toEqual(["a", "", "b"]);
  });

  it("keeps one of two adjacent rules, never a double division", () => {
    expect(collapseBlanks(["a", RULE_MARK, RULE_MARK, "b"])).toEqual(["a", RULE_MARK, "b"]);
  });
});

describe("the frame", () => {
  it("opens and closes on its corners", () => {
    const rows = frameBox("", "", ["content"], [], NO_TONE, LIMIT);
    expect(rows[0].includes(TL) && rows[0].includes(TR)).toBe(true);
    const last = rows[rows.length - 1];
    expect(last.includes(BL) && last.includes(BR)).toBe(true);
  });

  it("prints every row at one width", () => {
    const rows = frameBox("title", "", ["short", "a much longer line here"], [], NO_TONE, LIMIT);
    oneWidth(rows);
  });

  it("sizes to its CONTENT, so a one-line block stays one line wide", () => {
    const text = "narrow";
    const rows = frameBox("", "", [text], [], NO_TONE, LIMIT);
    expect(oneWidth(rows)).toBe(text.length + BOX_CHROME);
  });

  it("never lets the body push past the limit: a long line wraps inside the frame", () => {
    const rows = frameBox("", "", ["word ".repeat(40)], [], NO_TONE, LIMIT);
    expect(oneWidth(rows)).toBeLessThanOrEqual(LIMIT);
    expect(rows.length).toBeGreaterThan(4); // it grew downwards, not sideways
  });

  it("still draws a box for an empty body", () => {
    const rows = frameBox("", "", [], [], NO_TONE, LIMIT);
    oneWidth(rows);
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });
});

describe("the head and the badge", () => {
  const HEAD = "payments deploy";
  const BADGE = "staging";

  it("puts the head on the row under the top rule", () => {
    const rows = frameBox(HEAD, "", ["body"], [], NO_TONE, LIMIT);
    expect(rows[1]).toContain(HEAD);
    expect(rows[0]).not.toContain(HEAD);
  });

  it("sets the badge INTO the top rule, and keeps the row at one width", () => {
    const rows = frameBox(HEAD, BADGE, ["body"], [], NO_TONE, LIMIT);
    expect(rows[0]).toContain(BADGE);
    oneWidth(rows);
  });

  it("widens the box for a badge longer than the content, rather than clip it", () => {
    const long = "a-very-long-environment-name";
    const rows = frameBox("", long, ["x"], [], NO_TONE, LIMIT);
    expect(rows[0]).toContain(long);
    expect(oneWidth(rows)).toBeGreaterThan(long.length);
  });

  it("widens the box for a head longer than the content", () => {
    const long = "a head longer than the body";
    const rows = frameBox(long, "", ["x"], [], NO_TONE, LIMIT);
    expect(oneWidth(rows)).toBe(long.length + BOX_CHROME);
  });

  it("runs the top rule unbroken with no badge, leaving no gap in the border", () => {
    const rows = frameBox("", "", ["body"], [], NO_TONE, LIMIT);
    expect(rows[0]).not.toContain(`${TL} `);
  });
});

describe("an inner rule", () => {
  const LABEL = "CHECKS";

  it("keeps its prefix, and the marker never reaches the screen", () => {
    const rows = frameBox("", "", ["above", RULE_MARK + LABEL, "below"], [], NO_TONE, LIMIT);
    expect(rows.find((r) => r.includes(LABEL))).toBeDefined();
    expect(plain(rows)).not.toContain(RULE_MARK);
  });

  it("holds the frame's width when a body line is wider than the prefix", () => {
    const wide = "a line wider than the label";
    oneWidth(frameBox("", "", [wide, RULE_MARK + LABEL, wide], [], NO_TONE, LIMIT));
  });

  it("holds its width with no prefix at all", () => {
    oneWidth(frameBox("", "", ["above", RULE_MARK, "below"], [], NO_TONE, LIMIT));
  });

  // The regression this section exists for. A rule row spends its prefix, then a gap and
  // at least one dash into the border, so a frame sized on the prefix ALONE is one column
  // short and that single row breaks the outline. It only shows when the rule is the
  // widest line, which is why rendering real views never caught it.
  describe("when the rule is the WIDEST line in the box", () => {
    const narrow = ["ab", RULE_MARK + LABEL, "cd"];

    it("holds the frame's width", () => {
      oneWidth(frameBox("", "", narrow, [], NO_TONE, LIMIT));
    });

    it("widens the frame to fit the row the rule will draw, not merely its prefix", () => {
      const width = oneWidth(frameBox("", "", narrow, [], NO_TONE, LIMIT));
      expect(width).toBeGreaterThan(LABEL.length + BOX_CHROME);
    });

    it("keeps a dash on the row: the rule still reads as a rule", () => {
      const rows = frameBox("", "", narrow, [], NO_TONE, LIMIT);
      const ruled = rows.find((r) => r.includes(LABEL)) as string;
      expect(ruled).toContain(DASH);
    });

    it("holds its width with no prefix, where the row spends no gap", () => {
      oneWidth(frameBox("", "", ["ab", RULE_MARK, "cd"], [], NO_TONE, LIMIT));
    });

    it("holds its width when the prefix carries a tag, measured on what it PRINTS", () => {
      const dressed = `${tagMark("dim")}${LABEL}${RESET_MARK}`;
      oneWidth(frameBox("", "", ["ab", RULE_MARK + dressed, "cd"], [], NO_TONE, LIMIT));
    });

    it("holds its width against a head and a badge that do not outrun it", () => {
      oneWidth(frameBox("hd", "bg", narrow, [], NO_TONE, LIMIT));
    });

    it("holds its width when the FOOT zone is the widest instead", () => {
      oneWidth(frameBox("", "", narrow, ["a foot line wider than the rule"], NO_TONE, LIMIT));
    });

    it("still sizes to the CONTENT when a body line outruns the rule", () => {
      const wide = "a line wider than the label";
      const rows = frameBox("", "", [wide, RULE_MARK + LABEL], [], NO_TONE, LIMIT);
      expect(oneWidth(rows)).toBe(wide.length + BOX_CHROME);
    });
  });
});

describe("the foot zone", () => {
  const FOOT = "the cause, stated last";

  it("sits under its own rule, below everything the body holds", () => {
    const rows = frameBox("", "", ["body"], [FOOT], NO_TONE, LIMIT);
    const foot = rows.findIndex((r) => r.includes(FOOT));
    const body = rows.findIndex((r) => r.includes("body"));
    expect(foot).toBeGreaterThan(body);
    oneWidth(rows);
  });

  it("adds nothing at all when the block never set the field", () => {
    const rows = frameBox("", "", ["body"], [], NO_TONE, LIMIT);
    expect(rows).toHaveLength(frameBox("", "", ["body"], [], NO_TONE, LIMIT).length);
    expect(plain(rows)).not.toContain(FOOT);
  });

  it("carries the tone on its TEXT, not merely on the border beside it", () => {
    const TONE = "error";
    const rows = frameBox("", "", ["body"], [FOOT], TONE, LIMIT);
    const foot = rows.find((r) => r.includes(FOOT)) as string;
    expect(foot).toContain(`{{${TONE}}}`);
    oneWidth(rows);
  });

  it("wraps like body content, and the frame still prints at one width", () => {
    oneWidth(frameBox("", "", ["body"], ["cause ".repeat(30)], NO_TONE, LIMIT));
  });
});

describe("the tone", () => {
  it("dresses the outline when the frame names one", () => {
    const TONE = "warning";
    const rows = frameBox("", "", ["body"], [], TONE, LIMIT);
    expect(rows[0]).toContain(`{{${TONE}}}`);
    oneWidth(rows);
  });

  it("falls back to the neutral grey when no state picked one", () => {
    expect(frameBox("", "", ["body"], [], NO_TONE, LIMIT)[0]).toContain("{{dim}}");
  });
});
