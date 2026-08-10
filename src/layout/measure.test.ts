// How wide a line will PRINT. Every frame in the engine is padded against this number, so a disagreement here is a
// ragged border everywhere.
//
// The invariant worth stating first: a KNOWN tag costs nothing and an UNKNOWN one costs its literal width, because an
// unknown tag is left on screen verbatim. A measurer that stripped both would size a line mentioning a literal {{tag}}
// in its prose short.

import { describe, it, expect } from "vitest";
import { CODE_TICK, FENCE } from "../data/markup.js";
import { RESET_MARK, RESUME_MARK, SPAN_MARK, isTag, spanOpen, tagMark } from "../style.js";
import { HANG_MARK, RULE_MARK } from "./marks.js";
import { longestKey, padCell, printedText, printedWidth } from "./measure.js";

const KNOWN = "b";
const UNKNOWN = "not_a_palette_name";
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

  it("charges the backticks a span holds as its TEXT, which reach the screen", () => {
    // Only the DELIMITERS are consumed downstream. Asserted on the TEXT and not on the width alone: a reading that
    // dropped the run and kept a stray tick in its place measures the same number and draws a different line.
    const quoted = `bloc ${CODE_TICK} ${FENCE}x ${CODE_TICK}`;
    expect(printedText(quoted)).toBe(`bloc ${FENCE}x`);
    expect(printedWidth(quoted)).toBe(`bloc ${FENCE}x`.length);
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

describe("longestKey", () => {
  it("is the widest key a map declares, measured in columns", () => {
    expect(longestKey({ ok: "a", failing: "b", mid: "c" })).toBe("failing".length);
  });

  it("is zero for a map with no keys, so an empty column reserves nothing", () => {
    expect(longestKey({})).toBe(0);
  });
});
