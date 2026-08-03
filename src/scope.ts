// The SCOPE: how a field name written in a template resolves to a value, and how that value becomes text.
//
// A leaf beside style.ts, because its two consumers must not depend on each other: the substituter (template/) and the
// column measurer (layout/) both read a field and coerce it to a string, so neither can own the accessors.

import { BULLET_REF, DEFAULT_KEY, INDEX_REF, ITEM_REF, LABEL_REF } from "./data/language.js";

/**
 * The data a view renders: the block's parsed fields, plus the engine's own bookkeeping.
 *
 * The `__` members are DECLARED here rather than typed where they are written, because a scope is an open record: a
 * misspelt `__labelWidth` would be a silently absent field and not an error. The prefix keeps a block's own field from
 * colliding with one.
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
   * Every top-level key this render ASKED FOR, written by lookup below and by nothing else, absent unless a caller
   * wants the answer. Recorded at the accessor because reading the template's SOURCE gathers an approximation, and
   * every naming form it fails to recognise blanks a good render (.tayomi/specs/fix/carrier-guards.md).
   */
  __read?: Set<string>;
}

/**
 * A scope key read as a NAME. Only a string can name a class: a block that wrote a list under that key holds data the
 * slot must not read. Here because a view's own render and an include both resolve a tone this way.
 */
export function nameField(scope: Scope, key: string): string | undefined {
  const val = scope[key];
  return typeof val === "string" ? val.trim() : undefined;
}

/**
 * What a declared table turns a value INTO: a style TAG, which renders as a chip (@map), or a WORD, which renders as
 * itself (@text).
 *
 * ONE registry rather than two, because the substitution that spends them is one form: a caller writes `${type:kinds}`
 * and asks the same question of either.
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
 * The word a TEXT table shows for a value. A DECLARED entry renders verbatim, an ABSENT or blank value takes the
 * reserved entry, and anything else ECHOES uppercased, which shows the unknown word rather than swallowing it.
 *
 * Here rather than beside either caller: the substituter spends the word and the measurer needs its WIDTH.
 */
export function tableWord(table: Table, key: string): string {
  if (key === "") return table.entries[DEFAULT_KEY] ?? "";
  return table.entries[key] ?? key.toUpperCase();
}

// The substitution shape, ${field} or ${field:tablename}. Shared, because the column measurer reads the SAME
// expressions to learn which @map a column renders through.
export const SUBST_RE = /\$\{([^}]+)\}/g;

// The pseudo-fields of the language. A table rather than a chain of branches: the vocabulary is then a list one can
// read, and adding to it is an entry rather than a special case.
const PSEUDO: Record<string, (scope: Scope) => unknown> = {
  [ITEM_REF]: (s) => s.__item,
  [INDEX_REF]: (s) => s.__index,
  // Outside a labelled @each (an @rule prefix) it is the label column's width in spaces, so a line that is not part of
  // a list still starts where the items do.
  [LABEL_REF]: (s) => s.__label ?? " ".repeat(s.__labelWidth ?? 0),
  [BULLET_REF]: (s) => s.__bullet ?? "",
};

/**
 * The walk alone, recorded by NOBODY: for a reader that must know whether it can USE a value before it claims to have
 * read it. An include reads this way, because one that then falls through has to leave the guard free to refuse and
 * hand the raw block back, or the message it carried reaches no screen at all.
 */
export function peek(scope: Scope, key: string): unknown {
  const pseudo = PSEUDO[key];
  // Resolved against the bookkeeping, never against a key the data holds, so it is no part of what a caller records.
  if (pseudo !== undefined) return pseudo(scope);
  return key
    .split(".")
    .reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), scope);
}

export function lookup(scope: Scope, key: string): unknown {
  // Recorded HERE and never by the callers, so one written tomorrow cannot forget to. A dotted path is walked from the
  // root, so its first segment is the only name the data can hold.
  if (PSEUDO[key] === undefined) scope.__read?.add(key.split(".")[0]);
  return peek(scope, key);
}

// An object-list item (from a view's @fields split) is a mapping, not a string, and a naive String() would show
// "[object Object]". Re-serialised to "key: value" prose so ${.} on such an item renders readably.
export function stringify(val: unknown): string {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => (v == null ? k : `${k}: ${stringify(v)}`))
      .join(", ");
  }
  return String(val);
}
