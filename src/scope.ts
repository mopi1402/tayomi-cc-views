// The SCOPE: how a field name written in a template resolves to a value, and how
// that value becomes text.
//
// A leaf of the display chain, beside style.ts, because it has two consumers that
// must not depend on each other: the substituter (template/) and the column
// measurer (layout/). Both need to read a field and coerce it to a string, so
// neither can own the accessors.

// The data a view renders: parsed block fields, plus the engine's own __-prefixed
// bookkeeping (the current item, its index, the label column).
export type Scope = Record<string, unknown>;

// The enum-to-style tables a template declares with @map.
export type Maps = Record<string, Record<string, string>>;

// The substitution shape, ${field} or ${field:mapname}. Shared, because the
// column measurer has to read the SAME expressions to learn which @map a column
// renders through: two patterns would let the two readers disagree about what a
// substitution is.
export const SUBST_RE = /\$\{([^}]+)\}/g;

export function lookup(scope: Scope, key: string): unknown {
  if (key === ".") return scope.__item;
  if (key === "#") return scope.__index;
  // Inside a labelled @each: the label on the first item, spaces after it.
  // Outside one (an @rule prefix): spaces of the label column's width, so a line
  // that is not part of a list still starts where the list items start.
  if (key === "#label") {
    return scope.__label ?? " ".repeat(Number(scope.__labelWidth ?? 0));
  }
  // The item marker declared by bullet="..." on the @each, followed by the
  // hanging-indent boundary, so a wrapped item lines up under its own text
  // instead of under its bullet. Empty outside a bullet-carrying loop.
  if (key === "#bullet") return scope.__bullet ?? "";
  return key
    .split(".")
    .reduce<unknown>(
      (o, k) =>
        o == null ? undefined : (o as Record<string, unknown>)[k],
      scope
    );
}

// Coerce a substituted value to a string. An object-list item (from a view's
// @fields split) is a mapping, not a string; naive String() would show
// "[object Object]". Re-serialise it back to "key: value" prose so ${.} on such
// an item renders readably instead of leaking the object marker.
export function stringify(val: unknown): string {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => (v == null ? k : `${k}: ${stringify(v)}`))
      .join(", ");
  }
  return String(val);
}
