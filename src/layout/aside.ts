// A second column beside the main flow. The engine knows no block, so two columns can only exist if a SINGLE line
// carries both: the aside's row on the left, the gutter and its separator, the main flow's row pre-wrapped to whatever
// is left.
//
// Pre-wrapping is the trap, not a convenience. An aside row is raw ANSI art whose transparent pixels are SPACES,
// exactly what wrapLine breaks on, and the language carries no bypass mark. The row survives only because every
// composed line is built to fit the box already, so the wrapper hands it back whole.

import { ALIGN_BOTTOM, ALIGN_TOP, type Align } from "../data/language.js";
import { R, RESET_MARK, renderTags, tagMark } from "../style.js";
import { padCell, printedWidth } from "./measure.js";
import { wrapLine } from "./wrap.js";

export type AsideAlign = Align;

const SEPARATOR = `${tagMark("dim")}│${RESET_MARK}`;
const GUTTER_PAD = "  ";

/** DERIVED: the number a composed line is measured against and the string it is built from are one fact. */
export const ASIDE_GUTTER = 2 * GUTTER_PAD.length + printedWidth(SEPARATOR);

/** The floor, in printed columns of BOX CONTENT, under which the aside is dropped and the flow takes the whole width. */
export const ASIDE_MIN_MAIN = 40;

/** The widest row of a column, in printed columns. */
const widest = (rows: string[]): number => rows.reduce((n, l) => Math.max(n, printedWidth(l)), 0);

// An ODD padding row goes BELOW: a block one row high reads as centred, the same block one row low reads as fallen.
function padColumn(col: string[], height: number, align: AsideAlign, filler: string): string[] {
  const missing = height - col.length;
  if (missing <= 0) return col;
  const above =
    align === ALIGN_TOP ? 0 : align === ALIGN_BOTTOM ? missing : Math.floor(missing / 2);
  return [
    ...new Array<string>(above).fill(filler),
    ...col,
    ...new Array<string>(missing - above).fill(filler),
  ];
}

/**
 * The width the MAIN column gets beside this aside, `content` itself when the aside is DROPPED. Exported because the
 * render draws the region's body before composing it, and a body drawn at the box's full width loses a nested border
 * when cut to size afterwards. One function, so the two can never disagree.
 */
export function asideMainWidth(asideRows: string[], content: number): number {
  const main = content - widest(asideRows) - ASIDE_GUTTER;
  return asideRows.length === 0 || main < ASIDE_MIN_MAIN ? content : main;
}

/**
 * The region, line by line. `content` is the width the frame wraps a body line to (the box's limit less its chrome),
 * NOT the terminal's width. An unresolvable name reaches here as an empty column and degrades instead of taking the
 * box down.
 */
export function composeAside(
  asideRows: string[],
  mainLines: string[],
  align: AsideAlign,
  content: number
): string[] {
  const mainWidth = asideMainWidth(asideRows, content);
  if (mainWidth === content) {
    return mainLines.flatMap((l) => wrapLine(l, content));
  }
  // Wrapped BEFORE the columns are zipped: a main line taking three rows takes three rows of the region.
  return zip(asideRows, mainLines.flatMap((l) => wrapLine(l, mainWidth)), align, SEPARATOR);
}

/**
 * Two columns as one run of lines. Padded, so a row of art that ends early (a transparent right edge the encoder
 * trimmed) still puts the separator on the same column as every other row. A blank main line survives, and must: the
 * composed line carries the art and the separator, so the box's blank collapsing has nothing to take.
 */
function zip(leftRows: string[], rightRows: string[], align: AsideAlign, separator: string): string[] {
  const leftWidth = widest(leftRows);
  const height = Math.max(leftRows.length, rightRows.length);
  const left = padColumn(leftRows.map((r) => padCell(r, leftWidth)), height, align, " ".repeat(leftWidth));
  const right = padColumn(rightRows, height, align, "");
  return left.map((row, i) => `${row}${GUTTER_PAD}${separator}${GUTTER_PAD}${right[i]}`);
}

