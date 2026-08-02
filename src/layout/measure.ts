// How wide a line will PRINT, which is not its string length.
//
// Measured in terminal COLUMNS rather than code units (width.ts), over what actually reaches the screen.
//
// ONE measure, for the frame and for a data cell alike. A second one counting a backtick and a {{tag}} as text
// disagreed with this on any cell holding a code span: the cell was sized on the backticks and the column after it
// decoupled by two per pair.

import {
  ANSI_RE,
  CODE_RE,
  CODE_TICK,
  RESUME_MARK,
  SPAN_MARK,
  TAG_AT,
  TAG_RE,
  closeCut,
  isTag,
  popSpan,
  trackTag,
} from "../style.js";
import { HANG_MARK, RULE_MARK } from "./marks.js";
import { displayWidth } from "./width.js";

// The control marks are invisible, and the {{tag}} markers and the backticks of a `code` span are consumed downstream,
// so none of them costs a column.
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

// A value wider than its cell, cut on an ellipsis. Only a CAPPED column can produce one, which is why ordinary views
// never pass through here. The cut speaks the same vocabulary as printedWidth or the two disagree on any cell holding
// markup, and whatever it leaves open is closed behind it, so no marker reaches the terminal half-eaten and no style
// bleeds past the cell.
const ELLIPSIS = "…";

export function fitCell(s: string, width: number): string {
  if (printedWidth(s) <= width) return s;
  const budget = width - displayWidth(ELLIPSIS);
  let out = "";
  let w = 0;
  // The shared notion of what is open (style.ts), never a copy: a boolean here could say whether a style was open and
  // never which, and it counted the tag of a COMPLETE engine span as still standing.
  const open: string[] = [];
  let code = false;
  let i = 0;
  while (i < s.length) {
    TAG_AT.lastIndex = i;
    const tag = TAG_AT.exec(s);
    if (tag !== null && isTag(tag[1])) {
      out += tag[0];
      trackTag(open, tag[1]);
      i = TAG_AT.lastIndex;
      continue;
    }
    // Zero columns, so neither touches the budget: they are walked for the notion alone.
    if (s[i] === SPAN_MARK) {
      out += SPAN_MARK;
      trackTag(open, SPAN_MARK);
      i += SPAN_MARK.length;
      continue;
    }
    if (s[i] === RESUME_MARK) {
      out += RESUME_MARK;
      popSpan(open);
      i += RESUME_MARK.length;
      continue;
    }
    // An opening backtick is markup only when a NON-EMPTY span closes ahead, the same shape CODE_RE accepts; anything
    // else is text and costs a column.
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
  // Never a reset: the value is a span the engine put inside a line whose style it did not choose, so a reset here
  // kills the colour the TEMPLATE opened around the cell and the ellipsis and everything after it print plain. How many
  // resumes that takes is the frame arithmetic, and it lives in style.ts beside the rule they resolve by.
  return closeCut(out, open) + ELLIPSIS;
}

export function longestKey(map: Record<string, string>): number {
  return Object.keys(map).reduce((n, k) => Math.max(n, displayWidth(k)), 0);
}
