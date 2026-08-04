// ${field} and ${field:tablename}, resolved against the scope.
//
// The padding rules are the part worth pinning: a cell measured in one place and spent in another is how a column
// silently decouples, and the tail's EXEMPTION is what keeps prose from being padded to a ragged right edge.
//
// One expression, two kinds of table behind it. Which answer comes out is the TABLE's business, so both are driven here
// through the same call.

import { describe, it, expect } from "vitest";
import { DEFAULT_KEY } from "../data/language.js";
import type { PadCtx } from "../layout/columns.js";
import { printedWidth } from "../layout/measure.js";
import { CHIP_CHROME, chip } from "../style.js";
import { subst } from "./substitute.js";
import { STYLE_TABLE, TEXT_TABLE, type Scope, type Tables } from "../scope.js";

const WARNING = "⚠ WARNING";
const NOTE = "ⓘ NOTE";
const TABLES: Tables = {
  states: { kind: STYLE_TABLE, entries: { ok: "success", fail: "error" } },
  kinds: {
    kind: TEXT_TABLE,
    entries: { warning: WARNING, [DEFAULT_KEY]: NOTE },
  },
};
const LONGEST_KEY = "fail".length;
/** What columns.ts would measure for a mapped column: its longest key plus the chip. */
const CELL = LONGEST_KEY + CHIP_CHROME;

const plain = (text: string, scope: Scope): string => subst(text, scope, TABLES);
const padded = (text: string, scope: Scope, pad: PadCtx): string =>
  subst(text, scope, TABLES, pad);

describe("a plain expression", () => {
  it("is replaced by its value, and everything around it is left alone", () => {
    expect(plain("said: ${said}!", { said: "it works" })).toBe("said: it works!");
  });

  it("tolerates the blanks an author puts inside the braces", () => {
    expect(plain("${ said }", { said: "x" })).toBe("x");
  });

  it("renders a missing field as nothing, so an absent zone leaves no hole", () => {
    expect(plain("[${nope}]", {})).toBe("[]");
  });

  it("renders a number and an object-list item as the text they print", () => {
    expect(plain("${n}", { n: 3 })).toBe("3");
    expect(plain("${row}", { row: { a: "1" } })).toBe("a: 1");
  });
});

describe("a mapped expression", () => {
  it("renders the value's chip, the key uppercased inside it", () => {
    expect(plain("${s:states}", { s: "ok" })).toBe(chip("success", "OK"));
  });

  it("resolves on the TRIMMED value, so upstream padding never loses a chip", () => {
    expect(plain("${s:states}", { s: "  ok  " })).toBe(chip("success", "OK"));
  });

  it("falls back to bare text off the map: no chip is ever invented", () => {
    expect(plain("${s:states}", { s: "other" })).toBe("other");
  });

  it("renders bare text through an @map the template never declared", () => {
    expect(plain("${s:missing}", { s: "ok" })).toBe("ok");
  });
});

// The three outcomes a text table has to serve with ONE slot: a kind it declares, a kind it has never heard of, and no
// kind at all. Collapsing any two of them would cost the band either its word or a second field on the line to carry
// one.
describe("a text expression", () => {
  it("renders a DECLARED entry verbatim, the author's glyph and casing byte for byte", () => {
    expect(plain("${type:kinds}", { type: "warning" })).toBe(WARNING);
  });

  it("resolves on the TRIMMED value, like the style table beside it", () => {
    expect(plain("${type:kinds}", { type: "  warning  " })).toBe(WARNING);
  });

  it("takes the reserved entry when the value is ABSENT", () => {
    expect(plain("${type:kinds}", {})).toBe(NOTE);
  });

  it("takes it on a whitespace-only value too: written blank is not written", () => {
    expect(plain("${type:kinds}", { type: "   " })).toBe(NOTE);
  });

  it("ECHOES an off-map token uppercased, showing the word rather than swallowing it", () => {
    expect(plain("${type:kinds}", { type: "deploy" })).toBe("DEPLOY");
  });

  it("renders NOTHING for an absent value when the table reserves no default", () => {
    const bare: Tables = { k: { kind: TEXT_TABLE, entries: { a: "A" } } };
    expect(subst("[${type:k}]", {}, bare)).toBe("[]");
  });

  it("is unpadded outside a column, because a band is not a column", () => {
    expect(plain("[${type:kinds}]", { type: "warning" })).toBe(`[${WARNING}]`);
  });
});

