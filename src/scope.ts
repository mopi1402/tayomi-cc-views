// The SCOPE: how a field name written in a template resolves to a value, and how
// that value becomes text.
//
// A leaf beside style.ts, because its two consumers must not depend on each other:
// the substituter (template/) and the column measurer (layout/) both read a field
// and coerce it to a string, so neither can own the accessors.

import { BULLET_REF, DEFAULT_KEY, INDEX_REF, ITEM_REF, LABEL_REF } from "./data/language.js";

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
  /**
   * Every top-level key this render ASKED FOR, written by lookup below and by nothing
   * else. Absent unless a caller wants the answer.
   *
   * "Raw over hollow" has to know whether a template read any of the data it was handed,
   * and the accessor is the only place that can answer without GUESSING. Reading the
   * template's source instead gathers an approximation, and every form it fails to
   * recognise blanks a render nothing was wrong with, which is the one direction this
   * engine never takes: a dotted path was exactly that, and no test could have listed
   * the forms nobody had thought of yet. Recorded here, the answer is exact, and a
   * directive or a substitution shape added later is counted the day it resolves a
   * field, with nothing to keep in step.
   */
  __read?: Set<string>;
}

/**
 * What a declared table turns a value INTO: a style TAG, which renders as a chip (@map),
 * or a WORD, which renders as itself (@text).
 *
 * ONE registry rather than two, keyed by the name the template declared, because the
 * substitution that spends them is one form. A caller writes `${type:kinds}` and asks
 * the same question of either; which of the two answers is the TABLE's own business, and
 * it is the only party that knows. A second form making the caller state which kind it
 * reads would be a fact spelled twice, free to disagree with the declaration.
 */
export const STYLE_TABLE = "style";
export const TEXT_TABLE = "text";
export interface Table {
  kind: typeof STYLE_TABLE | typeof TEXT_TABLE;
  entries: Record<string, string>;
}

/** Every lookup table a template declares, by the name it declared it under. */
export type Tables = Record<string, Table>;

/**
 * The word a TEXT table shows for a value.
 *
 * Three outcomes, and they are three because one slot has to serve a payload that named
 * no kind, one that named a known one, and one that named a kind the table has never
 * heard of. A DECLARED entry renders verbatim, the author's glyph and the author's
 * casing byte for byte, since the author is the one writing presentation. An ABSENT or
 * blank value takes the reserved entry. Anything else ECHOES uppercased, which shows the
 * unknown word rather than swallowing it, and on the marker path is a restoration: the
 * marker's shape forced uppercase and the carrier lowercased it on the way in.
 *
 * Here rather than beside either caller: the substituter spends the word and the column
 * measurer has to know how WIDE it will be, and a second copy is how the two would come
 * to disagree about what fits.
 */
export function tableWord(table: Table, key: string): string {
  if (key === "") return table.entries[DEFAULT_KEY] ?? "";
  return table.entries[key] ?? key.toUpperCase();
}

// The substitution shape, ${field} or ${field:tablename}. Shared, because the column
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
  // A pseudo-field resolves against the bookkeeping above, never against a key the data
  // holds, so it is no part of what a caller is recording.
  if (pseudo !== undefined) return pseudo(scope);
  const path = key.split(".");
  // Recorded HERE and never by the four callers, which is the whole point: a fifth one
  // written tomorrow cannot forget to. A dotted path is walked from the scope root, so
  // its first segment is the only name the data can hold, and it is the name recorded.
  scope.__read?.add(path[0]);
  return path.reduce<unknown>(
    (o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]),
    scope
  );
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
