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
  isTag,
  tagSource,
} from "../style.js";
import { HANG_MARK, TAIL_MARK, VOID_MARK } from "./marks.js";
import { padCell, printedWidth } from "./measure.js";
import { clusterMap, displayWidth } from "./width.js";

/** The section bar a template draws down its left margin. */
const GUTTER_BAR = "▎";
const SPACE = " ";
const ANY = String.raw`[\s\S]*`;

// Under this many columns there is nothing worth wrapping into, and a continuation narrower than this could not hold a
// word: both leave the line long rather than shred it into single letters.
const MIN_LIMIT = 8;
const MIN_CONT = 4;

type Atom = { s: string; w: number; space: boolean; tick: boolean };

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
      atoms.push({ s: m[0], w: 0, space: false, tick: false });
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
const KEEP_RE = new RegExp(`(${TAG_SOURCE}|${SPAN_MARK}|${RESUME_MARK}|${GUTTER_BAR})`);
// eslint-disable-next-line security/detect-non-literal-regexp
const IS_KEPT = new RegExp(`^(?:${TAG_SOURCE}|${SPAN_MARK}|${RESUME_MARK}|${GUTTER_BAR})$`);

/** The plain indent a line opens on: the prefix a line with no gutter bar hangs from. */
const INDENT_RE = /^[ \t]*/;

// Tags, the marks that close them, and the bar survive; every other visible character becomes a space.
function blankPrefix(prefix: string): string {
  return prefix
    .split(KEEP_RE)
    .map((part) => (IS_KEPT.test(part) ? part : SPACE.repeat(displayWidth(part))))
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

export function wrapLine(line: string, limit: number): string[] {
  if (limit < MIN_LIMIT || printedWidth(line) <= limit) return [line];
  // A declared TAIL only ever belonged to a line that fits: past here the fold drops it and squares every row to the
  // limit instead, which is what parts a rectangle from a staircase. Measured ABOVE with the tail still on, so a band
  // keeps its closing furniture for as long as that furniture fits.
  const tail = line.indexOf(TAIL_MARK);
  const body = tail === -1 ? line : line.slice(0, tail);
  // An explicit hanging boundary wins over the inferred one: a bullet declared on the @each sits AFTER the gutter bar,
  // so PREFIX_RE alone would leave it inside the wrapped text and print it again on every continuation row.
  const hang = body.indexOf(HANG_MARK);
  const m = hang === -1 ? body.match(PREFIX_RE) : null;
  const prefix =
    hang !== -1
      ? body.slice(0, hang)
      : m
        ? m[1]
        : (body.match(INDENT_RE) as RegExpMatchArray)[0];
  const rest =
    hang !== -1 ? body.slice(hang + HANG_MARK.length) : m ? m[2] : body.slice(prefix.length);
  const cont = hang !== -1 || m ? foldPrefix(prefix) : prefix;
  // The FIRST row draws the prefix as written, less the mark that only ever spoke to the fold.
  const head = prefix.split(VOID_MARK).join("");
  const width = limit - printedWidth(prefix);
  if (width < MIN_CONT) return [line];
  // Greedy fill, breaking at the last space of the line and hard-splitting a token wider than the whole column (a long
  // path, which must break somewhere rather than push the border out).
  const groups: Atom[][] = [];
  let cur: Atom[] = [];
  let w = 0;
  for (const a of atomize(rest)) {
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
  // A code span cut in two is closed and reopened, otherwise the orphan backtick reaches the screen and neither half
  // renders as code.
  const out: string[] = [];
  let open = false;
  groups.forEach((atoms, idx) => {
    let s = open ? CODE_TICK : "";
    let o = open;
    for (const a of atoms) {
      s += a.s;
      if (a.tick) o = !o;
    }
    if (o) s += CODE_TICK;
    const row = (idx === 0 ? head : cont) + s;
    // Squared and CLOSED: without the reset the row's own fill runs on, and a terminal erasing to end of line paints
    // the rectangle out to its own edge, one row at a time.
    out.push(tail === -1 ? row : padCell(row, limit) + RESET_MARK);
    open = o;
  });
  return out;
}
