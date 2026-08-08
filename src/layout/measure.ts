// How wide a line will PRINT: terminal COLUMNS rather than code units (width.ts), over what actually reaches the screen.
//
// ONE measure, for the frame and for a data cell alike. A second one counting a backtick and a {{tag}} as text
// disagreed with this on any cell holding a code span: the cell was sized on the backticks and the column after it
// decoupled by two per pair.

import { ANSI_RE, CODE_RE, TAG_RE, isTag } from "../style.js";
import { HANG_MARK, RULE_MARK } from "./marks.js";
import { displayWidth } from "./width.js";

// The control marks are invisible, and the {{tag}} markers and the backticks of a `code` span are consumed downstream,
// so none of them costs a column. Exported as TEXT for the caller asking what glyph a line ends on, which no width says.
export function printedText(s: string): string {
  return s
    .split(RULE_MARK)
    .join("")
    .split(HANG_MARK)
    .join("")
    .replace(CODE_RE, "$1")
    .replace(TAG_RE, (m: string, name: string) => (isTag(name) ? "" : m))
    .replace(ANSI_RE, "");
}

export function printedWidth(s: string): number {
  return displayWidth(printedText(s));
}

export function padCell(s: string, width: number): string {
  const w = printedWidth(s);
  return w >= width ? s : s + " ".repeat(width - w);
}

export function longestKey(map: Record<string, string>): number {
  return Object.keys(map).reduce((n, k) => Math.max(n, displayWidth(k)), 0);
}
