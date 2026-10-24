// What Claude Code's own markdown pass makes of a drawing, judged with the parser it bundles. A suite for the whole
// engine rather than a module, so it lives here: every view, fed what a real message holds, must leave that pass as
// plain text, with every escape sequence whole. A drawing the parser would restyle is a frame sheared on screen, and
// this is where it turns red instead, before a release rather than in a screenshot.
//
// The sentinel at the end keeps the judge honest: it checks that the Claude Code installed here still bundles the
// marked this engine pins. A Claude Code that moved on fails it, which says to pin the new parser and run this again.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Lexer, type Token } from "marked";
import { transform } from "../../src/pipeline.js";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GALLERY = [path.join(REPO, "scripts", "gallery"), path.join(REPO, "scripts", "gallery-layouts")];
const render = (msg: string): string => transform(msg, undefined, true, undefined, { width: 100 });

/** What a real message puts in a view: addresses, versions, links, and every character markdown reads as markup. */
const HOSTILE = [
  "first.last-ext@example.com", "@2.8.1", "cc-views@2.8.4", "@scope/pkg@2.8.4", "@mention", "a@b",
  "https://example.com/a_b", "www.example.com", "ftp://example.com", "https://x.y)", "(https://x.y)", "<https://example.com>", "<x@y.com>",
  "*a*", "**a**", "_a_", "__a__", "a_b_c", "~a~", "~~a~~", "<b>x</b>", "<!-- c -->", "&amp; &lt;", "\\*x\\*", "a\\b",
  "[x](https://y.z)", "![i](j.png)", "[ref]", "[^1]", "# head", "> q", "1. one", "1) one", "- li", "+ li", "* li",
  "---", "===", "    indented", "\tTab", "x  ", "a | b", "a \\| b", "`code`", "``a`b``", "😀 emoji", "日本語テキスト",
  "$x$", ":smile:", "%s %d", "{{tag}}", "[x]: https://y.z",
];

/** One block per view, the hostile run in every place a value goes: a cell, a label's line, a quote, a document. */
function blocks(value: string): Record<string, string> {
  return {
    columns: `@{view:columns}\n| A | B |\n| --- | --- |\n| ${value} | ${value} |\n| x | ${value} |`,
    lines: `@{view:lines}\n| A | B |\n| --- | --- |\n| ${value} | ${value} |`,
    box: `@{view:box}\n| T | |\n| --- | --- |\n| SAID | ${value} |\n| | - ${value} |`,
    banner: `@{view:banner}\n> [!NOTE]\n> ${value}`,
    quote: `@{view:quote}\n> ${value}`,
    markdown: "@{view:markdown}\n```markdown\n" + `## ${value}\n- ${value}\n\n${value}\n` + "```",
  };
}

const PLAIN = new Set(["paragraph", "space", "text", "br"]);
/** An escape the parser cut: its ESC left in one token, the rest of it in the next. */
const CUT_ESCAPE = /\x1b(?!\[[0-9;]*m)/;

/** Every token the host's parser would restyle in `s`, every token holding a cut escape, and every link holding one. */
function restyled(s: string): string[] {
  const found: string[] = [];
  const walk = (tokens: Token[]) => {
    for (const t of tokens) {
      const bare = t.type === "link" && t.text === t.raw;
      if (!PLAIN.has(t.type) && !bare) found.push(`${t.type} ${JSON.stringify(t.raw)}`);
      // A link prints its text, then its address, with the escape stripped of its ESC: `[2m` on screen.
      if (bare && t.raw.includes("\x1b")) found.push(`link swallowing an escape ${JSON.stringify(t.raw)}`);
      if ("tokens" in t && t.tokens && !bare) walk(t.tokens);
      else if (CUT_ESCAPE.test(t.raw)) found.push(`cut escape ${JSON.stringify(t.raw)}`);
    }
  };
  walk(Lexer.lex(s, { gfm: true }));
  return found;
}

describe("a drawing, through Claude Code's markdown pass", () => {
  for (const [name, block] of Object.entries(blocks("x")))
    it(`${name}: whatever a value holds, leaves it as plain text`, () => {
      for (const value of HOSTILE)
        for (const shown of [value, `\`${value}\``]) {
          const msg = blocks(shown)[name] ?? block;
          const out = render(msg);
          expect(out, `${name} did not draw ${JSON.stringify(shown)}`).not.toBe(msg);
          expect(restyled(out), `${name} with ${JSON.stringify(shown)}`).toEqual([]);
        }
    });

  it("leaves every gallery drawing as plain text", () => {
    for (const dir of GALLERY)
      for (const file of fs.readdirSync(dir)) {
        const out = render(fs.readFileSync(path.join(dir, file), "utf8"));
        expect(restyled(out), file).toEqual([]);
      }
  });
});

/** The Claude Code binary installed here: CLAUDE_CODE_BIN, else the newest under ~/.local/share/claude/versions. */
function claudeCodeBinary(): string | undefined {
  const named = process.env.CLAUDE_CODE_BIN;
  if (named) return fs.existsSync(named) ? named : undefined;
  const dir = path.join(os.homedir(), ".local", "share", "claude", "versions");
  if (!fs.existsSync(dir)) return undefined;
  const newest = fs
    .readdirSync(dir)
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);
  return newest && path.join(dir, newest);
}

/** The regular expressions marked's own source spells, long enough to name it. */
function markedFingerprint(): string[] {
  const source = fs.readFileSync(createRequire(import.meta.url).resolve("marked").replace(/[^/]+$/, "marked.esm.js"), "latin1");
  const literals = source.matchAll(/\/((?:\\.|\[(?:\\.|[^\]])*\]|[^/\n\\[])+)\/[gimsuy]*/g);
  return [...new Set([...literals].map((m) => m[1] ?? "").filter((r) => r.length > 12))];
}

/** Share of the pinned marked's regular expressions found verbatim in Claude Code 2.1.310: 64 of 71. */
const FINGERPRINT_FLOOR = 0.85;
const BINARY = claudeCodeBinary();

describe("the parser this suite judges with", () => {
  it.skipIf(BINARY === undefined)("is the one the installed Claude Code bundles", () => {
    const bundle = fs.readFileSync(BINARY ?? "", "latin1");
    const rules = markedFingerprint();
    const found = rules.filter((r) => bundle.includes(r)).length / rules.length;
    expect(found, `Claude Code at ${BINARY ?? ""} no longer bundles the pinned marked: pin its parser`).toBeGreaterThan(
      FINGERPRINT_FLOOR
    );
  });
});
