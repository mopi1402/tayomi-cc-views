// The .view language, parse half: template text in, a Template struct out.
//
// Pure text-to-struct, no disk and no data: the declarations a template makes about itself are all resolvable before a
// single field value is known.

import {
  EACH,
  FIELDS,
  FROM,
  LABEL,
  MAP,
  PAIR_SEP,
  TEXT,
  TEXT_PAIR,
  TOKEN_SEP,
  TONE,
  USE,
  declSource,
} from "../data/language.js";
import { printedWidth } from "../layout/measure.js";
import {
  STYLE_TABLE,
  SUBST_RE,
  TEXT_TABLE,
  readsBookkeeping,
  type Table,
  type Tables,
} from "../scope.js";
import type { ObjectLists } from "./view-data.js";

// Every pattern composes from the keyword table, so renaming a directive is one edit there.
const NAME_AND_REST = String.raw`\s+(\S+)\s+(.*)$`;
// eslint-disable-next-line security/detect-non-literal-regexp
const re = (source: string, flags?: string): RegExp => new RegExp(source, flags);

const MAP_RE = re(`^${MAP}${NAME_AND_REST}`);
const TEXT_RE = re(`^${TEXT}${NAME_AND_REST}`);
const TEXT_PAIR_RE = re(TEXT_PAIR, "g");
const FIELDS_RE = re(`^${FIELDS}${NAME_AND_REST}`);
// ONE tag name and nothing else: a pair (the @map shape) would be a second mapping table for a decision the palette
// already holds. A malformed line is body, like every other near-miss in this parser.
const TONE_RE = re(String.raw`^${TONE}[ \t]+(\w+)[ \t]*$`);
const LABELS_RE = re(String.raw`^${EACH}[ \t]+\S+[ \t]*${declSource(LABEL)}`, "gm");
const USE_FIELD_RE = re(String.raw`^${USE}[ \t]+\S+[ \t]+${FROM}[ \t]+\S+[ \t]*$`);

/** A line the template author wrote for themselves: dropped before anything reads it. */
const COMMENT_RE = /^\s*#/;
/** Every CR, so a template saved on Windows parses as the same lines as one saved here. */
const CR_RE = /\r/g;

export interface Template {
  // @map <name> <val>=<tag> and @text <name> <val>="...". One registry, because one substitution form spends both.
  tables: Tables;
  objectLists: ObjectLists;
  // every remaining line, in order: the part that renders
  body: string[];
  // A DEFAULT, not an override: a tone: or a type: on the carrier outranks it (render.ts).
  tone?: string;
  // As wide as the WIDEST label the template declares, so a section can be named REMINDER without every other section's
  // bar shifting by hand. Computed here because a template line cannot see the others.
  labelWidth: number;
  // Does the body spend a SLOT? It separates a static template from one waiting for data, and it is the only honest way
  // to ask whether a render came out hollow: a template drawing literal furniture always puts ink on screen.
  //
  // A bookkeeping ref (`${#}`, `${#engine}`) does NOT count: it resolves against the engine, so a view spending only
  // those still draws on an empty block. An include NAMING a field does count.
  spendsSlots: boolean;
}

/** @map's pairs: whitespace-separated, because a tag name has no space to lose. */
function stylePairs(tail: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const pair of tail.trim().split(TOKEN_SEP)) {
    const [k, v] = pair.split(PAIR_SEP);
    if (k && v) entries[k] = v;
  }
  return entries;
}

/** @text's pairs: quote-aware, so a value keeps every space and glyph the author wrote. */
function textPairs(tail: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const m of tail.matchAll(TEXT_PAIR_RE)) entries[m[1]] = m[2];
  return entries;
}

/**
 * A name claimed by BOTH directives is a template error rather than a merge: the two answer the very same
 * `${field:name}`, so a merge would leave the winner to the order the lines happen to sit in. Thrown, so the carrier
 * fails open and the raw block shows.
 */
function declare(tables: Tables, name: string, table: Table): void {
  const prior = tables[name];
  if (prior !== undefined && prior.kind !== table.kind) {
    throw new Error(`template: ${name} is declared by both ${MAP} and ${TEXT}`);
  }
  tables[name] = table;
}

export function parseTemplate(text: string): Template {
  const tmpl = text.replace(CR_RE, "");
  const tables: Tables = {};
  const objectLists: ObjectLists = {};
  const body: string[] = [];
  let tone: string | undefined;
  for (const line of tmpl.split("\n")) {
    if (COMMENT_RE.test(line)) continue;
    const mm = line.match(MAP_RE);
    const tt = line.match(TEXT_RE);
    const ff = line.match(FIELDS_RE);
    const tn = line.match(TONE_RE);
    if (mm) {
      declare(tables, mm[1], { kind: STYLE_TABLE, entries: stylePairs(mm[2]) });
    } else if (tt) {
      declare(tables, tt[1], { kind: TEXT_TABLE, entries: textPairs(tt[2]) });
    } else if (ff) {
      objectLists[ff[1]] = ff[2].trim().split(TOKEN_SEP);
    } else if (tn) {
      tone = tn[1];
    } else {
      body.push(line);
    }
  }
  const labelWidth = [...tmpl.matchAll(LABELS_RE)].reduce(
    (n, m) => Math.max(n, printedWidth(m[1])),
    0
  );
  // Over the BODY alone: a comment documenting a slot is not a template spending one, and comments are exactly where an
  // author writes the shape out to explain it.
  const spendsSlots =
    [...body.join("\n").matchAll(SUBST_RE)].some(([, ref]) => !readsBookkeeping(ref)) ||
    body.some((line) => USE_FIELD_RE.test(line));
  return { tables, objectLists, body, labelWidth, tone, spendsSlots };
}
