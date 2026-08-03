// The .view language, interpretation half: the directives, applied to a scope.
//
// Directives: @map <name> <val>=<tag> ...    (enum -> style, resolved at parse time)
//             @text <name> <val>="..." ...   (enum -> word, same)
//             @each <field> ... @end          (repeat per list item)
//             @box ... @endbox (+ @head, @right, @foot, @frame)
//             @rule [prefix]                  (inner division, filled by the box)
//             @aside <view> [top|bottom] ... @endaside   (a second column, left)
// Substitutions: ${field}  ${field:tablename}  ${.}  ${#}  ${#label}  ${#bullet}
//
// Every word above is spelled in data/language.ts and every pattern below composes from it: a rename is one edit there,
// never a sweep through these matchers.

import {
  ASIDE,
  BARE,
  BOX,
  BULLET,
  CAP,
  DECLS,
  EACH,
  END,
  ENDASIDE,
  ENDBOX,
  FOOT,
  FRAME,
  HEAD,
  LABEL,
  PAIR_SEP,
  RIGHT,
  RULE,
  TOKEN_SEP,
  declSource,
} from "../data/language.js";
import { composeAside, type AsideAlign } from "../layout/aside.js";
import { BOX_CHROME, flowBody, frameBox } from "../layout/box.js";
import { columnWidths, type PadCtx } from "../layout/columns.js";
import { HANG_MARK, RULE_MARK } from "../layout/marks.js";
import { printedWidth } from "../layout/measure.js";
import { lookup, stringify, type Tables, type Scope } from "../scope.js";
import { loadTemplate } from "./load.js";
import { subst } from "./substitute.js";
import type { ObjectLists } from "./view-data.js";

// eslint-disable-next-line security/detect-non-literal-regexp
const re = (source: string): RegExp => new RegExp(source);

// A directive alone on its line, and one taking a name then the rest of the line.
const ALONE = String.raw`\s*$`;
const REST = String.raw`\s+(.*)$`;
const NAME_THEN_REST = String.raw`[ \t]+(\S+)(.*)$`;

const BOX_RE = re(`^${BOX}${ALONE}`);
// @box's optional token, read in TWO steps like @aside's alignment: the name is matched, then compared. One regex
// carrying an optional quantified group plus a trailing \s*$ nests its quantifiers and backtracks on a near-miss, and
// a token this container does not know MUST be a near-miss. A silently framed box is the one outcome that would teach
// an author their typo was fine. Requiring the space is what keeps "@boxbare" out of it too.
const BOX_TOKEN_RE = re(`^${BOX}${NAME_THEN_REST}`);
const ENDBOX_RE = re(`^${ENDBOX}${ALONE}`);
const HEAD_RE = re(`^${HEAD}${REST}`);
const RIGHT_RE = re(`^${RIGHT}${REST}`);
// @foot names the field, it does not carry text: the zone is wired to the data, so a template cannot render a cause the
// block never stated.
const FOOT_RE = re(String.raw`^${FOOT}[ \t]+(\S+)[ \t]*$`);
const FRAME_RE = re(String.raw`^${FRAME}[ \t]+(\S+)[ \t]+(.*)$`);
const ASIDE_RE = re(`^${ASIDE}${NAME_THEN_REST}`);
const ENDASIDE_RE = re(`^${ENDASIDE}${ALONE}`);
const EACH_RE = re(`^${EACH}${NAME_THEN_REST}`);
// NB: this cannot match "@endbox" or "@endaside", so the terminators never collide.
const END_RE = re(`^${END}${ALONE}`);

// @rule matches by STRING, not by regex (the match site says why), so its spelling is a value shared by the matcher and
// the slice that follows it.
const RULE_PREFIX = `${RULE} `;

// Matched by string rather than by regex: an optional trailing group around [\s\S]* is flagged as backtracking-prone,
// and the shape is too simple to need it.
const isRuleLine = (line: string): boolean => line === RULE || line.startsWith(RULE_PREFIX);

/** The mark, then whatever prefix the rule carries, substituted like any other text. */
const ruleLine = (line: string, scope: Scope, tables: Tables, pad?: PadCtx): string =>
  RULE_MARK + subst(line.slice(RULE_PREFIX.length), scope, tables, pad);

