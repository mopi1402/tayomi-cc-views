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
  ALIGN_CENTER,
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
  FIELD_HEAD,
  FIELD_TONE,
  FIELD_TYPE,
  FOOT,
  FRAME,
  FROM,
  HEAD,
  LABEL,
  PAIR_SEP,
  RIGHT,
  RULE,
  TOKEN_SEP,
  USE,
  declSource,
  isAlign,
} from "../data/language.js";
import { IN_BOX, IN_BOX_BARE, IN_EACH, TOP, readsHere } from "../data/grammar.js";
import { asideMainWidth, composeAside, type AsideAlign } from "../layout/aside.js";
import { BOX_CHROME, flowBody, frameBox } from "../layout/box.js";
import { columnWidths, hollowFields, type PadCtx } from "../layout/columns.js";
import { HANG_MARK, RULE_MARK } from "../layout/marks.js";
import { printedWidth } from "../layout/measure.js";
import { lookup, nameField, peek, stringify, type Tables, type Scope } from "../scope.js";
import { fillTone, toneClass } from "../style.js";
import { loadTemplate } from "./load.js";
import type { Template } from "./parse.js";
import { subst } from "./substitute.js";
import type { ObjectLists } from "./view-data.js";

// eslint-disable-next-line security/detect-non-literal-regexp
const re = (source: string): RegExp => new RegExp(source);

// A directive alone on its line, and one taking a name then the rest of the line.
const ALONE = String.raw`\s*$`;
const REST = String.raw`\s+(.*)$`;
const NAME_THEN_REST = String.raw`[ \t]+(\S+)(.*)$`;

const BOX_RE = re(`^${BOX}${ALONE}`);
// Read in TWO steps, the name then its token: one regex carrying an optional quantified group plus a trailing \s*$
// nests its quantifiers and backtracks on a near-miss. Requiring the space keeps "@boxbare" out of it.
const BOX_TOKEN_RE = re(`^${BOX}${NAME_THEN_REST}`);
const ENDBOX_RE = re(`^${ENDBOX}${ALONE}`);
const HEAD_RE = re(`^${HEAD}${REST}`);
const RIGHT_RE = re(`^${RIGHT}${REST}`);
// @foot names the field, it does not carry text: a template cannot render a cause the block never stated.
const FOOT_RE = re(String.raw`^${FOOT}[ \t]+(\S+)[ \t]*$`);
const FRAME_RE = re(String.raw`^${FRAME}[ \t]+(\S+)[ \t]+(.*)$`);
const ASIDE_RE = re(`^${ASIDE}${NAME_THEN_REST}`);
const ENDASIDE_RE = re(`^${ENDASIDE}${ALONE}`);
const USE_RE = re(`^${USE}${NAME_THEN_REST}`);
const FROM_RE = re(String.raw`^[ \t]+${FROM}[ \t]+(\S+)[ \t]*$`);
const EACH_RE = re(`^${EACH}${NAME_THEN_REST}`);
// NB: this cannot match "@endbox" or "@endaside", so the terminators never collide.
const END_RE = re(`^${END}${ALONE}`);

// Shared by the matcher and the slice that follows it.
const RULE_PREFIX = `${RULE} `;

// Matched by string rather than by regex: an optional trailing group around [\s\S]* is flagged as backtracking-prone.
const isRuleLine = (line: string): boolean => line === RULE || line.startsWith(RULE_PREFIX);

// A field written INTO a rule names its column, never its value: that is what draws a rule ACROSS the columns.
const ruleLine = (line: string, scope: Scope, tables: Tables, pad?: PadCtx): string =>
  RULE_MARK +
  subst(line.slice(RULE_PREFIX.length), scope, tables, pad && { ...pad, fill: true });

// The matcher that READS a declaration and the strip that decides whether anything is LEFT OVER are the same fact,
// which keeps a malformed cap="soon" a near-miss rather than a cap.
const declRe = (name: string): RegExp => re(declSource(name));
const LABEL_RE = declRe(LABEL);
const BULLET_RE = declRe(BULLET);
const CAP_RE = declRe(CAP);
const DECL_RES = Object.keys(DECLS).map(declRe);

/** Whatever the fraction of a cap="1/3" yields, a clamp never erases a column. */
const MIN_CELL = 1;

// A lone value is the list of one it obviously is: these fields are written by hand and a single item carries no dash,
// so accepting only an array made that content vanish with no error. Blank is not an item, which keeps a
// whitespace-only field indistinguishable from one that was never written.
function asList(val: unknown): unknown[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  return stringify(val).trim() === "" ? [] : [val];
}

/**
 * An array is refused deliberately: a block writing `head:` and then a list of items has written something this
 * template cannot draw as one line, and spreading it would put `0`, `1`, `2` into the scope as field names.
 */
