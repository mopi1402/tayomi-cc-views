// ${field} and ${field:tablename}: one expression, resolved against the scope.

import type { PadCtx } from "../layout/columns.js";
import { fitCell, longestKey, padCell } from "../layout/measure.js";
import { CHIP_CHROME, chip } from "../style.js";
import {
  SUBST_RE,
  TEXT_TABLE,
  lookup,
  stringify,
  tableWord,
  type Scope,
  type Tables,
} from "../scope.js";

export function subst(text: string, scope: Scope, tables: Tables, pad?: PadCtx): string {
  return text.replace(SUBST_RE, (_m: string, expr: string) => {
    const [rawField, rawTable] = expr.split(":");
    const field = rawField.trim();
    const val = lookup(scope, field);
    // The prose tail is emitted verbatim: never padded, in a list or out of one.
    const aligned = pad != null && field !== pad.tail;
    const cell = aligned ? pad!.widths[field] : undefined;
    const table = rawTable ? tables[rawTable.trim()] : undefined;
    // A TEXT table answers for the value that never arrived, which is what its reserved
    // entry exists for, so its lookup runs BEFORE the absent-value exit below rather
    // than after it. @map keeps that exit untouched, and with it every byte it draws
    // today: an absent value there has no word to fall back on and never had one.
    if (table?.kind === TEXT_TABLE) {
      const word = tableWord(table, val == null ? "" : stringify(val).trim());
      return cell == null ? word : padCell(fitCell(word, cell), cell);
    }
    if (val == null) return cell == null ? "" : " ".repeat(cell);
    const text0 = stringify(val);
    if (table !== undefined) {
      // The enum resolves on the TRIMMED value, so column padding upstream can never
      // lose a chip.
      const key = text0.trim();
      const tag = table.entries[key];
      if (tag) {
        const label = aligned
          ? Math.max(longestKey(table.entries), cell == null ? 0 : cell - CHIP_CHROME)
          : 0;
        return chip(tag, padCell(key.toUpperCase(), label));
      }
      // Off the map: bare text, no chip, but padded to the same cell so the following
      // columns keep their offset.
      if (cell != null) return padCell(fitCell(key, cell), cell);
    }
    // fitCell only ever bites under a capped column (see measure.ts): everywhere else
    // the cell was measured over the values, so nothing exceeds it.
    return cell == null ? text0 : padCell(fitCell(text0, cell), cell);
  });
}
