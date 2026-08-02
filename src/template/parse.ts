// The .view language, parse half: template text in, a Template struct out.
//
// Pure text-to-struct, no disk and no data: the declarations a template makes about
// itself (its enum tables, its object-list fields, the width of its label column)
// are all resolvable before a single field value is known.

import {
  EACH,
  FIELDS,
  LABEL,
  MAP,
  PAIR_SEP,
  TOKEN_SEP,
  TONE,
  declSource,
} from "../data/language.js";
import { printedWidth } from "../layout/measure.js";
import { SUBST_RE, type Maps } from "../scope.js";
import type { ObjectLists } from "./view-data.js";

// Every pattern composes from the keyword table, so renaming a directive is one edit
// there and no matcher is left answering to the old word.
const NAME_AND_REST = String.raw`\s+(\S+)\s+(.*)$`;
// eslint-disable-next-line security/detect-non-literal-regexp
const re = (source: string, flags?: string): RegExp => new RegExp(source, flags);

const MAP_RE = re(`^${MAP}${NAME_AND_REST}`);
const FIELDS_RE = re(`^${FIELDS}${NAME_AND_REST}`);
// @tone takes ONE tag name and nothing else: it names the template's default class, so
// a pair (the @map shape) would be a second mapping table for a decision the palette
// already holds. A malformed line is body, like every other near-miss in this parser.
const TONE_RE = re(String.raw`^${TONE}[ \t]+(\w+)[ \t]*$`);
const LABELS_RE = re(String.raw`^${EACH}[ \t]+\S+[ \t]*${declSource(LABEL)}`, "gm");

/** A line the template author wrote for themselves: dropped before anything reads it. */
const COMMENT_RE = /^\s*#/;
/** Every CR, so a template saved on Windows parses as the same lines as one saved here. */
const CR_RE = /\r/g;

export interface Template {
  // enum-to-style tables, declared with @map <name> <val>=<tag> ...
  maps: Maps;
  // the lists whose items split into fields, declared with @fields <list> a b c
  objectLists: ObjectLists;
  // every remaining line, in order: the part that renders
  body: string[];
  // The class this template's tone slot holds when no carrier names one, declared
  // with @tone <tag>. A template's own DEFAULT look, not an override: a tone:
  // or a type: on the carrier outranks it (the chain lives in render.ts).
  tone?: string;
  // The label column is as wide as the WIDEST label the template declares, so a
  // section can be named REMINDER without every other section's bar shifting by
  // hand. It is computed here because a template line cannot see the others.
  labelWidth: number;
  // Does the body spend a SLOT, `${...}` in any of its forms? What it separates is a
  // template that is static (welcome, the health check, which renders perfectly with
  // no data at all) from one that is waiting for some, and that is the only honest
  // way to ask whether a render came out hollow: a template drawing literal furniture
  // always puts ink on screen, so measuring the OUTPUT can never tell.
  //
  // Bookkeeping refs (`${#}`, `${#label}`) count, deliberately. A template spending
  // one with no list to walk renders a column of spaces, which is the same skeleton.
  spendsSlots: boolean;
}

export function parseTemplate(text: string): Template {
  const tmpl = text.replace(CR_RE, "");
  const maps: Maps = {};
  const objectLists: ObjectLists = {};
  const body: string[] = [];
  let tone: string | undefined;
  for (const line of tmpl.split("\n")) {
    if (COMMENT_RE.test(line)) continue;
    const mm = line.match(MAP_RE);
    const ff = line.match(FIELDS_RE);
    const tn = line.match(TONE_RE);
    if (mm) {
      const map: Record<string, string> = {};
      for (const pair of mm[2].trim().split(TOKEN_SEP)) {
        const [k, v] = pair.split(PAIR_SEP);
        if (k && v) map[k] = v;
      }
      maps[mm[1]] = map;
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
  // Over the BODY alone: a comment documenting a slot is not a template spending one,
  // and comments are exactly where an author writes the shape out to explain it.
  const spendsSlots = body.join("\n").match(SUBST_RE) !== null;
  return { maps, objectLists, body, labelWidth, tone, spendsSlots };
}
