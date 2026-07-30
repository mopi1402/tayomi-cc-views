// How wide a line will PRINT, which is not its string length.
//
// Widths are measured in terminal COLUMNS rather than code units (see width.ts: an
// ideograph or an emoji costs two columns and a joined sequence costs two for many
// code units), and only over what actually reaches the screen.
//
// ONE measure, for the frame and for a data cell alike. There used to be a second
// one that counted a backtick and a {{tag}} as text, and the two disagreed on any
// cell holding a code span: the cell was sized on the backticks, its neighbours were
// padded to that width, and the column after them decoupled by two per backtick pair
// (measured on the review-spec-verdict view, a `parse.ts` type cell). A cell is
// consumed by the same renderCode and renderTags as the rest of the line, so it is
// measured the same way. Accepted with the merge: a column holding a code span is
// now two columns narrower per backtick pair, which is its real printed width.

import { ANSI_RE, CODE_RE, CODE_TICK, RESET_MARK, TAG_AT, TAG_RE, isTag } from "../style.js";
import { HANG_MARK, RULE_MARK } from "./marks.js";
import { displayWidth } from "./width.js";

// A RENDERED line's width, the one the framer sizes itself on: the control marks
// are invisible, the {{tag}} markers and the backticks of a `code` span are
// consumed downstream by renderTags and renderCode, so none of them costs a column.
export function printedWidth(s: string): number {
  return displayWidth(
    s
      .split(RULE_MARK)
      .join("")
      .split(HANG_MARK)
      .join("")
      .replace(CODE_RE, "$1")
      .replace(TAG_RE, (m: string, name: string) => (isTag(name) ? "" : m))
      .replace(ANSI_RE, "")
  );
}

export function padCell(s: string, width: number): string {
  const w = printedWidth(s);
  return w >= width ? s : s + " ".repeat(width - w);
}

// A value wider than its cell, cut on an ellipsis. Only a CAPPED column can produce
// one (an uncapped width is measured over the values themselves, so no value exceeds
// it), which is why ordinary views never pass through here. The cut speaks the same
// vocabulary as printedWidth or the two disagree on any cell holding markup: a known
// {{tag}} is a zero-width atom (never cut open), a code span's backticks are zero
// width, and whatever the cut leaves open is closed behind it, so no marker ever
// reaches the terminal half-eaten and no style bleeds past the cell.
const ELLIPSIS = "…";

export function fitCell(s: string, width: number): string {
  if (printedWidth(s) <= width) return s;
  const budget = width - displayWidth(ELLIPSIS);
  let out = "";
  let w = 0;
  let styled = false;
  let code = false;
  let i = 0;
  while (i < s.length) {
    TAG_AT.lastIndex = i;
    const tag = TAG_AT.exec(s);
    if (tag !== null && isTag(tag[1])) {
      out += tag[0];
      styled = tag[0] !== RESET_MARK;
      i = TAG_AT.lastIndex;
      continue;
    }
    // An opening backtick is markup only when a NON-EMPTY span closes ahead,
    // the same shape CODE_RE accepts; anything else is text and costs a column.
    if (s[i] === CODE_TICK && (code || s.indexOf(CODE_TICK, i + 1) > i + 1)) {
      code = !code;
      out += CODE_TICK;
      i++;
      continue;
    }
    const ch = String.fromCodePoint(s.codePointAt(i) as number);
    const cw = displayWidth(ch);
    if (w + cw > budget) break;
    out += ch;
    w += cw;
    i += ch.length;
  }
  if (code) out += CODE_TICK;
  if (styled) out += RESET_MARK;
  return out + ELLIPSIS;
}

export function longestKey(map: Record<string, string>): number {
  return Object.keys(map).reduce((n, k) => Math.max(n, displayWidth(k)), 0);
}
