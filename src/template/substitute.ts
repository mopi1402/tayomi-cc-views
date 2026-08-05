// ${field} and ${field:tablename}: one expression, resolved against the scope.

import type { PadCtx } from "../layout/columns.js";
import { fitCell, longestKey, padCell } from "../layout/measure.js";
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
  const val = lookup(scope, field);
  // The prose tail is emitted verbatim: never padded, in a list or out of one.
  const aligned = pad != null && field !== pad.tail;
  const cell = aligned ? pad!.widths[field] : undefined;
  const table = rawTable ? tables[rawTable.trim()] : undefined;
  // A TEXT table answers for the value that never arrived, so its lookup runs BEFORE the absent-value exit below. @map
  // keeps that exit: an absent value there has no word to fall back on.
  if (table?.kind === TEXT_TABLE) {
    const word = tableWord(table, val == null ? "" : stringify(val).trim());
    return cell == null ? word : padCell(fitCell(word, cell), cell);
  }
  if (val == null) return cell == null ? "" : " ".repeat(cell);
  const text0 = stringify(val);
  if (table !== undefined) {
    // The enum resolves on the TRIMMED value, so column padding upstream can never lose a chip.
    const key = text0.trim();
    const tag = table.entries[key];
    if (tag) {
      const label = aligned
        ? Math.max(longestKey(table.entries), cell == null ? 0 : cell - CHIP_CHROME)
        : 0;
      return chip(tag, padCell(key.toUpperCase(), label));
    }
    // Off the map: bare text, no chip, but padded to the same cell so the following columns keep their offset.
    if (cell != null) return padCell(fitCell(key, cell), cell);
  }
  // fitCell only ever bites under a capped column (see measure.ts): everywhere else the cell was measured over the
  // values, so nothing exceeds it.
  return cell == null ? text0 : padCell(fitCell(text0, cell), cell);
}

/** The name an expression spends, `${label}` and `${label:tone}` alike. */
const fieldOf = (expr: string): string => expr.split(":")[0].trim();

// Its own instance: TAG_RE is global and shared, and a scan borrowing it borrows its lastIndex. Composed from a module
// constant, no input reaches the constructor.
// eslint-disable-next-line security/detect-non-literal-regexp
const LEAD_TAG_RE = new RegExp(TAG_SOURCE, "g");

/**
 * What SURVIVES a dropped lead: the tag closers the lead does not open itself. A separator writes a closed span
 * (`{{dim}}  │  {{/}}`) and goes down whole with its column, but a closer standing at the head of the lead belongs to
 * the column BEFORE it, and dropping that one would leak the tone across the rest of the line.
 */
function unmatchedCloses(lead: string): string {
  let depth = 0;
  let kept = "";
  for (const m of lead.matchAll(LEAD_TAG_RE)) {
    if (m[0] !== RESET_MARK) depth++;
    else if (depth > 0) depth--;
    else kept += RESET_MARK;
  }
  return kept;
}

/**
 * A line with its expressions resolved, and its HOLLOW ones removed along with the text leading up to them. That lead
 * is everything since the previous expression, which is where a template writes a column's separator, so a column the
 * data never had takes its own furniture down with it.
 *
 * The lead therefore has to be BALANCED markup: a template that splits a tag across two columns loses the closer with
 * the column.
 */
export function subst(text: string, scope: Scope, tables: Tables, pad?: PadCtx): string {
  let out = "";
  let from = 0;
  for (const m of text.matchAll(SUBST_RE)) {
    const at = m.index;
    if (pad?.hollow?.has(fieldOf(m[1]))) {
      out += unmatchedCloses(text.slice(from, at));
      from = at + m[0].length;
      continue;
    }
    out += text.slice(from, at) + value(m[1], scope, tables, pad);
    from = at + m[0].length;
  }
  return out + text.slice(from);
}
