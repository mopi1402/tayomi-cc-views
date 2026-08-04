// Column alignment, computed at RENDER time only.
//
// Every width is computed HERE, over the items actually rendered: the parse layer keeps returning verbatim, unpadded
// values.
//
// Three rules compose on a leading declared field:
//   - an @map field renders a chip, so its cell is at least that map's longest key plus the
//     chip's two inner spaces;
//   - an OFF-MAP value renders as bare text and can raise the cell past that bound:
//     alignment wins, and the chip label then pads to the same cell;
//   - an @text field is measured on the WORD that comes out, never on the key that chose it
//     (`warning` is seven columns, `⚠ WARNING` is nine).
// The LAST declared field, the opaque prose tail, is never padded.

import {
  SUBST_RE,
  STYLE_TABLE,
  TEXT_TABLE,
  stringify,
  tableWord,
  type Table,
  type Tables,
} from "../scope.js";
import { CHIP_CHROME } from "../style.js";
import { longestKey, printedWidth } from "./measure.js";

// Alignment context for the inner lines of an @each: the cell width of every leading declared field, plus the tail
// field that is exempt from all padding.
export interface PadCtx {
  widths: Record<string, number>;
  tail?: string;
  /** The declared fields NO item of this list carries. See hollowFields. */
  hollow?: ReadonlySet<string>;
}

/**
 * The declared fields NOT ONE item carries, whose column is drawn nowhere and whose separator would therefore be
 * furniture around nothing.
 *
 * Measured over the WHOLE list and never per item, and that is the guarantee: a field one row happens to omit keeps its
 * cell on every row, so ragged data still lines up. Only a column the data never had at all disappears, which is how one
 * template draws a table of two, three or four columns without a conditional in the language.
 */
export function hollowFields(items: unknown[], fields: string[] | undefined): ReadonlySet<string> {
  const hollow = new Set<string>();
  if (!fields) return hollow;
  for (const field of fields) {
    const carried = items.some(
      (item) => item != null && typeof item === "object" && field in item
    );
    if (!carried) hollow.add(field);
  }
  return hollow;
}

// The table a field is rendered through, read from the template line that substitutes it (`${field:tablename}`);
// undefined when the column is unmapped.
function fieldTable(inner: string[], field: string, tables: Tables): Table | undefined {
  for (const line of inner) {
    for (const m of line.matchAll(SUBST_RE)) {
      const expr = m[1];
      const colon = expr.indexOf(":");
      if (colon === -1) continue;
      if (expr.slice(0, colon).trim() !== field) continue;
      return tables[expr.slice(colon + 1).trim()];
    }
  }
  return undefined;
}

export function columnWidths(
  items: unknown[],
  fields: string[] | undefined,
  inner: string[],
  tables: Tables
): Record<string, number> {
  const widths: Record<string, number> = {};
  if (!fields || fields.length < 2) return widths;
  for (const field of fields.slice(0, -1)) {
    const table = fieldTable(inner, field, tables);
    let w = table?.kind === STYLE_TABLE ? longestKey(table.entries) + CHIP_CHROME : 0;
    for (const item of items) {
      if (item == null || typeof item !== "object") continue;
      const raw = (item as Record<string, unknown>)[field];
      if (table?.kind === TEXT_TABLE) {
        // An item that never carried the field still shows the reserved entry, so it takes a cell like any other:
        // skipping it here is how a column comes out one word too narrow for the row that has no value.
        w = Math.max(w, printedWidth(tableWord(table, raw == null ? "" : stringify(raw).trim())));
        continue;
      }
      if (raw == null) continue;
      const val = stringify(raw).trim();
      if (table !== undefined && table.entries[val]) continue; // bounded by its map key
      w = Math.max(w, printedWidth(val));
    }
    widths[field] = w;
  }
  return widths;
}
