// How wide a line will PRINT. Every frame in the engine is padded against this number, so a disagreement here is a
// ragged border everywhere.
//
// The invariant worth stating first: a KNOWN tag costs nothing and an UNKNOWN one costs its literal width, because an
// unknown tag is left on screen verbatim. A measurer that stripped both would size a line mentioning a literal {{tag}}
// in its prose short.

import { describe, it, expect } from "vitest";
import {
  RESET_MARK,
  RESUME_MARK,
  SPAN_MARK,
  isTag,
  renderTags,
  spanOpen,
  tagMark,
} from "../style.js";
import { HANG_MARK, RULE_MARK } from "./marks.js";
import { fitCell, longestKey, padCell, printedWidth } from "./measure.js";

const KNOWN = "b";
/** A second known tag, for the cases that need two of them open at once. */
const SECOND = "dim";
const UNKNOWN = "not_a_palette_name";
const ELLIPSIS = "…";
const ESC = "\x1b";

describe("printedWidth", () => {
  it("measures plain text as the columns it occupies", () => {
    expect(printedWidth("done in 3 files")).toBe("done in 3 files".length);
  });

  it("charges nothing for a KNOWN tag, which the render turns into an escape", () => {
    expect(isTag(KNOWN)).toBe(true);
    expect(printedWidth(`${tagMark(KNOWN)}text${RESET_MARK}`)).toBe("text".length);
  });

  it("charges an UNKNOWN tag its full width, because it reaches the screen as text", () => {
    expect(isTag(UNKNOWN)).toBe(false);
    const literal = tagMark(UNKNOWN);
    expect(printedWidth(literal)).toBe(literal.length);
  });

  it("charges nothing for an escape already on the line", () => {
    expect(printedWidth(`${ESC}[1;97mtext${ESC}[0m`)).toBe("text".length);
  });

  it("charges nothing for the backticks of a code span, and full price for its text", () => {
    expect(printedWidth("run `pnpm test` now")).toBe("run pnpm test now".length);
  });

  it("charges an UNPAIRED backtick, which prints as itself", () => {
    expect(printedWidth("a ` b")).toBe("a ` b".length);
  });

  it("charges nothing for the engine's own control marks", () => {
    expect(printedWidth(`${RULE_MARK}CHECKS`)).toBe("CHECKS".length);
    expect(printedWidth(`- ${HANG_MARK}item`)).toBe("- item".length);
  });

  it("charges nothing for either mark of a span, wherever on the line it sits", () => {
    // BETWEEN two characters, which is the case a mark measured alone cannot answer: a mark the measurer read as text
    // moves every column on the line and says nothing.
    expect(printedWidth(`a${RESUME_MARK}b`)).toBe("ab".length);
    expect(printedWidth(`a${SPAN_MARK}b`)).toBe("ab".length);
    expect(printedWidth(`${tagMark(KNOWN)}text${RESUME_MARK}`)).toBe("text".length);
    // And a whole span costs its TEXT, which is the number every column is padded to.
    expect(printedWidth(`x ${spanOpen(KNOWN)}in${RESUME_MARK} y`)).toBe("x in y".length);
  });

  it("counts a wide glyph as the two columns it draws", () => {
    expect(printedWidth("仕様")).toBe(4);
  });
});

describe("padCell", () => {
  it("fills a value out to its column", () => {
    expect(padCell("ok", 5)).toBe("ok   ");
  });

  it("leaves a value that already fills it, and never truncates one that overflows", () => {
    expect(padCell("exact", 5)).toBe("exact");
    expect(padCell("overflowing", 5)).toBe("overflowing");
  });

  it("pads on the PRINTED width, so a styled value is not short-changed", () => {
    const styled = `${tagMark(KNOWN)}ok${RESET_MARK}`;
    expect(printedWidth(padCell(styled, 5))).toBe(5);
  });
});

