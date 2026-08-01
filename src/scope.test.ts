// How a name written in a template reaches a value.
//
// The pseudo-fields are the part with no second chance: a scope is an OPEN record, so
// a lookup that misses returns undefined rather than throwing, and a renamed
// bookkeeping field would blank a column with no error anywhere.

import { describe, it, expect } from "vitest";
import { BULLET_REF, INDEX_REF, ITEM_REF, LABEL_REF } from "./data/language.js";
import { SUBST_RE, lookup, stringify, type Scope } from "./scope.js";

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

describe("SUBST_RE", () => {
  // Shared with the column measurer, which reads the SAME expressions to learn which
  // @map a column renders through: two patterns would let the two readers disagree.
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
