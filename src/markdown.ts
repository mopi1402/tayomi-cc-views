// Markdown drawn to a column: what a ```markdown fence becomes before a template prints it (render.ts, @markdown).
//
// A SUBSET, the one a reply is written in: headings, lists, quotes, rules, fenced code and paragraphs, with bold and
// code spans inline. Every other line is paragraph text and prints as written, never dropped.

import { CODE_TICK, NL, QUOTE_MARK } from "./data/markup.js";
import { foldText } from "./layout/wrap.js";
import { printedWidth } from "./layout/measure.js";
import { inert, inertText, spanClose, spanOpen } from "./style.js";

const BULLET = "• ";
/** The glyph box.view draws its gutter with: a quote here reads as the quote view's band. */
const QUOTE_BAR = "▎ ";
const RULE = "─";
/** One level of list nesting, and the indent a code line sits at. */
const NEST = "  ";
const HEADING_TAG = "b";
/** A tab in a list's indent counts as this many spaces, CommonMark's own stop. */
const TAB_STOP = 4;
/** The fewest columns a fold may be handed, so a deep list in a narrow column still prints rather than throws. */
const MIN_ROOM = 1;

const HEADING_RE = /^ {0,3}#{1,6}[ \t]/;
const HEADING_MARK = "#";
/** Three or more of one of these, spaces between allowed, is a thematic break. */
const RULE_MARKS = "-*_";
const RULE_MIN = 3;
const RULE_INDENT_MAX = 3;
const ITEM_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const ORDERED_RE = /^\d/;
// eslint-disable-next-line security/detect-non-literal-regexp
const QUOTE_RE = new RegExp(String.raw`^[ \t]*${QUOTE_MARK}[ \t]?(.*)$`);
// eslint-disable-next-line security/detect-non-literal-regexp
const FENCE_RE = new RegExp(String.raw`^[ \t]*(${CODE_TICK}{3,})`);

/** A block being gathered: its first row's prefix, the prefix every folded row after it hangs from, and its text. */
interface Block {
  lead: string;
  hang: string;
  text: string;
  /** Already neutralised and styled, as a heading is: folded as it stands. */
  styled?: boolean;
}

function fold(block: Block, width: number): string[] {
  const text = block.styled === true ? block.text : inertText(block.text);
  const room = Math.max(MIN_ROOM, width - printedWidth(block.lead));
  return foldText(text, room).map((row, i) => (i === 0 ? block.lead : block.hang) + row);
}

/** A heading's text: the marks off its head, and the optional closing run off its tail. Parsed by string. */
function headingText(line: string): string {
  const words = line.trim().split(/[ \t]+/).slice(1);
  if (words.length && words[words.length - 1].split(HEADING_MARK).join("") === "") words.pop();
  return words.join(" ");
}

function isRule(line: string): boolean {
  const indent = line.length - line.trimStart().length;
  const marks = line.trim().split(/[ \t]/).join("");
  return (
    indent <= RULE_INDENT_MAX &&
    marks.length >= RULE_MIN &&
    RULE_MARKS.includes(marks[0]) &&
    marks.split(marks[0]).join("") === ""
  );
}

const indentWidth = (indent: string): number => indent.split("\t").join(" ".repeat(TAB_STOP)).length;

/** The source drawn to `width`, one string of rows, every piece of it message text neutralised before it is styled. */
export function drawMarkdown(source: string, width: number): string {
  const out: string[] = [];
  let open: Block | null = null;
  let fence: string | null = null;
  const flush = (): void => {
    if (open !== null) out.push(...fold(open, width));
    open = null;
  };
  for (const line of source.split(NL)) {
    if (fence !== null) {
      // A closer is a bare run at least as long as the opener, so a shorter run inside stays code.
      if (line.trim().startsWith(fence) && line.trim().split(CODE_TICK).join("") === "") fence = null;
      else out.push(...foldText(inert(line), Math.max(MIN_ROOM, width - NEST.length)).map((r) => NEST + r));
      continue;
    }
    const opener = line.match(FENCE_RE);
    if (opener) {
      flush();
      fence = opener[1];
      continue;
    }
    if (line.trim() === "") {
      flush();
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    if (isRule(line)) {
      flush();
      out.push(RULE.repeat(width));
      continue;
    }
    if (HEADING_RE.test(line)) {
      flush();
      const text = spanOpen(HEADING_TAG) + inertText(headingText(line)) + spanClose(HEADING_TAG);
      out.push(...fold({ lead: "", hang: "", text, styled: true }, width));
      continue;
    }
    const item = line.match(ITEM_RE);
    if (item) {
      flush();
      const depth = NEST.repeat(Math.floor(indentWidth(item[1]) / NEST.length));
      const marker = ORDERED_RE.test(item[2]) ? `${item[2]} ` : BULLET;
      open = { lead: depth + marker, hang: depth + " ".repeat(printedWidth(marker)), text: item[3] };
      continue;
    }
    const quote = line.match(QUOTE_RE);
    if (quote) {
      if (open?.lead !== QUOTE_BAR) {
        flush();
        open = { lead: QUOTE_BAR, hang: QUOTE_BAR, text: quote[1] };
      } else open.text += ` ${quote[1]}`;
      continue;
    }
    // Lazy continuation, markdown's own: a line that opens nothing joins the paragraph, item or quote above it.
    if (open !== null) open.text += ` ${line.trim()}`;
    else open = { lead: "", hang: "", text: line.trim() };
  }
  flush();
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join(NL);
}