// One declaration each, from the language's own table. The matcher that READS a declaration and the strip that decides
// whether anything is LEFT OVER are the same fact, which keeps a malformed cap="soon" a near-miss rather than a cap.
const declRe = (name: string): RegExp => re(declSource(name));
const LABEL_RE = declRe(LABEL);
const BULLET_RE = declRe(BULLET);
const CAP_RE = declRe(CAP);
const DECL_RES = Object.keys(DECLS).map(declRe);

/** Whatever the fraction of a cap="1/3" yields, a clamp never erases a column. */
const MIN_CELL = 1;

// One field value, read as the list a directive iterates. A lone value is the list of one it obviously is: both readers
// below take fields a HUMAN wrote by hand, and a single item there carries no dash. Accepting only an array made that
// content vanish with no error, so the coercion is shared rather than left to each directive (they disagreed,
// invisibly).
//
// Blank is not an item: a field holding only whitespace reads as empty, which keeps it indistinguishable from a field
// that was never written.
function asList(val: unknown): unknown[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  return stringify(val).trim() === "" ? [] : [val];
}

// The bottom zone of a box, fed by @foot <field>. Its content is a field like any other, so a block that never sets it
// renders as it did before the zone existed. Blank ITEMS are dropped here and not in asList, because the zone is prose
// and wants none of them, while a loop leaves its rows alone.
function zoneLines(scope: Scope, field: string | null): string[] {
  if (field == null) return [];
  return asList(lookup(scope, field))
    .map((x) => stringify(x))
    .filter((l) => l.trim() !== "");
}

// The tone of the outline, fed by @frame <field> <key>=<tone> ... The state that picks the badge picks the border too,
// so they cannot drift apart. An unlisted state leaves the tone undefined and the box keeps its default grey.
function frameTone(scope: Scope, field: string, pairs: string): string | undefined {
  const val = lookup(scope, field);
  if (val == null) return undefined;
  const key = stringify(val).trim();
  if (key === "") return undefined;
  for (const pair of pairs.trim().split(TOKEN_SEP)) {
    const eq = pair.indexOf(PAIR_SEP);
    if (eq <= 0) continue;
    if (pair.slice(0, eq) === key) return pair.slice(eq + PAIR_SEP.length) || undefined;
  }
  return undefined;
}

// The named view's BODY lines, taken as text: no directive is honoured and no substitution runs over them, which keeps
// a region from opening a nested box or a loop it cannot close. A name that resolves nowhere yields no row, which
// composeAside reads as "no column".
function asideRows(name: string, dirs: string | string[]): string[] {
  let rows: string[];
  try {
    rows = loadTemplate(name, dirs).body;
  } catch {
    return [];
  }
  // The file's terminating newline leaves a last empty element, and a blank line around the art is punctuation rather
  // than a row of the picture. Both would shift the column against its flow, so the ends are trimmed; every row BETWEEN
  // them is kept, blank ones included.
  let first = 0;
  let last = rows.length;
  while (first < last && printedWidth(rows[first]) === 0) first++;
  while (last > first && printedWidth(rows[last - 1]) === 0) last--;
  return rows.slice(first, last);
}

