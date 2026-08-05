// Wrapping a rendered line to a column limit.
//
// It happens on ATOMS rather than characters, because a line carries markup that costs no column: a {{tag}} is opaque
// and zero-width, a backtick delimits a code span and is consumed downstream. Splitting a line as a plain string would
// count that markup as text and, worse, could cut a tag or a span in half.

import {
  CODE_TICK,
  RESET_MARK,
  RESUME_MARK,
  SPAN_MARK,
  TAG_AT,
  TAG_SOURCE,
  closeCut,
  isTag,
  popSpan,
  tagMark,
  tagSource,
  trackTag,
} from "../style.js";
import { CELL_MARK, HANG_MARK, STACK_MARK, TAIL_MARK, VOID_MARK } from "./marks.js";
import { padCell, printedWidth } from "./measure.js";
import { clusterMap, displayWidth } from "./width.js";

/** The section bar a template draws down its left margin, and the boundary a wrap infers where none is declared. */
const GUTTER_BAR = "▎";

// The glyphs a template draws FURNITURE with, as whole Unicode blocks rather than a list: a rule must survive the
// blanking below, and a keep-list naming box.view's `▎` left columns.view's `│` falling with the label beside it.
const RULE_GLYPH = String.raw`[─-▟]`;
const SPACE = " ";
const ANY = String.raw`[\s\S]*`;

// Under this many columns there is nothing worth wrapping into, and a continuation narrower than this could not hold a
// word: both leave the line long rather than shred it into single letters.
const MIN_LIMIT = 8;
const MIN_CONT = 4;

// `name` is the tag an atom opens, carried so a fold can seal what a row leaves open and reopen it on the next: a bold
// span split over two rows is otherwise bold on one and plain on the other, and its closer unwinds the ROW's style.
type Atom = { s: string; w: number; space: boolean; tick: boolean; name?: string };

function atomize(text: string): Atom[] {
  const atoms: Atom[] = [];
  // One atom per GRAPHEME CLUSTER, not per code unit: the greedy fill below would cut a surrogate pair or a joined
  // sequence in half, and a per-unit atom is w: 1 whatever it draws.
  const clusters = clusterMap(text);
  let i = 0;
  while (i < text.length) {
    TAG_AT.lastIndex = i;
    const m = TAG_AT.exec(text);
    if (m && isTag(m[1])) {
      atoms.push({ s: m[0], w: 0, space: false, tick: false, name: m[1] });
      i = TAG_AT.lastIndex;
      continue;
    }
    // A tag is pure ASCII, so the index it leaves behind is a cluster boundary; the fallback keeps the walk total if it
    // ever were not.
    const g = clusters.get(i) ?? text[i];
    atoms.push({
      s: g,
      w: g === CODE_TICK ? 0 : displayWidth(g),
      space: g === SPACE,
      tick: g === CODE_TICK,
    });
    i += g.length;
  }
  return atoms;
}

// A continuation line keeps the section's gutter bar and blanks its label: the bar is what makes the wrapped remainder
// read as the same section, and the blank label is what keeps the text in one column.
// eslint-disable-next-line security/detect-non-literal-regexp
const PREFIX_RE = new RegExp(`^(${ANY}${GUTTER_BAR}(?:${tagSource("/")})?${SPACE}?)(${ANY})$`);
// What survives the blanking. A span's BOTH ends belong there as much as a tag does: dropping the closing mark paints
// every continuation row in the chip's fill out to the border, and dropping the boundary sends that closing mark
// unwinding into the row's own tags. Zero width apiece, so the loss shows on screen and nowhere the measurer can see.
// eslint-disable-next-line security/detect-non-literal-regexp
const KEEP_RE = new RegExp(`(${TAG_SOURCE}|${SPAN_MARK}|${RESUME_MARK}|${RULE_GLYPH})`);
// eslint-disable-next-line security/detect-non-literal-regexp
const IS_KEPT = new RegExp(`^(?:${TAG_SOURCE}|${SPAN_MARK}|${RESUME_MARK}|${RULE_GLYPH})$`);

/** The plain indent a line opens on: the prefix a line with no gutter bar hangs from. */
const INDENT_RE = /^[ \t]*/;

// What a column writes BETWEEN itself and the next: markup, blanks and the rule glyph, nothing that says anything. It
// belongs to the prefix, or the separator is drawn on an entry's first row and lost on every other.
// eslint-disable-next-line security/detect-non-literal-regexp
const FURNITURE_RE = new RegExp(
  `^(?:${TAG_SOURCE}|${SPAN_MARK}|${RESUME_MARK}|${RULE_GLYPH}|${SPACE})*`
);

