// Claude Code shows the drawn message through its OWN markdown pass, and whatever that pass reads as markup it
// restyles: it eats the delimiters of an emphasis, a strikethrough, a link or a tag, turns a line opening on `#`, `>`
// or `+` into a heading, a quote or a list, and the rows the layout had squared come out sheared. Swapping one
// character at a time, as each one showed up on a screen, never ends: there is always a next one.
//
// So the drawing is read by the host's own parser before it leaves, and every construct that parser would see is made
// inert, one character swapped for a one-column lookalike, until the parser sees nothing but plain text. The parser is
// marked 15.0.12, the one Claude Code bundles (fingerprinted in its 2.1.310 binary: 64 of the 71 regular expressions of
// marked 15.0.12 appear in it verbatim, more than in any other release). A bare email or URL stays: the host links it in
// its own style but prints it whole, so it costs no column.

import { createRequire } from "node:module";
// TYPES alone, erased at compile time. Naming the module in a VALUE import is exactly what load() exists to avoid.
import type * as Marked from "marked";
import { ANSI_RE, INERT_DASH, INERT_DOT, INERT_STAR, INERT_TICK, R } from "./style.js";

/** The parser's npm home, pinned to the release the host bundles. */
const PARSER_PKG = "marked";

let parser: typeof Marked | undefined;

/** The parser, loaded on the first drawing of a process, so a message with no view never pays for it. */
function load(): typeof Marked {
  parser ??= createRequire(import.meta.url)(PARSER_PKG) as typeof Marked;
  return parser;
}

/** Each character the parser reads as markup, and the one-column lookalike that says nothing to it. */
export const INERT: Readonly<Record<string, string>> = {
  "*": INERT_STAR,
  "`": INERT_TICK,
  "-": INERT_DASH,
  ".": INERT_DOT,
  _: "ˍ", // MODIFIER LETTER LOW MACRON
  "~": "˜", // SMALL TILDE
  "<": "‹", // SINGLE LEFT-POINTING ANGLE QUOTATION MARK
  ">": "›", // SINGLE RIGHT-POINTING ANGLE QUOTATION MARK
  // The CLOSING bracket: an escape sequence holds an opening one (`ESC[38;…m`), which the parser would take for the
  // start of a link once the link's own was swapped. With no `]` left, no `](` and no link can form at all.
  "]": "⁆", // RIGHT SQUARE BRACKET WITH QUILL
  "\\": "⧵", // REVERSE SOLIDUS OPERATOR
  "#": "♯", // MUSIC SHARP SIGN
  "+": "˖", // MODIFIER LETTER PLUS SIGN
  "|": "∣", // DIVIDES
  "=": "꞊", // MODIFIER LETTER SHORT EQUALS SIGN
  ")": "❩", // MEDIUM RIGHT PARENTHESIS ORNAMENT
  ":": "꞉", // MODIFIER LETTER COLON
};

// What may reach the host: plain text, a hard break the layout asked for, and the blanks between paragraphs.
const PLAIN_BLOCKS = new Set(["paragraph", "space"]);
const PLAIN_INLINES = new Set(["text", "br"]);

// The markers a block construct opens a line with, at most three blanks in, as CommonMark reads them.
const LIST_OPENER_RE = /^( {0,3})([-+*]|\d{1,9}[.)])(?=[ \t]|$)/gm;
const QUOTE_OPENER_RE = /^( {0,3})(>)/gm;
const HEADING_OPENER_RE = /^( {0,3})(#{1,6})(?=[ \t]|$)/gm;
const UNDERLINE_RE = /^( {0,3})([-=*_][-=*_ \t]*)$/gm;
const FENCE_RE = /^( {0,3})(`{3,}|~{3,})/gm;
const CODE_INDENT_RE = /^(?=[ \t])/gm;

// An escape sequence, captured, so a split keeps it as a part of its own.
// eslint-disable-next-line security/detect-non-literal-regexp
const ANSI_PART_RE = new RegExp(`(${ANSI_RE.source})`);

/** Every character of `chars` in `s` swapped for its lookalike, the escape sequences left whole. */
function swap(s: string, chars: string): string {
  return s
    .split(ANSI_PART_RE)
    .map((part, i) => (i % 2 === 1 ? part : [...part].map((c) => (chars.includes(c) ? (INERT[c] ?? c) : c)).join("")))
    .join("");
}

/** The opener of each line a block construct starts, its markup swapped. */
function swapOpeners(s: string, re: RegExp): string {
  return s.replace(re, (_whole: string, lead: string, marker: string) => lead + swap(marker, marker));
}

/** A link the parser found where the text already reads as one, an email or a URL: printed whole, it is plain. */
function isBareLink(token: Marked.Tokens.Generic): boolean {
  return token.type === "link" && token.text === token.raw;
}

/** The same raw, inert to the parser, for a token it would restyle. */
function inertRaw(token: Marked.Tokens.Generic): string {
  const raw = token.raw;
  switch (token.type) {
    case "em":
    case "strong":
      return swap(raw, "*_");
    case "del":
      return swap(raw, "~");
    case "codespan":
      return swap(raw, "`");
    case "link":
    case "image":
      return swap(raw, raw.startsWith("<") ? "<" : "]");
    case "escape":
      return swap(raw, "\\");
    case "html":
      return swap(raw, "<");
    case "heading":
      return swapOpeners(swapOpeners(raw, HEADING_OPENER_RE), UNDERLINE_RE);
    case "hr":
      return swapOpeners(raw, UNDERLINE_RE);
    case "blockquote":
      return swapOpeners(raw, QUOTE_OPENER_RE);
    case "list":
      return swapOpeners(raw, LIST_OPENER_RE);
    case "code":
      return raw.startsWith(" ") || raw.startsWith("\t")
        ? raw.replace(CODE_INDENT_RE, R) // a reset is no blank and costs no column, as holdLeadingBlank measured
        : swapOpeners(raw, FENCE_RE);
    case "table":
      return swap(raw, "|");
    case "def":
      return swap(raw, "]");
    default:
      return swap(raw, Object.keys(INERT).join(""));
  }
}

