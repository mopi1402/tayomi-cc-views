// ${field} and ${field:mapname}: one expression, resolved against the scope.

import type { PadCtx } from "../layout/columns.js";
import { fitCell, longestKey, padCell } from "../layout/measure.js";
import { SUBST_RE, lookup, stringify, type Maps, type Scope } from "../scope.js";

export function subst(text: string, scope: Scope, maps: Maps, pad?: PadCtx): string {
  return text.replace(SUBST_RE, (_m: string, expr: string) => {
    const [rawField, rawMap] = expr.split(":");
    const field = rawField.trim();
    const val = lookup(scope, field);
    // The prose tail is emitted verbatim: never padded, in a list or out of one.
    const aligned = pad != null && field !== pad.tail;
    const cell = aligned ? pad!.widths[field] : undefined;
    if (val == null) return cell == null ? "" : " ".repeat(cell);
    const text0 = stringify(val);
    const map = rawMap ? maps[rawMap.trim()] : undefined;
    if (map) {
      // The enum resolves on the TRIMMED value, so column padding upstream can
      // never lose a chip.
      const key = text0.trim();
      const tag = map[key];
      if (tag) {
        const label = aligned
          ? Math.max(longestKey(map), cell == null ? 0 : cell - 2)
          : 0;
        return `{{${tag}}} ${padCell(key.toUpperCase(), label)} {{/}}`;
      }
      // Off the map: bare text, no chip, but padded to the same cell so the
      // following columns keep their offset.
      if (cell != null) return padCell(fitCell(key, cell), cell);
    }
    // fitCell only ever bites under a capped column (see measure.ts): everywhere
    // else the cell was measured over the values, so nothing exceeds it.
    return cell == null ? text0 : padCell(fitCell(text0, cell), cell);
  });
}
