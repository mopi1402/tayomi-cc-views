// The SCOPE: how a field name written in a template resolves to a value, and how that value becomes text.
//
// A leaf beside style.ts, because its two consumers must not depend on each other: the substituter (template/) and the
// column measurer (layout/) both read a field and coerce it to a string, so neither can own the accessors.

import { engineBadge } from "./data/engine.js";
import {
  BULLET_REF,
  DEFAULT_KEY,
  ENGINE_REF,
  FOLD_REF,
  HANG_REF,
  INDEX_REF,
  ITEM_REF,
  LABEL_REF,
  TAIL_REF,
} from "./data/language.js";
import { HANG_MARK, TAIL_MARK, VOID_MARK } from "./data/marks.js";

/**
 * The data a view renders: the block's parsed fields, plus the engine's own bookkeeping.
 *
 * The `__` members are DECLARED here rather than typed where they are written: a scope is an open record, so a misspelt
 * `__labelWidth` would be a silently absent field and not an error.
 */
export interface Scope extends Record<string, unknown> {
  __item?: unknown;
  /** Counted from one. */
  __index?: number;
  /** Carried by the FIRST item of a section, blank on the others. */
  __label?: string;
  __bullet?: string;
  /** The column every label pads to, the widest the template declares. */
  __labelWidth?: number;
  /**
   * Every top-level key this render ASKED FOR, written by lookup below and by nothing else. Recorded at the accessor
   * because reading the template's SOURCE gathers an approximation, and every naming form it fails to recognise blanks
   * a good render (.tayomi/specs/fix/carrier-guards.md).
   */
  __read?: Set<string>;
}

/** A scope key read as a NAME. Only a string can name a class: a list under that key is data the slot must not read. */
export function nameField(scope: Scope, key: string): string | undefined {
  const val = scope[key];
  return typeof val === "string" ? val.trim() : undefined;
}

/** ONE registry for @map and @text, because the substitution that spends them is one form. */
export const STYLE_TABLE = "style";
export const TEXT_TABLE = "text";
export interface Table {
  kind: typeof STYLE_TABLE | typeof TEXT_TABLE;
  entries: Record<string, string>;
}

export type Tables = Record<string, Table>;

/** A declared entry renders verbatim, a blank takes the reserved one, anything else ECHOES rather than being swallowed. */
export function tableWord(table: Table, key: string): string {
  if (key === "") return table.entries[DEFAULT_KEY] ?? "";
  return table.entries[key] ?? key.toUpperCase();
}

// Shared, because the column measurer reads the SAME expressions to learn which @map a column renders through.
export const SUBST_RE = /\$\{([^}]+)\}/g;

const refBase = (ref: string): string => ref.split(":")[0].split(".")[0];

/** A substitution reaching for the engine's own bookkeeping, so a view spending only these still draws on empty data. */
export const readsBookkeeping = (ref: string): boolean => refBase(ref).startsWith(INDEX_REF);

/** The field a substitution reaches for, or null when it names none: the bookkeeping, or the item under an @each. */
export function slotField(ref: string): string | null {
  const base = refBase(ref);
  return base === "" || readsBookkeeping(ref) ? null : base;
}

const PSEUDO: Record<string, (scope: Scope) => unknown> = {
  [ITEM_REF]: (s) => s.__item,
  [INDEX_REF]: (s) => s.__index,
  // Outside a labelled @each (an @rule prefix) it is the label column's width in spaces, so a line that is not part of
  // a list still starts where the items do.
  [LABEL_REF]: (s) => s.__label ?? " ".repeat(s.__labelWidth ?? 0),
  [BULLET_REF]: (s) => s.__bullet ?? "",
  // The three that read no scope: the mark IS the value.
  [HANG_REF]: () => HANG_MARK,
  [FOLD_REF]: () => VOID_MARK,
  [TAIL_REF]: () => TAIL_MARK,
  [ENGINE_REF]: () => engineBadge(),
};

/**
 * The walk alone, recorded by NOBODY: for a reader that must know whether it can USE a value before claiming to have
 * read it. An include reads this way, so one that then falls through leaves the guard free to hand the raw block back.
 */
export function peek(scope: Scope, key: string): unknown {
  const pseudo = PSEUDO[key];
  if (pseudo !== undefined) return pseudo(scope); // bookkeeping, so no part of what a caller records
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

// A naive String() on an object-list item (from @fields) would show "[object Object]".
export function stringify(val: unknown): string {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => (v == null ? k : `${k}: ${stringify(v)}`))
      .join(", ");
  }
  return String(val);
}