// A prefix cut into alternating plain text and cells, the odd entries being the cells. Split rather than matched, so
// an unpaired mark is a near-miss (one long cell) and never a throw.
const cellParts = (s: string): string[] => s.split(CELL_MARK);

/** Padded alike by the substituter, so any one of them can stand in for the cell. */
const cellRows = (cell: string): string[] => cell.split(STACK_MARK);

const bareCells = (s: string): string => s.split(CELL_MARK).join("");

/** The tallest stacked cell of a prefix, and one where nothing stacks. */
function stackHeight(prefix: string): number {
  return cellParts(prefix).reduce(
    (n, part, i) => (i % 2 === 1 ? Math.max(n, cellRows(part).length) : n),
    1
  );
}

// Row k of every stacked cell, left BRACKETED so the blanking below leaves it standing. A cell that has run out of rows
// holds its column open with spaces, or the columns after it would slide left on that row alone.
function pickRow(prefix: string, k: number): string {
  return cellParts(prefix)
    .map((part, i) => {
      if (i % 2 === 0) return part;
      const rows = cellRows(part);
      return CELL_MARK + (rows[k] ?? SPACE.repeat(printedWidth(rows[0]))) + CELL_MARK;
    })
    .join("");
}

// Tags, the marks that close them, and the bar survive; every other visible character becomes a space.
function blankRun(run: string): string {
  return run
    .split(KEEP_RE)
    .map((part) => (IS_KEPT.test(part) ? part : SPACE.repeat(displayWidth(part))))
    .join("");
}

// A stacked cell is the one thing a continuation does NOT blank: its row is the reason the row exists at all.
function blankPrefix(prefix: string): string {
  return cellParts(prefix)
    .map((part, i) => (i % 2 === 1 ? part : blankRun(part)))
    .join("");
}

// A VOIDED head is columns and nothing else: not even the style that drew it, which is what parts this from blanking. A
// band opens its fill before its label, so a kept tag there repaints the hole the fold was meant to leave.
function foldPrefix(prefix: string): string {
  const at = prefix.indexOf(VOID_MARK);
  if (at === -1) return blankPrefix(prefix);
  const head = prefix.slice(0, at);
  const rest = prefix.slice(at + VOID_MARK.length);
  // The reset is load-bearing: whatever the row above left open is still standing when this one starts printing.
  return RESET_MARK + SPACE.repeat(printedWidth(head)) + blankPrefix(rest);
}

/**
 * A run of text folded to `width`: greedy fill, breaking at the last space of the row and hard-splitting a token wider
 * than the whole column (a long path, which must break somewhere rather than push the border out). A code span cut in
 * two is closed and reopened, otherwise the orphan backtick reaches the screen and neither half renders as code.
 */
export function foldText(text: string, width: number): string[] {
  const groups: Atom[][] = [];
  let cur: Atom[] = [];
  let w = 0;
  for (const a of atomize(text)) {
    if (w + a.w > width && cur.length > 0) {
      let cut = -1;
      for (let i = cur.length - 1; i >= 0; i--) {
        if (cur[i].space) {
          cut = i;
          break;
        }
      }
      groups.push(cut >= 0 ? cur.slice(0, cut) : cur);
      cur = cut >= 0 ? cur.slice(cut + 1) : [];
      w = cur.reduce((n, x) => n + x.w, 0);
    }
    cur.push(a);
    w += a.w;
  }
  if (cur.length > 0) groups.push(cur);
  const out: string[] = [];
  // The shared notion of what is open (style.ts), never a copy: a boolean could say whether a style was open and never
  // WHICH, and it counted the tag of a COMPLETE engine span as still standing.
  const open: string[] = [];
  let tick = false;
  for (const atoms of groups) {
    // What the row before left standing, replayed IN ORDER, boundaries included: a row is self-contained, or the
    // closer further down unwinds to the wrong place.
    let s =
      open.map((e) => (e === SPAN_MARK ? SPAN_MARK : tagMark(e))).join("") + (tick ? CODE_TICK : "");
    for (const a of atoms) {
      s += a.s;
      if (a.tick) tick = !tick;
      else if (a.name !== undefined) trackTag(open, a.name);
      else if (a.s === SPAN_MARK) trackTag(open, SPAN_MARK);
      else if (a.s === RESUME_MARK) popSpan(open);
    }
    // A code span cut in two is closed and reopened, otherwise the orphan backtick reaches the screen and neither half
    // renders as code. The style around it is sealed the same way, and for the same reason.
    out.push(closeCut(s + (tick ? CODE_TICK : ""), open));
  }
  return out;
}

