// The parser for the flat, line-oriented data format the view blocks carry.
//
//   "key: value"  -> scalar field, value = the rest of the line, verbatim
//   "key:"        -> opens a list field named key
//   "- item"      -> appends an item to the current list
//   "  k: v"      -> a pair of the mapping that key opened, ONE level and no deeper
//   anything else -> ignored (keeps the parser total)
//
// Not YAML and never will be: the blocks carry prose it chokes on, so a value stays OPAQUE to end of line and the
// parser never throws. Nesting rides on INDENTATION alone, which leaves that opacity untouched. It exists because a
// view fed to another (`@use x from k`) needs its own field, and because these lines used to match nothing and be
// dropped in silence: a field a message wrote then reached no screen at all, neither drawn nor in the raw fallback.
//
// Its OWN module because the format has TWO readers that must never disagree: this engine, and a host's gate judging
// the same block without drawing it. That gate cannot reuse the hook edge's parse (an edge ends in a main()-guard, and
// two main() in one process steal each other's stdin), so it re-implemented the parse once and the duplicate DIVERGED.
//
// For a list declared with `@fields`, each item splits into the declared fields: every leading field takes one
// whitespace-delimited token, the LAST takes the rest.

import { ITEM_MARK, NAME_MARK } from "../data/markup.js";
import { inert } from "../style.js";

export type ObjectLists = Record<string, string[]>;

// eslint-disable-next-line security/detect-non-literal-regexp
const re = (source: string): RegExp => new RegExp(source);

/** One pair, the key NAMED and the value OPAQUE to end of line. Indented or not is what parts the two matchers below. */
const PAIR_SOURCE = String.raw`([A-Za-z_][\w-]*)${NAME_MARK}[ \t]?(.*)$`;

/** `key: value`. An empty value OPENS a list instead. */
const KV_RE = re(`^${PAIR_SOURCE}`);
/** `- item`, an entry appended to the list the key above opened. */
const ITEM_RE = re(String.raw`^[ \t]*${ITEM_MARK}[ \t]+(.*)$`);
/** The same pair, INDENTED: it belongs to the key above rather than to the block. The indent is the whole signal. */
const NESTED_KV_RE = re(`^[ \t]+${PAIR_SOURCE}`);
/** A leading @fields field takes ONE token; whatever follows is the next field's. */
const LEADING_FIELD_RE = /^(\S+)[ \t]+([\s\S]*)$/;
/** Trailing blanks, dropped so an invisible tail never lands inside a value. */
const TRAILING_WS_RE = /\s+$/;

// Neutralise the markup a MESSAGE wrote. Deliberately NOT part of parseData: the judge above compares the same values
// and must see them as the block typed them.
export function inertData(data: Record<string, unknown>): Record<string, unknown> {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return inert(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, walk(v)]));
}

function splitFields(item: string, fields: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  let rest = item;
  for (let i = 0; i < fields.length - 1; i++) {
    const m = rest.match(LEADING_FIELD_RE);
    if (m) {
      obj[fields[i]] = m[1];
      rest = m[2];
    } else {
      obj[fields[i]] = rest;
      rest = "";
    }
  }
  obj[fields[fields.length - 1]] = rest;
  return obj;
}

export function parseData(
  text: string,
  objectLists: ObjectLists = {}
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  let list: unknown[] | null = null;
  let map: Record<string, unknown> | null = null;
  let open = "";
  let listFields: string[] | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(TRAILING_WS_RE, "");
    if (!line.trim()) continue;
    const item = line.match(ITEM_RE);
    if (item && list) {
      list.push(listFields ? splitFields(item[1], listFields) : item[1]);
      continue;
    }
    // A bare `key:` opens a LIST, as it always has, and turns into a mapping the first time an indented pair arrives.
    // Deciding on the pair rather than up front is what keeps a key followed by nothing the empty list it used to be.
    const nested = line.match(NESTED_KV_RE);
    if (nested && (map !== null || (list !== null && list.length === 0))) {
      if (map === null) {
        map = {};
        data[open] = map;
        list = null;
        listFields = null;
      }
      map[nested[1]] = nested[2];
      continue;
    }
    const kv = line.match(KV_RE);
    if (kv) {
      const [, key, val] = kv;
      map = null;
      open = key;
      if (val === "") {
        list = [];
        listFields = objectLists[key] ?? null;
        data[key] = list;
      } else {
        data[key] = val;
        list = null;
        listFields = null;
      }
    }
    // an unrecognised line is ignored: the parser must never throw
  }
  return data;
}
