// The @box frame: the one thing a template cannot express, because the width of the top rule depends on every line the
// body has not produced yet.
//
// The invariant every case below re-checks is that ALL rows print the same width. A box is the most visible thing on
// screen and the least forgiving: one row off by a column and the border is visibly broken, so the arithmetic is
// asserted rather than eyeballed.

import { describe, it, expect } from "vitest";
import { RESET_MARK, tagMark } from "../style.js";
import { RULE_MARK } from "./marks.js";
import { BOX_CHROME, collapseBlanks, flowBody, frameBox } from "./box.js";
import { HANG_MARK } from "./marks.js";
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

  // The regression this section exists for. A rule row spends its prefix, then a gap and at least one dash into the
  // border, so a frame sized on the prefix ALONE is one column short and that single row breaks the outline. It only
  // shows when the rule is the widest line, which is why rendering real views never caught it.
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

// The same container with no outline. What it must prove is that the body machinery is the SAME machinery: a claim
// about sharing is worth nothing asserted on the bare path alone, so the cases that can be are stated against a frame
// drawn on the same body.
describe("a bare container", () => {
  const ruleOf = (prefix = ""): string => RULE_MARK + prefix;
  const dashesIn = (row: string): number => [...row].filter((c) => c === DASH).length;

  it("draws the body and nothing around it", () => {
    const body = ["first", "second"];
    expect(flowBody(body, LIMIT)).toEqual(body);
  });

  it("hands a body line back unpadded, having no border for a pad to meet", () => {
    // The frame pads every row to one width; here a trailing run of blanks would be invisible and measurable, which is
    // the worst pair for a value another layer may go on to wrap.
    expect(flowBody(["short", "a longer line"], LIMIT)).toEqual(["short", "a longer line"]);
  });

  it("fills a rule to the widest line it divides, which is the box's own width law", () => {
    const rows = flowBody(["ab", ruleOf(), "abcdefgh"], LIMIT);
    expect(dashesIn(rows[1])).toBe(printedWidth("abcdefgh"));
    expect(rows[1]).toContain(tagMark("box_rule"));
  });

  it("sizes to its CONTENT and never to the limit it was handed", () => {
    const rows = flowBody(["ab", ruleOf(), "cd"], LIMIT);
    expect(dashesIn(rows[1])).toBe(2);
    expect(dashesIn(rows[1])).toBeLessThan(LIMIT);
  });

  it("keeps a rule's prefix and starts its dashes after it", () => {
    const rows = flowBody(["a body line", ruleOf("LABEL"), "another"], LIMIT);
    expect(rows[1].startsWith("LABEL ")).toBe(true);
    expect(dashesIn(rows[1])).toBe(printedWidth("a body line") - printedWidth("LABEL "));
  });

  it("wraps a body line at the limit, with no chrome to subtract from it", () => {
    // The one number that differs from the framed path, and the reason it differs: there is no border to fit inside.
    const long = "x".repeat(LIMIT * 2);
    const bare = flowBody([long], LIMIT);
    expect(printedWidth(bare[0])).toBe(LIMIT);
    // The same body inside a frame wraps NARROWER, by the chrome it has to fit inside, so it takes more rows to say
    // the same thing. Stated as a comparison rather than as a row count: the claim is that one machine serves both.
    const framed = frameBox("", "", [long], [], NO_TONE, LIMIT);
    expect(framed.filter((r) => r.includes("x")).length).toBeGreaterThan(bare.length);
    expect(oneWidth(framed)).toBe(LIMIT);
  });

  it("keeps the hanging boundary, so a folded line stays in its own column", () => {
    const rows = flowBody([`lab  ${HANG_MARK}${"word ".repeat(12)}`], LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[1].startsWith(" ".repeat(printedWidth("lab  ")))).toBe(true);
  });

  it("drops the rule trailing the last element, the collapsing it shares with the frame", () => {
    // What turns a divider drawn UNDER every item into one drawn BETWEEN them. The loop cannot count, so this does.
    const rows = flowBody(["one", ruleOf(), "two", ruleOf()], LIMIT);
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.includes(DASH))).toHaveLength(1);
  });

  it("fills a rule that is the WHOLE body to the limit, having no body to measure it against", () => {
    // The degenerate case of the width law rather than an exception to it: a rule with nothing to divide is not a
    // separator, it is the content. Both ordinary laws would undo it, the collapsing by dropping a rule with no
    // neighbours and the measurement by finding nothing, so this is the one place a bare container reads its limit.
    const rows = flowBody([ruleOf()], LIMIT);
    expect(rows).toHaveLength(1);
    expect(dashesIn(rows[0])).toBe(LIMIT);
  });

  it("still treats a rule beside content as the separator it is", () => {
    // The near-miss of the case above: one line of body is enough to put the rule back under the ordinary laws, where
    // it measures against that body and is dropped when it has nothing on one side.
    expect(dashesIn(flowBody([ruleOf(), "ab"], LIMIT).join(""))).toBe(0);
    expect(dashesIn(flowBody(["ab", ruleOf(), "cd"], LIMIT)[1])).toBe(2);
  });

  it("returns nothing at all for a body that produced nothing", () => {
    // The frame still draws itself on an empty body; a container with no outline has nothing left to draw. A row of
    // SPACES is not empty and is not tested here: collapseBlanks reads a blank as zero printed columns, so two spaces
    // are two columns of content, in this container exactly as in the framed one.
    expect(flowBody([], LIMIT)).toEqual([]);
    expect(flowBody(["", ""], LIMIT)).toEqual([]);
  });
});