describe("fitCell", () => {
  const CAP = 6;

  it("leaves a value that fits exactly alone", () => {
    expect(fitCell("abcdef", CAP)).toBe("abcdef");
  });

  it("cuts an overflowing value to the cell, ellipsis included in the count", () => {
    const out = fitCell("far too long for this", CAP);
    expect(printedWidth(out)).toBe(CAP);
    expect(out.endsWith(ELLIPSIS)).toBe(true);
  });

  it("closes a style the cut left open, so no colour bleeds past the cell", () => {
    const out = fitCell(`${tagMark(KNOWN)}aaaaaaaaaa${RESET_MARK}`, CAP);
    expect(out.startsWith(`${SPAN_MARK}${tagMark(KNOWN)}`)).toBe(true);
    expect(out).toContain(RESUME_MARK);
    expect(printedWidth(out)).toBe(CAP);
  });

  it("closes a code span the cut left open, so no orphan backtick reaches the screen", () => {
    const out = fitCell("`aaaaaaaaaaaa`", CAP);
    expect([...out].filter((c) => c === "`")).toHaveLength(2);
    expect(printedWidth(out)).toBe(CAP);
  });

  it("cuts a value carrying a COMPLETE span at the same character as one without", () => {
    const head = `${tagMark(KNOWN)}ab${spanOpen(SECOND)}${RESUME_MARK}`;
    const tail = "cdefghij";
    const room = CAP - printedWidth(ELLIPSIS) - printedWidth(head);
    // The span closed before the cut, so it leaves nothing behind it: both its marks are walked for the notion, and
    // neither costs the budget a column.
    expect(fitCell(head + tail, CAP)).toBe(
      `${SPAN_MARK}${head}${tail.slice(0, room)}${RESUME_MARK}${ELLIPSIS}`
    );
  });

  it("frames the value's OWN tags, so the resume closing them cannot reach the row's", () => {
    // Two tags and no span of the engine's: they belong to no frame, so the cut opens one around them. Without it the
    // closing resume finds no boundary and unwinds the tags the TEMPLATE opened around the cell along with the cell's,
    // and the ellipsis and everything after it print plain.
    const head = `${tagMark(KNOWN)}${tagMark(SECOND)}a`;
    const tail = "bcdefghij";
    const room = CAP - printedWidth(ELLIPSIS) - printedWidth(head);
    expect(fitCell(head + tail, CAP)).toBe(
      `${SPAN_MARK}${head}${tail.slice(0, room)}${RESUME_MARK}${ELLIPSIS}`
    );
  });

  it("closes ONE resume per FRAME the cut left half-open, never one per tag", () => {
    // The cut lands inside the engine's own span: one resume ends that frame, a second ends the one the cut opened
    // around the value's tag. Counting tags would write three here, and the third would unwind the row.
    const head = `${tagMark(KNOWN)}${spanOpen(SECOND)}a`;
    const tail = "bcdefghij";
    const room = CAP - printedWidth(ELLIPSIS) - printedWidth(head);
    expect(fitCell(head + tail, CAP)).toBe(
      `${SPAN_MARK}${head}${tail.slice(0, room)}${RESUME_MARK.repeat(2)}${ELLIPSIS}`
    );
  });

  it("counts the frame it opens ITSELF, where the value left only a boundary standing", () => {
    // A chip whose class the palette cannot answer for: the name reaches the screen as text, so it stacks nothing and
    // the boundary stands alone. Count the frames on the value's stack rather than on the one the ROW will see and this
    // writes one resume too few, leaving the cut's own boundary open for the next resume to stop at.
    const out = fitCell(`${spanOpen(UNKNOWN)}aaaa`, CAP);
    expect(out.endsWith(RESUME_MARK.repeat(2) + ELLIPSIS)).toBe(true);
  });

  it("gives the ROW back the colour the template opened around a cut", () => {
    // The end of the chain, and the only assertion here that reads what reaches a screen: the marks above are right
    // only if what follows the ellipsis is the row's own style.
    const cell = fitCell(`${spanOpen(KNOWN)}aaaaaaaaaa`, CAP);
    const rendered = renderTags(`${tagMark(SECOND)}${cell} tail${RESET_MARK}`);
    const before = rendered.split(ELLIPSIS)[0];
    expect(before.endsWith(renderTags(RESET_MARK) + renderTags(tagMark(SECOND)))).toBe(true);
  });

  it("closes nothing where the value's own reset already did, mid-cell", () => {
    const head = `${tagMark(KNOWN)}ab${RESET_MARK}`;
    const tail = "cdefghij";
    const room = CAP - printedWidth(ELLIPSIS) - printedWidth(head);
    expect(fitCell(head + tail, CAP)).toBe(`${head}${tail.slice(0, room)}${ELLIPSIS}`);
  });

  it("never splits a wide glyph in half", () => {
    const out = fitCell("仕様仕様仕様", CAP);
    expect(printedWidth(out)).toBeLessThanOrEqual(CAP);
    expect(out).not.toContain("�");
  });
});

describe("longestKey", () => {
  it("is the widest key a map declares, measured in columns", () => {
    expect(longestKey({ ok: "a", failing: "b", mid: "c" })).toBe("failing".length);
  });

  it("is zero for a map with no keys, so an empty column reserves nothing", () => {
    expect(longestKey({})).toBe(0);
  });
});