// A URL runs to the next blank (marked's `[^\s<]*`), so it swallows the sequences glued to its end: Claude Code then
// prints its text, and its address beside it with each sequence stripped of its ESC, `[2m` on screen (measured
// 2026-10-24, a `columns` cell). Those sequences move behind the blank that follows, where a blank shows no ink.
// eslint-disable-next-line security/detect-non-literal-regexp
const TRAILING_ANSI_RE = new RegExp(`^([^\\x1b]*)((?:${ANSI_RE.source})+)$`);
const URL_OPENER_RE = /^((?:https?|ftp)(?=:)|www(?=\.))(.)/i;
const ESC = "\x1b";
const BLANK = " ";

/** A URL the parser would not link: the colon of its scheme, or the dot after its www, swapped. */
function inertUrl(raw: string): string {
  return raw.replace(URL_OPENER_RE, (_whole: string, opener: string, mark: string) => opener + swap(mark, mark));
}

interface Edit {
  at: number;
  raw: string;
  inert: string;
}

/** Where each token the parser would restyle sits in `src`, and what it becomes. */
function editsOf(tokens: Marked.Token[], src: string, base: number, plain: Set<string>): Edit[] {
  const edits: Edit[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const at = src.indexOf(token.raw, cursor);
    if (at < 0) continue;
    cursor = at + token.raw.length;
    if (token.type === "paragraph" && "tokens" in token && token.tokens)
      edits.push(...editsOf(token.tokens, src.slice(at, cursor), base + at, PLAIN_INLINES));
    else if (isBareLink(token as Marked.Tokens.Generic)) {
      if (!token.raw.includes(ESC)) continue;
      // Behind the blank that follows when there is one, which keeps the link whole. With none, or a sequence inside
      // the address, the address itself goes inert.
      const tail = TRAILING_ANSI_RE.exec(token.raw);
      if (tail && src[cursor] === BLANK)
        edits.push({ at: base + at, raw: token.raw + BLANK, inert: `${tail[1] ?? ""}${BLANK}${tail[2] ?? ""}` });
      else edits.push({ at: base + at, raw: token.raw, inert: inertUrl(token.raw) });
    } else if (!plain.has(token.type)) {
      const inert = inertRaw(token as Marked.Tokens.Generic);
      if (inert !== token.raw) edits.push({ at: base + at, raw: token.raw, inert });
    }
  }
  return edits;
}

/** How many passes it takes at most: each makes every construct found inert, and one only reveals a nested one. */
const MAX_PASSES = 8;

/**
 * The drawing as the host's markdown reads it: nothing but plain text, every construct its parser would restyle made
 * inert with a lookalike of one column, so the widths the layout measured still hold on screen.
 */
export function inertForHost(s: string): string {
  const { Lexer } = load();
  let out = s;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const edits = editsOf(Lexer.lex(out, { gfm: true }), out, 0, PLAIN_BLOCKS);
    if (edits.length === 0) return out;
    for (const { at, raw, inert } of edits.sort((a, b) => b.at - a.at))
      out = out.slice(0, at) + inert + out.slice(at + raw.length);
  }
  return out;
}
