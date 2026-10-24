import { describe, it, expect } from "vitest";
import { Lexer, type Token } from "marked";
import { INERT, inertForHost } from "./host-markdown.js";
import { printedWidth } from "./layout/measure.js";
import { displayWidth } from "./layout/width.js";
import { ANSI_RE } from "./style.js";

const INK = "\x1b[38;2;177;185;249m";
const RESET = "\x1b[0m";

/** Every token kind the host's parser reads in `s`, nested ones included, a bare email or URL read as text. */
function kinds(s: string): string[] {
  const out: string[] = [];
  const walk = (tokens: Token[]) => {
    for (const t of tokens) {
      out.push(t.type === "link" && t.text === t.raw ? "text" : t.type);
      if ("tokens" in t && t.tokens) walk(t.tokens);
      if ("items" in t && Array.isArray(t.items)) for (const item of t.items as Token[]) walk([item]);
    }
  };
  walk(Lexer.lex(s, { gfm: true }));
  return out;
}

const PLAIN = new Set(["paragraph", "space", "text", "br"]);

describe("inertForHost", () => {
  it("swaps each character for a lookalike of one column", () => {
    for (const lookalike of Object.values(INERT)) expect(displayWidth(lookalike)).toBe(1);
  });

  it("leaves plain text as it is", () => {
    for (const s of ["a plain line", "snake_case_name", "a - b", "1 + 1 = 2", "cost: 5 * 3", "x > y"])
      expect(inertForHost(s)).toBe(s);
  });

  it("leaves a bare email or URL, which the host prints whole", () => {
    for (const s of ["mail first.last-ext@example.com", "see https://example.com/a_b", "www.example.com", "pkg@2.8.1"])
      expect(inertForHost(s)).toBe(s);
  });

  it("makes every construct the host would restyle plain, on one line or opening it", () => {
    const constructs = [
      "*a*", "**a**", "_a_", "__a__", "~a~", "~~a~~", "`a`", "<b>x</b>", "<!-- c -->", "&lt;",
      "[x](https://y.z)", "![i](j.png)", "<https://example.com>", "<x@y.com>", "a \\| b", "\\*x\\*",
      "# head", "> quote", "+ item", "- item", "* item", "1. item", "1) item", "---", "***", "    indented",
      "```", "~~~", "a\n===", "a\n---", "| a | b |\n| --- | --- |", "[ref]: https://example.com",
    ];
    for (const s of constructs) {
      const out = inertForHost(s);
      expect(kinds(out).filter((k) => !PLAIN.has(k)), `${JSON.stringify(s)} gave ${JSON.stringify(out)}`).toEqual([]);
    }
  });

  it("keeps every line's width", () => {
    for (const s of ["_a_ │ ~b~ │ <c>", "# head", "    code", "[x](y) and z", "| a |\n| - |"]) {
      const before = s.split("\n").map(printedWidth);
      expect(inertForHost(s).split("\n").map(printedWidth)).toEqual(before);
    }
  });

  it("keeps every escape sequence whole", () => {
    const s = `${INK}_a_${RESET} │ ${INK}~~b~~${RESET} │ ${INK}[x](y)${RESET}`;
    const out = inertForHost(s);
    expect(out.match(ANSI_RE)).toEqual(s.match(ANSI_RE));
    expect(kinds(out).filter((k) => !PLAIN.has(k))).toEqual([]);
  });

  it("moves the sequences a URL would swallow behind the blank after it, the link kept whole", () => {
    expect(inertForHost(`${INK}https://x.y${RESET}  │`)).toBe(`${INK}https://x.y ${RESET} │`);
  });

  it("makes a URL inert when no blank follows the sequences it would swallow", () => {
    expect(inertForHost(`https://x.y${RESET}`)).toBe(`https${INERT[":"]}//x.y${RESET}`);
    expect(inertForHost(`www.x.y${RESET}`)).toBe(`www${INERT["."]}x.y${RESET}`);
  });

  it("keeps a character of two code units whole", () => {
    expect(inertForHost("🦀 _a_ 😀")).toBe(`🦀 ${INERT._}a${INERT._} 😀`);
  });
});
