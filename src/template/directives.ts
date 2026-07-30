// The .view language, interpretation half: the directives, applied to a scope.
//
// Directives: @map <field> <val>=<tag> ...   (enum -> style, resolved at parse time)
//             @each <field> ... @end          (repeat per list item)
//             @box ... @endbox (+ @head, @right, @foot, @frame)
//             @rule [prefix]                  (inner division, filled by the box)
// Substitutions: ${field}  ${field:mapname}  ${.}  ${#}  ${#label}  ${#bullet}

import { frameBox } from "../layout/box.js";
import { columnWidths, type PadCtx } from "../layout/columns.js";
import { HANG_MARK, RULE_MARK } from "../layout/marks.js";
import { printedWidth } from "../layout/measure.js";
import { lookup, stringify, type Maps, type Scope } from "../scope.js";
import { subst } from "./substitute.js";
import type { ObjectLists } from "./view-data.js";

// @rule matches by string, not by regex (the parse site says why), so unlike the
// other directives its spelling is a value, shared by the matcher and the slice.
const RULE_WORD = "@rule";
const RULE_PREFIX = `${RULE_WORD} `;

// One field value, read as the list a directive iterates. A lone value is the list
// of one it obviously is: both readers below take fields a HUMAN wrote by hand, and
// a single item there carries no dash. Accepting only an array made that content
// vanish with no error anywhere, so the coercion is shared rather than left to each
// directive to decide (they disagreed, and the disagreement was invisible).
// Blank is not an item: a field holding only whitespace reads as empty, which keeps
// it indistinguishable from a field that was never written.
function asList(val: unknown): unknown[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  return stringify(val).trim() === "" ? [] : [val];
}

// The bottom zone of a box, fed by @foot <field>. Its content is a field like any
// other, so a block that never sets that field renders exactly as it did before the
// zone existed: no divider, no blank row, nothing. Blank ITEMS of a list are dropped
// here and not in asList, because a list is what an author wrote item by item: the
// zone is prose and wants none of them, while a loop leaves its rows alone.
function zoneLines(scope: Scope, field: string | null): string[] {
  if (field == null) return [];
  return asList(lookup(scope, field))
    .map((x) => stringify(x))
    .filter((l) => l.trim() !== "");
}

// The tone of the outline, fed by @frame <field> <key>=<tone> ... The state that
// picks the badge picks the border too: one field decides both, so they cannot
// drift apart. An unlisted (or absent) state leaves the tone undefined, and the
// box keeps its default grey.
function frameTone(scope: Scope, field: string, pairs: string): string | undefined {
  const val = lookup(scope, field);
  if (val == null) return undefined;
  const key = stringify(val).trim();
  if (key === "") return undefined;
  for (const pair of pairs.trim().split(/\s+/)) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    if (pair.slice(0, eq) === key) return pair.slice(eq + 1) || undefined;
  }
  return undefined;
}

