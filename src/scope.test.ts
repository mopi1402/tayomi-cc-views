// How a name written in a template reaches a value.
//
// The pseudo-fields are the part with no second chance: a scope is an OPEN record, so a lookup that misses returns
// undefined rather than throwing, and a renamed bookkeeping field would blank a column with no error anywhere.

import { describe, it, expect } from "vitest";
import { BULLET_REF, DEFAULT_KEY, INDEX_REF, ITEM_REF, LABEL_REF } from "./data/language.js";
import { SUBST_RE, TEXT_TABLE, lookup, stringify, tableWord, type Scope } from "./scope.js";

describe("lookup", () => {
  it("reads a field the block declared", () => {
    expect(lookup({ said: "it works" }, "said")).toBe("it works");
  });

  it("walks a dotted path into a nested value", () => {
    expect(lookup({ row: { inner: { deep: 3 } } }, "row.inner.deep")).toBe(3);
  });

  it("returns undefined rather than throwing when the path breaks halfway", () => {
    expect(lookup({ row: null }, "row.inner")).toBeUndefined();
    expect(lookup({}, "a.b.c.d")).toBeUndefined();
  });

  it("resolves the item an @each is on, and its rank counted from one", () => {
    const scope: Scope = { __item: "row", __index: 1 };
    expect(lookup(scope, ITEM_REF)).toBe("row");
    expect(lookup(scope, INDEX_REF)).toBe(1);
  });

  it("resolves the bullet the @each declared, and nothing where none was", () => {
    expect(lookup({ __bullet: "- " }, BULLET_REF)).toBe("- ");
    expect(lookup({}, BULLET_REF)).toBe("");
  });

  it("gives an unlabelled line the label column in SPACES, so it starts where items do", () => {
    const WIDTH = 7;
    expect(lookup({ __labelWidth: WIDTH }, LABEL_REF)).toBe(" ".repeat(WIDTH));
    expect(lookup({}, LABEL_REF)).toBe("");
  });

  it("lets the label a section carries win over the blank column", () => {
    expect(lookup({ __label: "CHECKS ", __labelWidth: 7 }, LABEL_REF)).toBe("CHECKS ");
  });

  it("cannot be shadowed by a field the block wrote, the point of the punctuation", () => {
    // A block writing "#: mine" would collide with ${#} if the pseudo-fields were words.
    const scope: Scope = { __index: 2 };
    expect(lookup({ ...scope, [INDEX_REF]: "mine" }, INDEX_REF)).toBe(2);
  });
});

// The one thing "raw over hollow" now rests on, and the reason it has no list of naming forms to keep in step: a field
// cannot be resolved without being counted, because the counting happens in the ACCESSOR and not in any of its callers.
//
// It is the door, so what it records is worth pinning to the byte. A dotted path counted whole would name a key no
// scope can hold and blank a render nothing was wrong with, which was the defect this design removes rather than
// patches.
describe("what a lookup records", () => {
  const seen = (keys: string[], scope: Scope = {}): string[] => {
    const read = new Set<string>();
    for (const k of keys) lookup({ ...scope, __read: read }, k);
    return [...read];
  };

  it("counts the field a name asked for", () => {
    expect(seen(["said", "other"])).toEqual(["said", "other"]);
  });

  it("counts a field that was never written, since the ASKING is what it answers", () => {
    // The question is what the template wanted, not what it got: a view naming a field the block left out has still
    // read it, and refusing that render would show raw markdown for a missing optional.
    expect(seen(["absent"])).toEqual(["absent"]);
  });

  it("counts the ROOT of a dotted path, the only segment a scope can hold", () => {
    expect(seen(["row.inner.deep"], { row: { inner: { deep: 1 } } })).toEqual(["row"]);
  });

  it("counts NO pseudo-field, which resolves against the bookkeeping and not the data", () => {
    expect(seen([ITEM_REF, INDEX_REF, LABEL_REF, BULLET_REF])).toEqual([]);
  });

  it("records nothing at all when the caller asked for no account", () => {
    // The set is opt-in: every other caller of lookup (the column measurer) must cost nothing and must not pollute a
    // render's answer.
    const scope: Scope = { said: "v" };
    expect(lookup(scope, "said")).toBe("v");
    expect(scope.__read).toBeUndefined();
  });
});

describe("stringify", () => {
  it("leaves a scalar as the text it prints", () => {
    expect(stringify("x")).toBe("x");
    expect(stringify(3)).toBe("3");
    expect(stringify(true)).toBe("true");
  });

  it("re-serialises an object-list item to prose, never [object Object]", () => {
    expect(stringify({ state: "ok", text: "all good" })).toBe("state: ok, text: all good");
  });

  it("keeps a valueless key as the bare key", () => {
    expect(stringify({ flag: null, state: "ok" })).toBe("flag, state: ok");
  });

  it("leaves an array to String, since a list is never a cell", () => {
    expect(stringify(["a", "b"])).toBe("a,b");
  });
});

// A table's own semantics, and they live here because TWO modules read them: the substituter spends the word and the
// column measurer has to know how wide it will be. The three outcomes are three because ONE slot serves a payload
// naming a known kind, one naming an unknown one, and one naming none.
describe("tableWord", () => {
  const WARNING = "⚠ WARNING";
  const kinds = {
    kind: TEXT_TABLE as typeof TEXT_TABLE,
    entries: { warning: WARNING, [DEFAULT_KEY]: "ⓘ NOTE" },
  };

  it("renders a DECLARED entry verbatim, the author's glyph and casing byte for byte", () => {
    expect(tableWord(kinds, "warning")).toBe(WARNING);
  });

  it("takes the reserved entry for a value that never arrived", () => {
    expect(tableWord(kinds, "")).toBe("ⓘ NOTE");
  });

  it("ECHOES an unknown key uppercased, showing the word rather than swallowing it", () => {
    expect(tableWord(kinds, "deploy")).toBe("DEPLOY");
  });

  it("renders nothing for an absent value when the table reserves no default", () => {
    expect(tableWord({ kind: TEXT_TABLE, entries: { a: "A" } }, "")).toBe("");
  });

  it("prefers a DECLARED empty value over the echo: written blank is a decision", () => {
    expect(tableWord({ kind: TEXT_TABLE, entries: { quiet: "" } }, "quiet")).toBe("");
  });
});

describe("SUBST_RE", () => {
  // Shared with the column measurer, which reads the SAME expressions to learn which @map a column renders through: two
  // patterns would let the two readers disagree.
  const found = (text: string): string[] => [...text.matchAll(SUBST_RE)].map((m) => m[1]);

  it("finds every expression on a line, plain and mapped alike", () => {
    expect(found("${a} then ${b:states} then ${.}")).toEqual(["a", "b:states", "."]);
  });

  it("stops at the first closing brace, so an unclosed expression matches nothing", () => {
    expect(found("${unclosed")).toEqual([]);
  });

  it("does not treat a bare brace pair as an expression", () => {
    expect(found("{a} $ {b}")).toEqual([]);
  });
});