describe("inside a list, where the columns align", () => {
  const pad: PadCtx = { widths: { s: CELL }, tail: "text" };

  it("pads the chip's label to the cell, so the column after it holds its offset", () => {
    expect(padded("${s:states}", { s: "ok" }, pad)).toBe(chip("success", "OK".padEnd(LONGEST_KEY)));
  });

  it("pads an OFF-MAP value to the same cell, chipless but aligned", () => {
    expect(padded("${s:states}", { s: "other" }, pad)).toBe("other".padEnd(CELL));
  });

  it("spends the cell in SPACES when the item has no such field", () => {
    expect(padded("${s}", {}, pad)).toBe(" ".repeat(CELL));
  });

  it("leaves the prose tail unpadded, in a list as out of one", () => {
    expect(padded("${text}", { text: "short" }, pad)).toBe("short");
  });

  it("leaves a field the context never measured unpadded", () => {
    expect(padded("${other}", { other: "x" }, pad)).toBe("x");
  });

  it("pads a text table's WORD to its cell, exactly as an off-map value pads", () => {
    // Measured on what comes OUT, never on the key that chose it. Asserted in COLUMNS rather than in characters: the
    // words carry glyphs, and a cell counting a glyph as one character is the very defect the shared measure exists to
    // prevent.
    const wide = printedWidth(WARNING) + 3;
    const ctx: PadCtx = { widths: { type: wide }, tail: "text" };
    const declared = padded("${type:kinds}", { type: "warning" }, ctx);
    expect(declared.startsWith(WARNING)).toBe(true);
    expect(printedWidth(declared)).toBe(wide);
    // The reserved entry takes a cell like any other: a row with no value still aligns.
    expect(printedWidth(padded("${type:kinds}", {}, ctx))).toBe(wide);
  });
});

describe("a capped column", () => {
  const CAP = 6;
  const ELLIPSIS = "…";
  const pad: PadCtx = { widths: { s: CAP } };

  it("cuts a value wider than its cell on an ellipsis, never past the cell", () => {
    const out = padded("${s}", { s: "far too long to fit" }, pad);
    expect(out).toHaveLength(CAP);
    expect(out.endsWith(ELLIPSIS)).toBe(true);
  });

  it("leaves a value that fits exactly alone", () => {
    expect(padded("${s}", { s: "abcdef" }, pad)).toBe("abcdef");
  });
});

describe("a hollow column", () => {
  // The rule that lets ONE template draw a variable number of columns: a field the list never carried takes down the
  // text leading up to it, which is exactly where a separator is written.
  const SEP = "  |  ";
  const LINE = `\${a}${SEP}\${b}${SEP}\${c}`;
  const ctx = (...hollow: string[]): PadCtx => ({ tail: "c", widths: {}, hollow: new Set(hollow) });

  it("takes the separator written just before it down with it", () => {
    expect(padded(LINE, { a: "1", c: "3" }, ctx("b"))).toBe(`1${SEP}3`);
  });

  it("leaves the line whole when nothing is hollow", () => {
    expect(padded(LINE, { a: "1", b: "2", c: "3" }, ctx())).toBe(`1${SEP}2${SEP}3`);
  });

  it("takes several in a row, and the trailing text still lands", () => {
    expect(padded(LINE + " END", { a: "1", c: "3" }, ctx("b", "c"))).toBe("1 END");
  });

  it("is nothing without a hollow set: an absent field pads its cell as it always did", () => {
    expect(padded(LINE, { a: "1", c: "3" }, { tail: "c", widths: { b: 4 } })).toBe(
      `1${SEP}    ${SEP}3`
    );
  });

  it("never reaches a line outside a list, which has no pad context at all", () => {
    expect(plain(LINE, { a: "1", c: "3" })).toBe(`1${SEP}${SEP}3`);
  });

  it("keeps a closer the dropped run does not open, which belongs to the column before", () => {
    // `{{tone}}${a}{{/}}` puts that closer at the head of the NEXT column's lead. Dropping it with the rest would leave
    // the tone open across the whole line, the one way this rule could repaint a row.
    const line = `{{c}}\${a}{{/}}{{dim}}${SEP}{{/}}\${b}{{dim}}${SEP}{{/}}\${c}`;
    expect(padded(line, { a: "1", c: "3" }, ctx("b"))).toBe(`{{c}}1{{/}}{{dim}}${SEP}{{/}}3`);
  });

  it("drops a separator it DOES open and close, leaving no stray closer behind", () => {
    const line = `\${a}{{dim}}${SEP}{{/}}\${b}`;
    expect(padded(line, { a: "1" }, { tail: "b", widths: {}, hollow: new Set(["b"]) })).toBe("1");
  });
});
