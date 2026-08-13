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
  PAYLOAD_FENCE,
  PAYLOAD_FIELDS,
  PAYLOAD_TABLE,
  TEXT,
  TEXT_PAIR,
  TOKEN_SEP,
  TONE,
  USE,
  DIAGRAM,
  declSource,
} from "../data/language.js";
import { ARG_FIELD, ARG_LIST, TAKES } from "../data/grammar.js";
import { printedWidth } from "../layout/measure.js";
import {
  STYLE_TABLE,
  SUBST_RE,
  TEXT_TABLE,
  readsBookkeeping,
  slotField,
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
/** Alone on its line, taking no argument: it declares a KIND of body, and a kind has nothing to parameterise. */
const DIAGRAM_RE = re(String.raw`^${DIAGRAM}[ \t]*$`);
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
  // Is the block's body a DIAGRAM SOURCE rather than the flat data format? It changes who reads the body, so it is
  // settled here, where the template says it, and never guessed from the view's name.
  diagram: boolean;
  // Every field name the body spends: each substitution's own, each field a directive NAMES, and everything an
  // @fields declares. What a block has to carry, and what `payload` below is derived from.
  spends: string[];
  // The ONE payload shape this view accepts from a decorator, or null for a view that expects none. Derived from
  // `spends` (a view spending `rows` is asking for a table), except the fence, which only @diagram can claim. Settled
  // here so the render's refusal and the catalogue's word come off the same value and cannot drift.
  payload: string | null;
}

/** The words whose FIRST argument names a field of the block, read off the shape each one declares. */
const NAMES_A_FIELD = new Set(
  Object.keys(TAKES).filter(
    (word) => TAKES[word].startsWith(ARG_FIELD) || TAKES[word].startsWith(ARG_LIST)
  )
);

function spentFields(body: string[], objectLists: ObjectLists): string[] {
  const spent = new Set<string>();
  for (const [, ref] of body.join("\n").matchAll(SUBST_RE)) {
    const field = slotField(ref);
    if (field !== null) spent.add(field);
  }
  for (const line of body) {
    // UnTRIMMED: a directive sits at column 0, so an indented line splits on a leading empty token and matches nothing.
    const [word, arg] = line.split(TOKEN_SEP);
    if (arg !== undefined && NAMES_A_FIELD.has(word)) spent.add(arg);
  }
  for (const [list, fields] of Object.entries(objectLists)) {
    spent.add(list);
    for (const field of fields) spent.add(field);
  }
  return [...spent].sort();
}

/**
 * Which payload a view is asking for, scored on what it spends. Nothing but scoring can answer it, since `content`
 * belongs to both shapes and a view spending it ALONE (quote.view) is asking for the one that leaves the least unspent.
 * A tie is reported as none rather than guessed.
 */
function payloadOf(spent: readonly string[]): string | null {
  const held = new Set(spent);
  const scored = Object.entries(PAYLOAD_FIELDS).map(([shape, fields]) => {
    const hits = fields.filter((field) => held.has(field)).length;
    return { shape, hits, score: hits - (fields.length - hits) };
  });
  if (scored.every((s) => s.hits === 0)) return null;
  const best = Math.max(...scored.map((s) => s.score));
  const winners = scored.filter((s) => s.score === best);
  return winners.length === 1 ? winners[0].shape : null;
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
  let diagram = false;
  for (const line of tmpl.split("\n")) {
    if (COMMENT_RE.test(line)) continue;
    const mm = line.match(MAP_RE);
    const tt = line.match(TEXT_RE);
    const ff = line.match(FIELDS_RE);
    const tn = line.match(TONE_RE);
    if (DIAGRAM_RE.test(line)) {
      diagram = true;
    } else if (mm) {
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
  const spends = spentFields(body, objectLists);
  // A sectioned view spends its OWN names (said, status), which no scoring can place; the table is the one shape that
  // yields arbitrary named fields, so spending slots at all is asking for one. A STATIC template expects none: a
  // health check's optional @foot garnish does not make it a view a message summons.
  const payload =
    diagram ? PAYLOAD_FENCE : (payloadOf(spends) ?? (spendsSlots ? PAYLOAD_TABLE : null));
  return { tables, objectLists, body, labelWidth, tone, spendsSlots, diagram, spends, payload };
}