// `limit` is the box width ceiling, resolved once by the render entry (render.ts)
// and carried down to every @box: the directives never ask the platform anything.
export function renderBody(
  body: string[],
  scope: Scope,
  maps: Maps,
  objectLists: ObjectLists,
  limit: number
): string[] {
  const out: string[] = [];
  for (let i = 0; i < body.length; i++) {
    // @box ... @endbox, with the top rule fed by @head (left) and @right.
    // Deliberately NOT nestable: nothing needs it, and a depth counter would be
    // untested surface. An unclosed @box frames the rest of the template, which
    // is visibly wrong rather than silently dropped.
    if (/^@box\s*$/.test(body[i])) {
      let head = "";
      let right = "";
      let footField: string | null = null;
      let tone: string | undefined;
      const inner: string[] = [];
      i++;
      for (; i < body.length && !/^@endbox\s*$/.test(body[i]); i++) {
        const hm = body[i].match(/^@head\s+(.*)$/);
        const rm = body[i].match(/^@right\s+(.*)$/);
        // @foot names the field, it does not carry text: the zone is wired to the
        // data, so a template cannot render a cause the block never stated.
        const fm = body[i].match(/^@foot[ \t]+(\S+)[ \t]*$/);
        const cm = body[i].match(/^@frame[ \t]+(\S+)[ \t]+(.*)$/);
        if (hm) head = subst(hm[1], scope, maps);
        else if (rm) right = subst(rm[1], scope, maps);
        else if (fm) footField = fm[1];
        else if (cm) tone = frameTone(scope, cm[1], cm[2]);
        else inner.push(body[i]);
      }
      out.push(
        ...frameBox(
          head,
          right,
          renderBody(inner, scope, maps, objectLists, limit),
          zoneLines(scope, footField),
          tone,
          limit
        )
      );
      continue;
    }
    // @rule [prefix]: an inner division of a section, filled by frameBox. Parsed
    // by string rather than by regex: an optional trailing group around [\s\S]*
    // is flagged as backtracking-prone, and the shape is too simple to need one.
    if (body[i] === RULE_WORD || body[i].startsWith(RULE_PREFIX)) {
      out.push(RULE_MARK + subst(body[i].slice(RULE_PREFIX.length), scope, maps));
      continue;
    }
    // NB: /^@end\s*$/ cannot match "@endbox", so the two terminators never collide.
    // An @each may DECLARE its label: ${#label} is then the text on the first item
    // and spaces of the same width on every later one, so a section names itself
    // ONCE instead of repeating its label down the block. Declared rather than
    // inferred (say, by blanking whatever precedes the gutter bar) because the
    // engine is shared: a view putting a per-row value there would see it silently
    // vanish. The label carries its own padding, since aligning two sections is
    // the template's business, not the engine's.
    // An @each may also DECLARE an item marker, bullet="- ", substituted per item
    // (so bullet="R${#} " numbers its rows) and exposed as ${#bullet}. Declared
    // like the label rather than written into the body line, for one reason the
    // body line cannot serve: the wrapper has to know where the marker ENDS, or a
    // wrapped item repeats its bullet on every row.
    // Parsed in two steps, the field then its declarations, because one regex
    // carrying two optional quoted groups plus a trailing \s*$ backtracks on a
    // near-miss. The strictness is kept where it matters: anything left over
    // after the declarations means this is NOT a loop, and the line prints as
    // text rather than silently registering a loop the template never declared.
    const head = body[i].match(/^@each[ \t]+(\S+)(.*)$/);
    const attrs = head ? head[2] : "";
    const labelDecl = attrs.match(/[ \t]label="([^"]*)"/);
    const bulletDecl = attrs.match(/[ \t]bullet="([^"]*)"/);
    // An @each may CAP its leading columns at a fraction of the available width,
    // cap="1/3": the width of a cell is normally measured over the values, so a
    // long label would push every content column to the margin. The cap clamps
    // the measured widths; an overflowing value is then cut on an ellipsis at
    // substitution (fitCell). The fraction lives in the template because the
    // container is the template's business, never the carrier's or the message's.
    const capDecl = attrs.match(/[ \t]cap="(\d+)\/([1-9]\d*)"/);
    const leftover = attrs
      .replace(/[ \t]label="[^"]*"/, "")
      .replace(/[ \t]bullet="[^"]*"/, "")
      .replace(/[ \t]cap="\d+\/[1-9]\d*"/, "")
      .trim();
    const eachField = head && leftover === "" ? head[1] : null;
    if (eachField != null) {
      const inner: string[] = [];
      i++;
      while (i < body.length && !/^@end\s*$/.test(body[i])) {
        inner.push(body[i]);
        i++;
      }
      const items = asList(lookup(scope, eachField));
      // Column widths are measured over the items of THIS list and applied on
      // the per-item scope built below, so nothing outside a list is padded.
      const fields = objectLists[eachField];
      const pad: PadCtx = {
        widths: columnWidths(items, fields, inner, maps),
        tail: fields && fields.length > 0 ? fields[fields.length - 1] : undefined,
      };
      if (capDecl) {
        // Whatever the fraction yields, a clamp never erases a column entirely.
        const MIN_CELL = 1;
        const cap = Math.max(MIN_CELL, Math.floor((limit * Number(capDecl[1])) / Number(capDecl[2])));
        for (const f of Object.keys(pad.widths)) {
          pad.widths[f] = Math.min(pad.widths[f], cap);
        }
      }
      const label = labelDecl?.[1];
      const bullet = bulletDecl?.[1];
      const labelCol = Number(scope.__labelWidth ?? 0);
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
        // Substituted on the item scope, so a bullet may carry ${#} or a field of
        // the item; the boundary is appended here, once, rather than being spelled
        // out in every template that wants a marker.
        if (bullet != null) {
          itemScope.__bullet = subst(bullet, itemScope, maps) + HANG_MARK;
        }
        for (const l of inner) out.push(subst(l, itemScope, maps, pad));
      });
    } else {
      out.push(subst(body[i], scope, maps));
    }
  }
  return out;
}
