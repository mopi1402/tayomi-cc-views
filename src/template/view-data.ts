// The parser for the flat, line-oriented data format the view blocks carry.
//
//   "key: value"  -> scalar field, value = the rest of the line, verbatim
//   "key:"        -> opens a list field named key
//   "- item"      -> appends an item to the current list
//   anything else -> ignored (keeps the parser total)
//
// NOT a recursive format. The blocks carry human prose (commit messages, file paths,
// `code` spans) that YAML chokes on: a ": " inside a value reads as a nested mapping,
// a leading backtick is reserved. Here a value is OPAQUE to end of line, so colons,
// backticks and brackets are just text, and the parser never throws, so a render never
// blanks on content.
//
// It lives in its OWN module because the format has TWO readers that must never
// disagree: the render engine, and a host's judge of the same block (a gate hook)
// which never draws it. The judge cannot reuse the hook edge's parse, since an edge
// ends in a main()-guard that is TRUE inside a bundle, and two main() in one process
// steal each other's stdin (commit 249da20, in the host this engine came from). The
// first answer was to re-implement twelve lines of scalar parsing inside the gate.
// That duplicate DIVERGED: a cause written as a list rendered correctly on screen
// while the gate read an empty field and sent the turn back for a missing cause.
//
// For a list declared with `@fields`, each item splits into the declared fields: every
// leading field takes one whitespace-delimited token, the LAST takes the rest. Leading
// fields are ids and enums, the last is prose, so the split cannot fail.

import { inert } from "../style.js";

export type ObjectLists = Record<string, string[]>;

// The four line shapes the format knows, named because the format IS these four lines:
// a reader learns it here rather than by decoding a literal at its use site.

/** `key: value`, the value OPAQUE to end of line. An empty one OPENS a list instead. */
const KV_RE = /^([A-Za-z_][\w-]*):[ \t]?(.*)$/;
/** `- item`, an entry appended to the list the key above opened. */
const ITEM_RE = /^[ \t]*-[ \t]+(.*)$/;
/** A leading @fields field takes ONE token; whatever follows is the next field's. */
const LEADING_FIELD_RE = /^(\S+)[ \t]+([\s\S]*)$/;
/** Trailing blanks, dropped so an invisible tail never lands inside a value. */
const TRAILING_WS_RE = /\s+$/;

// Neutralise the markup a MESSAGE wrote. Deliberately NOT part of parseData: the judge
// above compares the same values and must see them as the block typed them.
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
