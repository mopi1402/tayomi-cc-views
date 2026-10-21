import { describe, it, expect } from "vitest";
import { drawMarkdown } from "./markdown.js";
import { printedText, printedWidth } from "./layout/measure.js";
import { tagMark } from "./style.js";
import { NL } from "./data/markup.js";
import { CONTROL_MARKS } from "./data/marks.js";

const WIDTH = 30;
/** What a reader sees: the rows as printed, the engine's control marks and the tags they frame gone. */
const unmarked = (s: string): string => CONTROL_MARKS.reduce((t, m) => t.split(m).join(""), s);
const shown = (source: string, width = WIDTH): string[] =>
  drawMarkdown(source, width).split(NL).map((row) => unmarked(printedText(row)));
const md = (...lines: string[]): string => lines.join(NL);
const LONG = "un texte assez long pour plier au moins une fois dans la colonne";

describe("blocks", () => {
  it("draws a heading as its text alone, the marks and a closing run gone, and STYLED", () => {
    expect(shown("## Titre ##")).toEqual(["Titre"]);
    expect(drawMarkdown("## Titre", WIDTH)).not.toBe("Titre");
  });

  it("reads a hash with no space after it as text, CommonMark's own rule", () => {
    expect(shown("#nospace")).toEqual(["#nospace"]);
  });

  it("hangs a bullet's folded rows under its text, never under the marker", () => {
    const rows = shown(`- ${LONG}`);
    expect(rows.length).toBeGreaterThan(1);
    const hang = rows[0].indexOf(LONG.split(" ")[0]);
    for (const row of rows.slice(1)) expect(row.slice(0, hang).trim()).toBe("");
    expect(rows.every((r) => printedWidth(r) <= WIDTH)).toBe(true);
  });

  it("reads a dash glued to its word as text, not as a bullet", () => {
    expect(shown("-item")).toEqual(["-item"]);
  });

  it("indents a nested item one level deeper than its parent", () => {
    const [parent, child] = shown(md("- a", "  - b"));
    expect(child.indexOf("b")).toBeGreaterThan(parent.indexOf("a"));
  });

  it("keeps an ordered item's number, and hangs its fold past it", () => {
    const rows = shown(`12. ${LONG}`);
    expect(rows[0].startsWith("12. ")).toBe(true);
    expect(rows[1].startsWith(" ".repeat("12. ".length))).toBe(true);
  });

  it("reads a decimal as text, there being no space after its dot", () => {
    expect(shown("1.5 litres")).toEqual(["1.5 litres"]);
  });

  it("draws the quote's bar on EVERY row it folds into", () => {
    const rows = shown(`> ${LONG}`);
    expect(rows.length).toBeGreaterThan(1);
    const bar = rows[0][0];
    expect(rows.every((r) => r.startsWith(bar))).toBe(true);
  });

  it("draws a rule across the whole width, and two stars as the text they are", () => {
    expect(printedWidth(shown("***")[0])).toBe(WIDTH);
    expect(shown("- - -")).toHaveLength(1);
    expect(shown("**")).toEqual(["**"]);
  });

  it("joins a line opening nothing to the paragraph above, and parts paragraphs on a blank", () => {
    expect(shown(md("un", "deux", "", "trois"))).toEqual(["un deux", "", "trois"]);
  });

  it("keeps one blank for many, and none at either end", () => {
    expect(shown(md("", "un", "", "", "", "deux", ""))).toEqual(["un", "", "deux"]);
  });
});

describe("code", () => {
  it("indents a fenced code line and folds nothing into prose around it", () => {
    const rows = shown(md("avant", "```", "pnpm test", "```", "après"));
    expect(rows).toEqual(["avant", "  pnpm test", "après"]);
  });

  it("closes a fence only on a bare run at least as long as its opener", () => {
    const rows = shown(md("````", "```", "dedans", "````", "dehors"));
    expect(rows).toEqual(["  ```", "  dedans", "dehors"]);
  });
});

describe("message text", () => {
  it("is neutralised before it is styled, so a tag it writes never opens a colour", () => {
    const tag = tagMark("fail");
    for (const source of [tag, `- ${tag}`, `# ${tag}`, md("```", tag, "```")]) {
      expect(drawMarkdown(source, WIDTH)).not.toContain(tag);
      expect(shown(source).join("")).toContain(tag);
    }
  });

  it("styles a bold span, the stars gone from the screen", () => {
    expect(shown("un **gras** ici")).toEqual(["un gras ici"]);
  });
});
