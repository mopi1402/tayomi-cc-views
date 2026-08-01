// The SCOPE: how a field name written in a template resolves to a value, and how
// that value becomes text.
//
// A leaf beside style.ts, because its two consumers must not depend on each other:
// the substituter (template/) and the column measurer (layout/) both read a field
// and coerce it to a string, so neither can own the accessors.

import { BULLET_REF, INDEX_REF, ITEM_REF, LABEL_REF } from "./data/language.js";

/**
 * The data a view renders: the block's parsed fields, plus the engine's own
 * bookkeeping.
 *
 * The `__` members are written by the directive layer and read by lookup below.
 * They are DECLARED here rather than typed as they are written, so the writer and
 * the reader cannot drift onto two spellings of the same fact: a scope is an open
 * record, so a misspelt `__labelWidth` is a silently absent field, not an error.
 * The prefix is what keeps a block's own field from colliding with one.
 */
export interface Scope extends Record<string, unknown> {
  /** The item an @each is currently on. */
  __item?: unknown;
  /** Its rank in the list, counted from one. */
  __index?: number;
  /** The section's label, carried by the FIRST item and blank on the others. */
  __label?: string;
  /** The item's marker, hanging boundary included. */
  __bullet?: string;
  /** The column every label pads to, the widest the template declares. */
  __labelWidth?: number;
}

/** The enum-to-style tables a template declares with @map. */
export type Maps = Record<string, Record<string, string>>;

// The substitution shape, ${field} or ${field:mapname}. Shared, because the column
// measurer has to read the SAME expressions to learn which @map a column renders
// through: two patterns would let the two readers disagree about what one is.
export const SUBST_RE = /\$\{([^}]+)\}/g;

// The pseudo-fields of the language, resolved against the bookkeeping above. A table
// rather than a chain of branches: the vocabulary is then a list one can read, and
// adding to it is an entry rather than another special case inside lookup.
const PSEUDO: Record<string, (scope: Scope) => unknown> = {
  [ITEM_REF]: (s) => s.__item,
  [INDEX_REF]: (s) => s.__index,
  // Outside a labelled @each (an @rule prefix) it is the label column's width in
  // spaces, so a line that is not part of a list still starts where the items do.
  [LABEL_REF]: (s) => s.__label ?? " ".repeat(s.__labelWidth ?? 0),
  [BULLET_REF]: (s) => s.__bullet ?? "",
};

export function lookup(scope: Scope, key: string): unknown {
  const pseudo = PSEUDO[key];
  if (pseudo !== undefined) return pseudo(scope);
  return key
    .split(".")
    .reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), scope);
}

// An object-list item (from a view's @fields split) is a mapping, not a string, and
// a naive String() would show "[object Object]". Re-serialised to "key: value" prose
// so ${.} on such an item renders readably instead of leaking the object marker.
export function stringify(val: unknown): string {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => (v == null ? k : `${k}: ${stringify(v)}`))
      .join(", ");
  }
  return String(val);
}
