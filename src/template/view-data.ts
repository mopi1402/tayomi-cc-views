// The parser for the flat, line-oriented data format the view blocks carry.
//
//   "key: value"  -> scalar field, value = the rest of the line, verbatim
//   "key:"        -> opens a list field named key
//   "- item"      -> appends an item to the current list
//   "  k: v"      -> a pair of the mapping that key opened, ONE level and no deeper
//   anything else -> ignored (keeps the parser total)
//
// Not YAML: the blocks carry prose it chokes on, so a value stays OPAQUE to end of line and the parser never throws.
//
// Its OWN module because TWO readers must never disagree: this engine, and a host's gate judging the same block
// without drawing it. That gate cannot reuse the hook edge's parse, so its duplicate once DIVERGED.
//
// Under `@fields`, each leading field takes one token and the LAST takes the rest.
//
// TWO ways in and ONE grammar out: a block writes those lines, and a decorated table of TWO columns writes the same
// fields as rows (namedFields below), the first cell naming what the second fills.

import {
  FIELD_CONTENT,
  FIELD_HEAD,
  FIELD_LABEL,
  FIELD_ROWS,
  FIELD_TONE,
  FIELD_TYPE,
} from "../data/language.js";
import { ITEM_MARK, NAME_MARK } from "../data/markup.js";
import { inert } from "../style.js";

export type ObjectLists = Record<string, string[]>;

// eslint-disable-next-line security/detect-non-literal-regexp
const re = (source: string): RegExp => new RegExp(source);

/** What a field may be CALLED, whichever way it arrives: a word, never opening on a digit. One shape, both readings. */
const FIELD_NAME = String.raw`[A-Za-z_][\w-]*`;
const FIELD_NAME_RE = re(`^${FIELD_NAME}$`);

/** One pair, the key NAMED and the value OPAQUE to end of line. Indented or not is what parts the two matchers below. */
const PAIR_SOURCE = String.raw`(${FIELD_NAME})${NAME_MARK}[ \t]?(.*)$`;

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

/** The two cells a table of TWO columns lands in. A row carrying these and nothing else is what the arity test IS. */
const PAIR_CELLS = [FIELD_LABEL, FIELD_CONTENT];

function isPair(row: unknown): row is Record<string, string> {
  if (row === null || typeof row !== "object" || Array.isArray(row)) return false;
  const cells = row as Record<string, unknown>;
  return (
    Object.keys(cells).length === PAIR_CELLS.length &&
    PAIR_CELLS.every((name) => typeof cells[name] === "string")
  );
}

/** The rows of a two-column table, or null for any other arity: their own keys are what say how wide they were. */
function pairRows(rows: unknown): Record<string, string>[] | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const pairs: Record<string, string>[] = [];
  for (const row of rows as unknown[]) {
    if (!isPair(row)) return null;
    pairs.push(row);
  }
  return pairs;
}

/**
 * The rows a TWO-column table carried (no other arity), read as the named fields a block writes: the first cell names
 * the field, lowercased (empty continues the field above), a value opening `- ` appends to that field's list, anything
 * else is a scalar. An illegal name is SKIPPED, never a parse failure: this layer is as total as parseData. Nothing
 * here neutralises, a cell arrives from the carrier already inert.
 */
function derive(rows: unknown, objectLists: ObjectLists): Record<string, unknown> {
  const pairs = pairRows(rows);
  if (pairs === null) return {};
  const data: Record<string, unknown> = {};
  let open = "";
  for (const row of pairs) {
    const named = row[FIELD_LABEL].trim().toLowerCase();
    if (named !== "") {
      if (!FIELD_NAME_RE.test(named)) continue;
      open = named;
    }
    if (open === "") continue; // a continuation with no field above it to continue
    const value = row[FIELD_CONTENT];
    const item = value.match(ITEM_RE);
    if (item === null) {
      data[open] = value;
      continue;
    }
    // An item lands in a LIST or not at all, the block's own rule: a dash under `note: prose` appends nothing there,
    // so it appends nothing here and the scalar survives. Fresh or already a list, the item appends.
    const standing = data[open];
    if (standing !== undefined && !Array.isArray(standing)) continue;
    const list = Array.isArray(standing) ? (standing as unknown[]) : [];
    const fields = objectLists[open];
    list.push(fields ? splitFields(item[1], fields) : item[1]);
    data[open] = list;
  }
  // Engine-owned words never derive: `type`/`tone` ride the decorator line where the author says them on purpose, and
  // `rows`/`head` are the carrier's own reading, where a derived STRING would stand when the header row is blank.
  for (const reserved of [FIELD_ROWS, FIELD_HEAD, FIELD_TYPE, FIELD_TONE]) delete data[reserved];
  return data;
}

/**
 * The SECOND way in: a payload's own fields, with the named reading of a two-column table folded UNDER them, so
 * `rows` and `head` keep their shape and precedence. The same object comes back when there is nothing to derive.
 */
export function namedFields(
  data: Record<string, unknown>,
  objectLists: ObjectLists = {}
): Record<string, unknown> {
  const named = derive(data[FIELD_ROWS], objectLists);
  return Object.keys(named).length === 0 ? data : { ...named, ...data };
}
