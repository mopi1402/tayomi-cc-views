// ${field} and ${field:tablename}: one expression, resolved against the scope.

import type { PadCtx } from "../layout/columns.js";
import { ruleFill } from "../layout/box.js";
import { longestKey, padCell } from "../layout/measure.js";
import { markCell, stackCell } from "../layout/wrap.js";
import { CHIP_CHROME, RESET_MARK, TAG_SOURCE, chip } from "../style.js";
import {
  SUBST_RE,
  TEXT_TABLE,
  lookup,
  stringify,
  tableWord,
  type Scope,
  type Tables,
} from "../scope.js";

/**
 * Kept apart from the scan below so the HOLLOW rule can drop a substitution without this ever running: a field no item
 * carries must not be looked up at all, since the lookup is what records a field as READ.
 */
function value(expr: string, scope: Scope, tables: Tables, pad?: PadCtx): string {
  const [rawField, rawTable] = expr.split(":");
  const field = rawField.trim();
  // The prose tail is emitted verbatim: never padded, in a list or out of one.
  const aligned = pad != null && field !== pad.tail;
  const cell = aligned ? pad!.widths[field] : undefined;
  // On a RULE line a measured field draws its column and the tail draws nothing, the framer filling from there. Ahead
  // of the lookup so no read is recorded; anything else falls through, keeping a rule free to carry a prefix.
  if (pad?.fill === true && cell != null) return markCell(ruleFill(cell));
  if (pad?.fill === true && field === pad.tail) return "";
  const val = lookup(scope, field);
  const table = rawTable ? tables[rawTable.trim()] : undefined;
  // A TEXT table answers for the value that never arrived, so its lookup runs BEFORE the absent-value exit below. @map
  // keeps that exit: an absent value there has no word to fall back on.
  if (table?.kind === TEXT_TABLE) {
    const word = tableWord(table, val == null ? "" : stringify(val).trim());
    return cell == null ? word : stackCell(word, cell);
  }
  if (val == null) return cell == null ? "" : stackCell("", cell);
  const text0 = stringify(val);
  if (table !== undefined) {
    // The enum resolves on the TRIMMED value, so column padding upstream can never lose a chip.
    const key = text0.trim();
    const tag = table.entries[key];
    if (tag) {
      const label = aligned
        ? Math.max(longestKey(table.entries), cell == null ? 0 : cell - CHIP_CHROME)
        : 0;
      const chipped = chip(tag, padCell(key.toUpperCase(), label));
      return cell == null ? chipped : markCell(chipped);
    }
    // Off the map: bare text, no chip, but padded to the same cell so the following columns keep their offset.
    if (cell != null) return stackCell(key, cell);
  }
  // stackCell only ever folds under a capped column (see wrap.ts): everywhere else the cell was measured over the
  // values, so nothing exceeds it and the value comes back padded and whole.
  return cell == null ? text0 : stackCell(text0, cell);
}

/** The name an expression spends, `${label}` and `${label:tone}` alike. */
const fieldOf = (expr: string): string => expr.split(":")[0].trim();

// Its own instance: TAG_RE is global and shared, and a scan borrowing it borrows its lastIndex. Composed from a module
// constant, no input reaches the constructor.
// eslint-disable-next-line security/detect-non-literal-regexp
const LEAD_TAG_RE = new RegExp(TAG_SOURCE, "g");

/**
 * The furniture between two columns, cut into the three things it carries: closers of the column before, the separator,
 * openers of the column after. A template writes all three as one string, so position names none of them and what the
 * run closes ITSELF does.
 *
 * A closer it does not open always survives, or the tone it ends leaks over the rest of the line.
 */
function sift(run: string, prev: boolean, next: boolean): string {
  if (prev && next) return run;
  const parts: { s: string; tag: boolean }[] = [];
  let at = 0;
  for (const m of run.matchAll(LEAD_TAG_RE)) {
    if (m.index > at) parts.push({ s: run.slice(at, m.index), tag: false });
    parts.push({ s: m[0], tag: true });
    at = m.index + m[0].length;
  }
  if (at < run.length) parts.push({ s: run.slice(at), tag: false });
  // Paired off left to right: what the stack keeps opens something this run never closes, and a closer meeting an empty
  // stack closes something it never opened. All the rest is the separator, matched spans and text alike.
  const opened: number[] = [];
  const role = parts.map(() => "body");
  parts.forEach((p, i) => {
    if (!p.tag) return;
    if (p.s !== RESET_MARK) opened.push(i);
    else if (opened.length > 0) opened.pop();
    else role[i] = "close";
  });
  for (const i of opened) role[i] = "open";
  const pick = (want: string): string =>
    parts
      .filter((_, i) => role[i] === want)
      .map((p) => p.s)
      .join("");
  return pick("close") + (prev ? pick("body") : "") + (next ? pick("open") : "");
}

/**
 * A line with its expressions resolved, and its HOLLOW ones removed along with the text that FOLLOWS them, up to the
 * next expression, which is where a template writes a column's separator.
 *
 * That side and not the other, so the separator written FIRST is the one always left standing: box.view hangs a frange
 * off it and thin bars past it, which taking the side before makes impossible. The furniture has to be BALANCED markup
 * either way: a template splitting a tag across two columns loses the closer with the column.
 */
export function subst(text: string, scope: Scope, tables: Tables, pad?: PadCtx): string {
  const found = [...text.matchAll(SUBST_RE)];
  const shown = found.map((m) => !(pad?.hollow?.has(fieldOf(m[1])) ?? false));
  // Whether anything from here on still prints: a separator with no column left after it has nothing to separate, and
  // dangles at the end of the row unless it goes down too.
  const rest = shown.map((_, i) => shown.slice(i).includes(true));
  let out = "";
  let from = 0;
  // The column a run comes AFTER. The head of the line has none, and stands.
  let prev = true;
  found.forEach((m, i) => {
    const at = m.index;
    out += sift(text.slice(from, at), prev && rest[i], shown[i]);
    if (shown[i]) out += value(m[1], scope, tables, pad);
    prev = shown[i];
    from = at + m[0].length;
  });
  // Whatever trails the last column is that column's, and goes down with it.
  return out + sift(text.slice(from), prev, true);
}
