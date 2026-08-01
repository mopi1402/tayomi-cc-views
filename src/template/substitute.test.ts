// ${field} and ${field:mapname}, resolved against the scope.
//
// The padding rules are the part worth pinning: a cell measured in one place and spent
// in another is how a column silently decouples, and the tail's EXEMPTION is what keeps
// prose from being padded to a ragged right edge.

import { describe, it, expect } from "vitest";
import type { PadCtx } from "../layout/columns.js";
import { CHIP_CHROME, chip } from "../style.js";
import { subst } from "./substitute.js";
import type { Maps, Scope } from "../scope.js";

const MAPS: Maps = { states: { ok: "success", fail: "error" } };
const LONGEST_KEY = "fail".length;
/** What columns.ts would measure for a mapped column: its longest key plus the chip. */
const CELL = LONGEST_KEY + CHIP_CHROME;

const plain = (text: string, scope: Scope): string => subst(text, scope, MAPS);
const padded = (text: string, scope: Scope, pad: PadCtx): string =>
  subst(text, scope, MAPS, pad);

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
