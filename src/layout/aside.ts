// A second column beside the main flow: the composition half of an @aside region.
//
// The engine emits one line at a time and knows no block, so two columns can only
// exist if a SINGLE line already carries both. This module builds that line: the
// aside's row on the left at one constant width, the gutter and its separator, the
// main flow's row on the right, pre-wrapped to whatever the gutter leaves.
//
// Pre-wrapping is the whole trick, and it is not a convenience. An aside row is raw
// ANSI art whose transparent pixels are SPACES, which is exactly what wrapLine breaks
// on, and the language carries no bypass mark (marks.ts has exactly two channels,
// RULE and HANG). The row therefore survives untouched for one reason only: every
// composed line is built so its printed width already fits the box, so the wrapper
// hands it back whole instead of finding a break point inside the picture.
//
// Like every other leaf of this layer it takes its width as a VALUE: where the
// number came from is the render entry's business, never this module's.

import { padCell, printedWidth } from "./measure.js";
import { wrapLine } from "./wrap.js";

/** Where the SHORTER column sits against the taller one, declared on the region. */
export type AsideAlign = "center" | "top" | "bottom";

// Two spaces, the separator, two spaces. The region always spends the same five
// printed columns, which is what puts the separator on one printed column for the
// whole region: the left cell is padded to a fixed width and the gutter is a constant.
const SEPARATOR = "{{dim}}│{{/}}";
const GUTTER_PAD = "  ";

/**
 * The printed columns the gutter costs, separator included. DERIVED from the two
 * pieces above rather than written as a 5: the number a composed line is measured
 * against and the string it is built from must be the same fact.
 */
export const ASIDE_GUTTER = 2 * GUTTER_PAD.length + printedWidth(SEPARATOR);

/**
 * The floor, in printed columns of BOX CONTENT, under which the aside and its
 * separator are dropped and the flow takes the whole width. A picture is decoration;
 * prose squeezed into a ribbon beside it is not readable, so the decoration goes.
 */
export const ASIDE_MIN_MAIN = 40;

// The rows a column is short of the region's height, distributed. Centred by
// default, and an ODD padding row goes BELOW: a block sitting one row high reads as
// centred, the same block sitting one row low reads as fallen.
function padColumn(col: string[], height: number, align: AsideAlign, filler: string): string[] {
  const missing = height - col.length;
  if (missing <= 0) return col;
  const above = align === "top" ? 0 : align === "bottom" ? missing : Math.floor(missing / 2);
  return [
    ...new Array<string>(above).fill(filler),
    ...col,
    ...new Array<string>(missing - above).fill(filler),
  ];
}

/**
 * The region, line by line. `content` is the width the frame wraps a body line to
 * (the box's limit less its chrome), NOT the terminal's width.
 *
 * Degrades to the main flow at full width, and never half way: no aside row, an
 * aside wider than the space, or a main column that would fall under the floor all
 * take the same exit. That is what lets an unresolvable name reach here as an empty
 * column instead of taking the surrounding box down.
 */
export function composeAside(
  asideRows: string[],
  mainLines: string[],
  align: AsideAlign,
  content: number
): string[] {
  const asideWidth = asideRows.reduce((n, l) => Math.max(n, printedWidth(l)), 0);
  const mainWidth = content - asideWidth - ASIDE_GUTTER;
  if (asideRows.length === 0 || mainWidth < ASIDE_MIN_MAIN) {
    return mainLines.flatMap((l) => wrapLine(l, content));
  }
  // Wrapped BEFORE the columns are zipped: a main line that takes three rows takes
  // three rows of the region, each beside its own aside row.
  const flow = mainLines.flatMap((l) => wrapLine(l, mainWidth));
  // Padded to the measured width rather than emitted as-is, so a row of art that
  // ends early (a transparent right edge the encoder trimmed) still puts the
  // separator on the same column as every other row.
  const art = asideRows.map((r) => padCell(r, asideWidth));
  const height = Math.max(art.length, flow.length);
  const left = padColumn(art, height, align, " ".repeat(asideWidth));
  const right = padColumn(flow, height, align, "");
  // A blank main line survives here, and must: the composed line carries the art
  // and the separator, so it is no longer empty and the box's blank collapsing has
  // nothing to take. Those are the region's breathing lines.
  return left.map((row, i) => `${row}${GUTTER_PAD}${SEPARATOR}${GUTTER_PAD}${right[i]}`);
}
