// The parser for the flat, line-oriented data format the view blocks carry.
//
//   "key: value"  -> scalar field, value = the rest of the line, verbatim
//   "key:"        -> opens a list field named key
//   "- item"      -> appends an item to the current list
//   anything else -> ignored (keeps the parser total)
//
// NOT a recursive format, because the blocks carry prose YAML chokes on: a ": " inside a value would read as a nested
// mapping, a leading backtick is reserved. Here a value is OPAQUE to end of line, and the parser never throws.
//
// Its OWN module because the format has TWO readers that must never disagree: this engine, and a host's gate judging
// the same block without drawing it. That gate cannot reuse the hook edge's parse (an edge ends in a main()-guard, and
// two main() in one process steal each other's stdin), so it re-implemented the parse once and the duplicate DIVERGED.
//
// For a list declared with `@fields`, each item splits into the declared fields: every leading field takes one
// whitespace-delimited token, the LAST takes the rest.

import { inert } from "../style.js";

export type ObjectLists = Record<string, string[]>;

/** `key: value`, the value OPAQUE to end of line. An empty one OPENS a list instead. */
const KV_RE = /^([A-Za-z_][\w-]*):[ \t]?(.*)$/;
/** `- item`, an entry appended to the list the key above opened. */
const ITEM_RE = /^[ \t]*-[ \t]+(.*)$/;
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
  let listFields: string[] | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(TRAILING_WS_RE, "");
    if (!line.trim()) continue;
    const item = line.match(ITEM_RE);
    if (item && list) {
      list.push(listFields ? splitFields(item[1], listFields) : item[1]);
      continue;
    }
    const kv = line.match(KV_RE);
    if (kv) {
      const [, key, val] = kv;
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