/** Under this many columns a split side is no column at all, and the two zones stack instead. */
export const SPLIT_MIN_SIDE = 20;

/** One side of a split, drawn on demand: the same zone is asked again at another width or under a height ceiling. */
export type Side = (width: number, height?: number) => string[];

/**
 * Two drawn zones side by side, in `content` printed columns. A side that wants no more than its half keeps what it
 * wants and the other takes the rest; two sides wanting more share the room in halves. The taller side is then asked again under the other's
 * height, which only a diagram answers. Too narrow to hold both, the two STACK, each at the whole width.
 *
 * The output is FINISHED text: the carrier puts it on screen with no template pass after it, so the separator is
 * resolved here and every row is closed before it.
 */
/** A side drawn, or undefined where it cannot be drawn at that width: a diagram only fitting folded THROWS there. */
function attempt(side: Side, width: number, height?: number): string[] | undefined {
  try {
    return side(width, height);
  } catch {
    return undefined;
  }
}

export function composeSplit(left: Side, right: Side, content: number): string[] {
  const room = content - ASIDE_GUTTER;
  const half = Math.floor(room / 2);
  const stacked = (): string[] => [...left(content), "", ...right(content)];
  if (half < SPLIT_MIN_SIDE) return stacked();
  // What each side takes given all the room the other could ever leave it: a box wraps narrower than that, a diagram
  // or a short quote comes back narrower on its own.
  // A side that cannot be drawn at a width is read as one that wants more than any column holds.
  const wants = (side: Side): number => {
    const rows = attempt(side, room - SPLIT_MIN_SIDE);
    return rows === undefined ? Infinity : widest(rows);
  };
  const wantsLeft = wants(left);
  const wantsRight = wants(right);
  let leftWidth = half;
  if (wantsLeft + wantsRight <= room || wantsLeft <= half) leftWidth = wantsLeft;
  else if (wantsRight <= room - half) leftWidth = room - wantsRight;
  const rightWidth = room - leftWidth;
  let l = attempt(left, leftWidth);
  let r = attempt(right, rightWidth);
  if (l === undefined || r === undefined || widest(l) > leftWidth || widest(r) > rightWidth) return stacked();
  const shorter = (side: Side, width: number, rows: string[], height: number): string[] => {
    const again = attempt(side, width, height);
    return again !== undefined && again.length < rows.length && widest(again) <= width ? again : rows;
  };
  if (l.length > r.length) l = shorter(left, leftWidth, l, r.length);
  else if (r.length > l.length) r = shorter(right, rightWidth, r, l.length);
  return zip(l.map((row) => row + R), r, ALIGN_TOP, renderTags(SEPARATOR));
}

/** What a float drew: its rows, and how many of the units handed to it went into the column beside the figure. */
export interface Flow {
  rows: string[];
  taken: number;
}

/**
 * A figure, and the units written after it flowed into the column at its right while they fit under its height, each
 * WHOLE or not at all, in order: the first that does not fit ends the flow. Undefined where the figure leaves the column
 * under ASIDE_MIN_MAIN, and the figure then draws alone.
 */
export function composeFlow(figure: Side, units: Side[], content: number): Flow | undefined {
  const room = content - ASIDE_GUTTER;
  const fig = attempt(figure, room - ASIDE_MIN_MAIN);
  if (fig === undefined || widest(fig) > room - ASIDE_MIN_MAIN) return undefined;
  const width = room - widest(fig);
  const column: string[] = [];
  let taken = 0;
  for (const unit of units) {
    const rows = attempt(unit, width);
    if (rows === undefined || widest(rows) > width) break;
    const gap = column.length ? [""] : [];
    if (column.length + gap.length + rows.length > fig.length) break;
    column.push(...gap, ...rows);
    taken++;
  }
  return { rows: zip(fig.map((row) => row + R), column, ALIGN_TOP, renderTags(SEPARATOR)), taken };
}
