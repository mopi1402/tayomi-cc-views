// A second column beside the main flow. The engine knows no block, so two columns can only exist if a SINGLE line
// carries both: the aside's row on the left, the gutter and its separator, the main flow's row pre-wrapped to whatever
// is left.
//
// Pre-wrapping is the trap, not a convenience. An aside row is raw ANSI art whose transparent pixels are SPACES,
// exactly what wrapLine breaks on, and the language carries no bypass mark. The row survives only because every
// composed line is built to fit the box already, so the wrapper hands it back whole.

import { RESET_MARK, tagMark } from "../style.js";
import { padCell, printedWidth } from "./measure.js";
import { wrapLine } from "./wrap.js";

/** Where the SHORTER column sits against the taller one, declared on the region. */
export type AsideAlign = "center" | "top" | "bottom";

const SEPARATOR = `${tagMark("dim")}│${RESET_MARK}`;
const GUTTER_PAD = "  ";

/** DERIVED: the number a composed line is measured against and the string it is built from are one fact. */
export const ASIDE_GUTTER = 2 * GUTTER_PAD.length + printedWidth(SEPARATOR);

/** The floor, in printed columns of BOX CONTENT, under which the aside is dropped and the flow takes the whole width. */
export const ASIDE_MIN_MAIN = 40;

// An ODD padding row goes BELOW: a block one row high reads as centred, the same block one row low reads as fallen.
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
 * The region, line by line. `content` is the width the frame wraps a body line to (the box's limit less its chrome),
 * NOT the terminal's width.
 *
 * Degrades to the main flow at full width and never half way: no aside row, an aside wider than the space, or a main
 * column under the floor all take the same exit. That is what lets an unresolvable name reach here as an empty column
 * instead of taking the box down.
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
  // Wrapped BEFORE the columns are zipped: a main line taking three rows takes three rows of the region.
  const flow = mainLines.flatMap((l) => wrapLine(l, mainWidth));
  // Padded, so a row of art that ends early (a transparent right edge the encoder trimmed) still puts the separator on
  // the same column as every other row.
  const art = asideRows.map((r) => padCell(r, asideWidth));
  const height = Math.max(art.length, flow.length);
  const left = padColumn(art, height, align, " ".repeat(asideWidth));
  const right = padColumn(flow, height, align, "");
  // A blank main line survives, and must: the composed line carries the art and the separator, so the box's blank
  // collapsing has nothing to take.
  return left.map((row, i) => `${row}${GUTTER_PAD}${SEPARATOR}${GUTTER_PAD}${right[i]}`);
}