/**
 * A cell of MEASURED width, bracketed so the wrapper can tell it from the prose that flows after it. EVERY one of them
 * and not only the ones that fold: an unmarked column is one a continuation row cannot redraw, and it takes the
 * separator beside it down with it.
 */
export const markCell = (s: string): string => CELL_MARK + s + CELL_MARK;

/**
 * A value WIDER than its column, folded rather than cut: its rows travel ON the line and wrapLine deals them out one
 * per screen row, so a cell that does not fit costs height and never characters. Every row is padded to the column, or
 * the columns beside it lose their offset on the rows it does not draw.
 */
export function stackCell(s: string, width: number): string {
  const rows = foldText(s, width);
  return markCell((rows.length === 0 ? [s] : rows).map((r) => padCell(r, width)).join(STACK_MARK));
}

export function wrapLine(line: string, limit: number): string[] {
  // A cell that has already FOLDED must be dealt whatever the line measures: its rows count as if they stood side by
  // side, so the line "fits" exactly when it is about to print every one of them on the same screen row.
  const cells = line.includes(CELL_MARK);
  const folded = line.includes(STACK_MARK);
  if (limit < MIN_LIMIT || (!folded && printedWidth(line) <= limit)) return [line];
  // A declared TAIL only ever belonged to a line that fits: past here the fold drops it and squares every row to the
  // limit instead, which is what parts a rectangle from a staircase. Measured ABOVE with the tail still on, so a band
  // keeps its closing furniture for as long as that furniture fits.
  const tail = line.indexOf(TAIL_MARK);
  const body = tail === -1 ? line : line.slice(0, tail);
  // An explicit hanging boundary wins over the inferred one: a bullet declared on the @each sits AFTER the gutter bar,
  // so PREFIX_RE alone would leave it inside the wrapped text and print it again on every continuation row.
  const hang = body.indexOf(HANG_MARK);
  // No declared boundary, but marked cells: the fold hangs from the LAST of them, the prose after it being the only
  // thing that flows.
  const lastCell = hang === -1 && cells ? body.lastIndexOf(CELL_MARK) + CELL_MARK.length : -1;
  const cellEnd =
    lastCell === -1
      ? -1
      : lastCell + (body.slice(lastCell).match(FURNITURE_RE) as RegExpMatchArray)[0].length;
  const m = hang === -1 && cellEnd === -1 ? body.match(PREFIX_RE) : null;
  const prefix =
    hang !== -1
      ? body.slice(0, hang)
      : cellEnd !== -1
        ? body.slice(0, cellEnd)
        : m
          ? m[1]
          : (body.match(INDENT_RE) as RegExpMatchArray)[0];
  const rest =
    hang !== -1
      ? body.slice(hang + HANG_MARK.length)
      : cellEnd !== -1
        ? body.slice(cellEnd)
        : m
          ? m[2]
          : body.slice(prefix.length);
  const hangs = hang !== -1 || cellEnd !== -1 || m !== null;
  // The FIRST row draws the prefix as written, less the mark that only ever spoke to the fold.
  const head = bareCells(pickRow(prefix, 0).split(VOID_MARK).join(""));
  // Measured on the row that is DRAWN, never on the prefix: a stacked cell counts all of its rows at once.
  const width = limit - printedWidth(head);
  if (width < MIN_CONT && !folded) return [line];
  // Too narrow to fold INTO, yet a cell is waiting to be dealt: the prose stays whole rather than being shredded into
  // single letters, and the rows below still reach the screen.
  const filled = width < MIN_CONT ? [rest] : foldText(rest, width);
  const out: string[] = [];
  // The taller of the two: prose that outruns the cells, or cells that outrun the prose. Whichever ends first leaves
  // its column blank on the rows that remain.
  for (let k = 0; k < Math.max(stackHeight(prefix), filled.length); k++) {
    const picked = pickRow(prefix, k);
    const row = (k === 0 ? head : hangs ? foldPrefix(picked) : bareCells(picked)) + (filled[k] ?? "");
    // Squared and CLOSED: without the reset the row's own fill runs on, and a terminal erasing to end of line paints
    // the rectangle out to its own edge, one row at a time.
    out.push(tail === -1 ? row : padCell(row, limit) + RESET_MARK);
  }
  return out;
}