// `limit` is the box width ceiling and `viewsPath` the ordered template dirs, both resolved once by the render entry
// and carried down: the directives ask the platform nothing.
export function renderBody(
  body: string[],
  scope: Scope,
  tables: Tables,
  objectLists: ObjectLists,
  limit: number,
  viewsPath: string | string[]
): string[] {
  const out: string[] = [];
  for (let i = 0; i < body.length; i++) {
    // Deliberately NOT nestable: nothing needs it, and a depth counter would be untested surface. An unclosed @box
    // frames the rest of the template, visibly wrong rather than silently dropped.
    const boxToken = body[i].match(BOX_TOKEN_RE);
    const bare = boxToken != null && boxToken[1] === BARE && boxToken[2].trim() === "";
    if (BOX_RE.test(body[i]) || bare) {
      let head = "";
      let right = "";
      let footField: string | null = null;
      let tone: string | undefined;
      const inner: string[] = [];
      i++;
      for (; i < body.length && !ENDBOX_RE.test(body[i]); i++) {
        // A bare container has no border to hang them on, so these four are not its words: they fall through to the
        // body and print, which is already what they do outside any box at all.
        const hm = bare ? null : body[i].match(HEAD_RE);
        const rm = bare ? null : body[i].match(RIGHT_RE);
        const fm = bare ? null : body[i].match(FOOT_RE);
        const cm = bare ? null : body[i].match(FRAME_RE);
        if (hm) head = subst(hm[1], scope, tables);
        else if (rm) right = subst(rm[1], scope, tables);
        else if (fm) footField = fm[1];
        else if (cm) tone = frameTone(scope, cm[1], cm[2]);
        else inner.push(body[i]);
      }
      const drawn = renderBody(inner, scope, tables, objectLists, limit, viewsPath);
      out.push(
        ...(bare
          ? flowBody(drawn, limit)
          : frameBox(head, right, drawn, zoneLines(scope, footField), tone, limit))
      );
      continue;
    }
    // Parsed in two steps, the name then its token: one regex carrying an OPTIONAL quantified group plus a trailing
    // \s*$ nests its quantifiers and backtracks on a near-miss. A token that is not an alignment word means this is NOT
    // a region, so the line prints as text rather than swallowing the lines below it.
    const aside = body[i].match(ASIDE_RE);
    const token = aside ? aside[2].trim() : "";
    const align: AsideAlign | null =
      token === "" ? "center" : token === "top" ? "top" : token === "bottom" ? "bottom" : null;
    if (aside && align != null) {
      const inner: string[] = [];
      i++;
      for (; i < body.length && !ENDASIDE_RE.test(body[i]); i++) inner.push(body[i]);
      out.push(
        ...composeAside(
          asideRows(aside[1], viewsPath),
          renderBody(inner, scope, tables, objectLists, limit, viewsPath),
          align,
          limit - BOX_CHROME
        )
      );
      continue;
    }
    if (isRuleLine(body[i])) {
      out.push(ruleLine(body[i], scope, tables));
      continue;
    }
    // A bullet is DECLARED and not inferred from the body line because the wrapper has to know where the marker ENDS,
    // or a wrapped item repeats its bullet on every row.
    //
    // Parsed in two steps, the field then its declarations, because one regex carrying two optional quoted groups plus
    // a trailing \s*$ backtracks on a near-miss.
    const head = body[i].match(EACH_RE);
    const attrs = head ? head[2] : "";
    const labelDecl = attrs.match(LABEL_RE);
    const bulletDecl = attrs.match(BULLET_RE);
    const capDecl = attrs.match(CAP_RE);
    const leftover = DECL_RES.reduce((rest, re) => rest.replace(re, ""), attrs).trim();
    const eachField = head && leftover === "" ? head[1] : null;
    if (eachField != null) {
      const inner: string[] = [];
      i++;
      while (i < body.length && !END_RE.test(body[i])) {
        inner.push(body[i]);
        i++;
      }
      const items = asList(lookup(scope, eachField));
      // Measured over the items of THIS list and applied on the per-item scope built below, so nothing outside a list
      // is padded.
      const fields = objectLists[eachField];
      const pad: PadCtx = {
        widths: columnWidths(items, fields, inner, tables),
        tail: fields && fields.length > 0 ? fields[fields.length - 1] : undefined,
      };
      if (capDecl) {
        const cap = Math.max(
          MIN_CELL,
          Math.floor((limit * Number(capDecl[1])) / Number(capDecl[2]))
        );
        for (const f of Object.keys(pad.widths)) {
          pad.widths[f] = Math.min(pad.widths[f], cap);
        }
      }
      const label = labelDecl?.[1];
      const bullet = bulletDecl?.[1];
      const labelCol = scope.__labelWidth ?? 0;
      items.forEach((item: unknown, idx: number) => {
        const itemScope: Scope = {
          ...scope,
          __item: item,
          __index: idx + 1,
          __label:
            label == null
              ? ""
              : idx === 0
                ? label + " ".repeat(Math.max(0, labelCol - printedWidth(label)))
                : " ".repeat(labelCol),
        };
        if (item && typeof item === "object") {
          Object.assign(itemScope, item as Record<string, unknown>);
        }
        // Substituted on the item scope, so a bullet may carry ${#} or a field of the item; the boundary is appended
        // once here rather than spelled out in every template.
        if (bullet != null) {
          itemScope.__bullet = subst(bullet, itemScope, tables) + HANG_MARK;
        }
        // A rule is the ONE directive an @each body honours. A divider BETWEEN items is a thing only the loop can
        // place, and the collapsing in box.ts is what then drops the trailing one; everything else in there is a line
        // of the item and belongs to substitution.
        for (const l of inner) {
          out.push(isRuleLine(l) ? ruleLine(l, itemScope, tables, pad) : subst(l, itemScope, tables, pad));
        }
      });
    } else {
      out.push(subst(body[i], scope, tables));
    }
  }
  return out;
}