const isRow = (val: unknown): val is Scope =>
  val != null && typeof val === "object" && !Array.isArray(val);

// Blank ITEMS are dropped here and not in asList, because the zone is prose and wants none of them, while a loop
// leaves its rows alone.
function zoneLines(scope: Scope, field: string | null): string[] {
  if (field == null) return [];
  return asList(lookup(scope, field))
    .map((x) => stringify(x))
    .filter((l) => l.trim() !== "");
}

// The tone of the outline, fed by @frame <field> <key>=<tone> ... An unlisted state leaves the tone undefined and the
// box keeps its default grey.
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

// Taken as TEXT: no directive is honoured and no substitution runs over them, which keeps a region from opening a
// nested box or a loop it cannot close. A name that resolves nowhere yields no row, read as "no column".
function asideRows(name: string, dirs: string | string[]): string[] {
  let rows: string[];
  try {
    rows = loadTemplate(name, dirs).body;
  } catch {
    return [];
  }
  // A blank line around the art would shift the column against its flow. Every row BETWEEN is kept, blank ones included.
  let first = 0;
  let last = rows.length;
  while (first < last && printedWidth(rows[first]) === 0) first++;
  while (last > first && printedWidth(rows[last - 1]) === 0) last--;
  return rows.slice(first, last);
}

// A view drawn INSIDE another: RENDERED, unlike an aside's rows, and with ITS OWN declarations, or a view would change
// look depending on who drew it. Null for every way an include cannot happen, and the caller then prints the LINE.
function useRows(
  name: string,
  field: string | null,
  scope: Scope,
  limit: number,
  viewsPath: string | string[],
  drawing: readonly string[]
): string[] | null {
  if (drawing.includes(name)) return null;
  let tpl: Template;
  try {
    tpl = loadTemplate(name, viewsPath);
  } catch {
    return null;
  }
  const data = field == null ? scope : peek(scope, field);
  if (data == null || typeof data !== "object" || Array.isArray(data)) return null;
  // Claimed only once the view is going to DRAW: counting the read before that disarms the guard refusing a hollow
  // render.
  if (field != null) lookup(scope, field);
  const sub: Scope = { ...(data as Scope), __labelWidth: tpl.labelWidth };
  const rows = renderBody(tpl.body, sub, tpl.tables, tpl.objectLists, limit, viewsPath, [
    ...drawing,
    name,
  ]);
  // Filled HERE, never left to render.ts's single pass, which carries the CALLER's class and would paint an included
  // banner's band in it.
  const cls = toneClass(nameField(sub, FIELD_TONE), nameField(sub, FIELD_TYPE), tpl.tone);
  return rows.map((row) => fillTone(row, cls));
}

