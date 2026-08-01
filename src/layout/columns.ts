// Column alignment, computed at RENDER time only.
//
// Inside a list the render lines up into columns. Every width below is computed
// HERE, over the items actually rendered: the parse layer keeps returning verbatim,
// unpadded values.
//
// Two rules compose on a leading declared field:
//   - a MAPPED field renders a chip, so its cell is at least the longest key of
//     its @map plus the chip's two inner spaces;
//   - an OFF-MAP value renders as bare text (no chip) and can raise the cell
//     past that bound: alignment wins, the chip label then pads to the same cell.
// The LAST declared field, the opaque prose tail, is never padded.

import { SUBST_RE, stringify, type Maps } from "../scope.js";
import { CHIP_CHROME } from "../style.js";
import { longestKey, printedWidth } from "./measure.js";

// Alignment context for the inner lines of an @each: the cell width of every
// leading declared field, plus the tail field that is exempt from all padding.
export interface PadCtx {
  widths: Record<string, number>;
  tail?: string;
}

// The @map a field is rendered through, read from the template line that
// substitutes it (`${field:mapname}`); undefined when the column is unmapped.
function fieldMap(
  inner: string[],
  field: string,
  maps: Maps
): Record<string, string> | undefined {
  for (const line of inner) {
    for (const m of line.matchAll(SUBST_RE)) {
      const expr = m[1];
      const colon = expr.indexOf(":");
      if (colon === -1) continue;
      if (expr.slice(0, colon).trim() !== field) continue;
      return maps[expr.slice(colon + 1).trim()];
    }
  }
  return undefined;
}

export function columnWidths(
  items: unknown[],
  fields: string[] | undefined,
  inner: string[],
  maps: Maps
): Record<string, number> {
  const widths: Record<string, number> = {};
  if (!fields || fields.length < 2) return widths;
  for (const field of fields.slice(0, -1)) {
    const map = fieldMap(inner, field, maps);
    let w = map ? longestKey(map) + CHIP_CHROME : 0;
    for (const item of items) {
      if (item == null || typeof item !== "object") continue;
      const raw = (item as Record<string, unknown>)[field];
      if (raw == null) continue;
      const val = stringify(raw).trim();
      if (map && map[val]) continue; // a mapped value is bounded by its map key
      w = Math.max(w, printedWidth(val));
    }
    widths[field] = w;
  }
  return widths;
}