// `limit` is the box width ceiling and `viewsPath` the ordered template dirs, both resolved once by the render entry
// and carried down: the directives ask the platform nothing. `drawing` is the chain of view names being drawn, which is
// what stops an include cycle.
export function renderBody(
  body: string[],
  scope: Scope,
  tables: Tables,
  objectLists: ObjectLists,
  limit: number,
  viewsPath: string | string[],
  drawing: readonly string[] = []
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
        // Asked of the TABLE, never decided here: a word taken out of this container's entry stops being read and
        // falls through to the body.
        const where = bare ? IN_BOX_BARE : IN_BOX;
        const hm = readsHere(where, HEAD) ? body[i].match(HEAD_RE) : null;
        const rm = readsHere(where, RIGHT) ? body[i].match(RIGHT_RE) : null;
        const fm = readsHere(where, FOOT) ? body[i].match(FOOT_RE) : null;
        const cm = readsHere(where, FRAME) ? body[i].match(FRAME_RE) : null;
        if (hm) head = subst(hm[1], scope, tables);
        else if (rm) right = subst(rm[1], scope, tables);
        else if (fm) footField = fm[1];
        else if (cm) tone = frameTone(scope, cm[1], cm[2]);
        else inner.push(body[i]);
      }
      const drawn = renderBody(inner, scope, tables, objectLists, limit, viewsPath, drawing);
      out.push(
        ...(bare
          ? flowBody(drawn, limit)
          : frameBox(head, right, drawn, zoneLines(scope, footField), tone, limit))
      );
      continue;
    }
    // Two steps for the same backtracking reason as @box. A token that is not an alignment word means this is NOT a
    // region, so the line prints as text rather than swallowing the lines below it.
    const aside = body[i].match(ASIDE_RE);
    const token = aside ? aside[2].trim() : "";
    const align: AsideAlign | null =
      token === "" ? ALIGN_CENTER : isAlign(token) ? token : null;
    if (aside && align != null) {
      const inner: string[] = [];
      i++;
      for (; i < body.length && !ENDASIDE_RE.test(body[i]); i++) inner.push(body[i]);
      const art = asideRows(aside[1], viewsPath);
      const content = limit - BOX_CHROME;
      // Drawn at the width it will be COMPOSED at: cut to size afterwards, an included view's border breaks mid-row.
      const main = asideMainWidth(art, content);
      out.push(
        ...composeAside(
          art,
          renderBody(inner, scope, tables, objectLists, main, viewsPath, drawing),
          align,
          content
        )
      );
      continue;
    }
    // A tail that is neither empty nor a well-formed `from <field>` is not an include, so the line prints.
    const use = readsHere(TOP, USE) ? body[i].match(USE_RE) : null;
    const from = use ? use[2].match(FROM_RE) : null;
    if (use && (from != null || use[2].trim() === "")) {
      const rows = useRows(use[1], from ? from[1] : null, scope, limit, viewsPath, drawing);
      if (rows != null) {
        out.push(...rows);
        continue;
      }
    }
    if (isRuleLine(body[i])) {
      out.push(ruleLine(body[i], scope, tables));
      continue;
    }
    // A bullet is DECLARED and not inferred from the body line because the wrapper has to know where the marker ENDS,
    // or a wrapped item repeats its bullet on every row. Two steps, field then declarations, against backtracking.
    const head = body[i].match(EACH_RE);
    const attrs = head ? head[2] : "";
    const labelDecl = attrs.match(LABEL_RE);
    const bulletDecl = attrs.match(BULLET_RE);
    const capDecl = attrs.match(CAP_RE);
    const leftover = DECL_RES.reduce((rest, re) => rest.replace(re, ""), attrs).trim();
    const eachField = head && leftover === "" ? head[1] : null;
    if (eachField != null) {
      const inner: string[] = [];
      // Pulled out here so the loop below never sees them: a header repeated on every row is the defect this split
      // exists to make impossible.
      const heads: string[] = [];
      i++;
      while (i < body.length && !END_RE.test(body[i])) {
        const hm = readsHere(IN_EACH, HEAD) ? body[i].match(HEAD_RE) : null;
        if (hm) heads.push(hm[1]);
        else inner.push(body[i]);
        i++;
      }
      const items = asList(lookup(scope, eachField));
      // The HEAD row joins the measurement, never the iteration: a header word longer than every value under it still
      // has to fit its column, or it is the one cell that overflows. Only where this loop DRAWS it, on the same
      // condition as below: a template spending the header elsewhere (box.view makes it the frame's title) would
      // otherwise pad every label to a width nothing in the list occupies.
      const fields = objectLists[eachField];
      const headRow = peek(scope, FIELD_HEAD);
      const measured = heads.length > 0 && isRow(headRow) ? [...items, headRow] : items;
      const pad: PadCtx = {
        widths: columnWidths(measured, fields, [...heads, ...inner], tables),
        hollow: hollowFields(measured, fields),
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
      // Only when the payload carried a row for it: a template declaring @head against a table that headed nothing
      // draws NOTHING here, which is what makes one file answer both.
      if (heads.length > 0 && isRow(lookup(scope, FIELD_HEAD))) {
        const headScope: Scope = { ...scope, ...(peek(scope, FIELD_HEAD) as Scope) };
        for (const l of heads) {
          out.push(
            readsHere(IN_EACH, RULE) && isRuleLine(l)
              ? ruleLine(l, headScope, tables, pad)
              : subst(l, headScope, tables, pad)
          );
        }
      }
      const label = labelDecl?.[1];
      const bullet = bulletDecl?.[1];
      const labelCol = scope.__labelWidth ?? 0;
      // An item with nothing in its FIRST column opens no entry, it continues the one above, so nothing the template
      // wrote to SEPARATE two entries may part them: neither a rule, nor a blank line.
      // Read off the NEXT item: a template writes its separator after the row it closes.
      const continues = (next: unknown): boolean =>
        fields != null &&
        fields.length > 0 &&
        next != null &&
        typeof next === "object" &&
        stringify((next as Record<string, unknown>)[fields[0]] ?? "").trim() === "";
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
        // Substituted on the item scope, so a bullet may carry ${#} or a field of the item.
        if (bullet != null) {
          itemScope.__bullet = subst(bullet, itemScope, tables) + HANG_MARK;
        }
        const joined = continues(items[idx + 1]);
        for (const l of inner) {
          const rule = readsHere(IN_EACH, RULE) && isRuleLine(l);
          if (joined && (rule || l.trim() === "")) continue;
          out.push(rule ? ruleLine(l, itemScope, tables, pad) : subst(l, itemScope, tables, pad));
        }
      });
    } else {
      out.push(subst(body[i], scope, tables));
    }
  }
  return out;
}
