// The checker, judged on what it must NOT say as much as on what it must.
//
// Its whole claim is that it needs no parser: it runs the engine and reads back what stands in the output. So the cases
// below pin the two ways that claim could be a lie. A survivor the SAMPLE DATA carried is not the template's fault, and
// each case here feeds one deliberately. And the engine's refusal is compared against the message the engine itself
// throws, captured in the same test, because a copy of that wording here would be free to drift from it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  DIRECTIVE,
  ERROR,
  REFUSAL,
  TAG,
  UNREAD,
  WARNING,
  check,
  failed,
  report,
  type Finding,
} from "./check.js";
import { BARE, BOX } from "./data/language.js";
import { NAME_MARK } from "./data/markup.js";
import { isTag, tagMark } from "./style.js";
import { bundledViewsDir, viewFile } from "./template/load.js";
import { renderView } from "./template/render.js";

const WIDTH = 80;
const TITLE = "title";
const EXTRA = "extra";
const VALUE = "hi";
/** A name the palette answers to nowhere, asserted below rather than assumed. */
const UNKNOWN = "nosuchtag";
/** A near-miss of `bare`, one letter out: the box matcher takes the word or nothing, so the line falls to the body. */
const TYPO = "bear";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-check-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const slot = (field: string): string => `\${${field}}`;
const pair = (field: string, value: string): string => `${field}${NAME_MARK} ${value}`;

function view(name: string, ...lines: string[]): string {
  fs.writeFileSync(viewFile(dir, name), `${lines.join("\n")}\n`);
  return name;
}
const run = (name: string, block?: string): Finding[] =>
  check(name, block, { viewsPath: [dir], width: WIDTH });
const kinds = (findings: readonly Finding[]): string[] => findings.map((f) => f.kind);

describe("a template that draws", () => {
  it("reports nothing at all, which is the case every other one here is measured against", () => {
    const name = view("good", slot(TITLE));
    expect(run(name, pair(TITLE, VALUE))).toEqual([]);
  });

  it("checks a view spending no slot with no block, rather than refusing for want of data", () => {
    const name = view("static", VALUE);
    expect(run(name)).toEqual([]);
    expect(failed(run(name))).toBe(false);
  });

  it("clears the views this package ships, which are the only real templates in the tree", () => {
    // The false-positive case with teeth: a matcher that called every directive a survivor would still pass everything
    // above, since those fixtures hold one line each.
    const bundled = { viewsPath: [bundledViewsDir()], width: WIDTH };
    for (const name of ["welcome", "hr"]) expect(check(name, "", bundled)).toEqual([]);
  });
});

describe("what still stands in the output", () => {
  it("names a directive nothing read, on the template line that wrote it", () => {
    const name = view("typo", `${BOX} ${TYPO}`, slot(TITLE));
    const [found, ...rest] = run(name, pair(TITLE, VALUE));
    expect(rest).toEqual([]);
    expect(found).toMatchObject({ severity: ERROR, kind: DIRECTIVE, line: 1 });
    expect(found.message).toContain(BOX);
    // A near-miss and not a nonsense word: the same line with the real token is read, and reports nothing.
    expect(run(view("ok", `${BOX} ${BARE}`, slot(TITLE)), pair(TITLE, VALUE))).toEqual([]);
  });

  it("names a tag the palette does not answer to", () => {
    expect(isTag(UNKNOWN)).toBe(false);
    const name = view("unknown-tag", tagMark(UNKNOWN) + VALUE);
    expect(run(name)).toMatchObject([{ severity: ERROR, kind: TAG, line: 1 }]);
  });

  it("blames the TEMPLATE and never the sample, though both reach the same output", () => {
    // The survivor is there, character for character, and it came from the block. A checker reading the output alone
    // would report the author's data back at them as their own bug.
    const name = view("echo", slot(TITLE));
    const carried = `${BOX} ${TYPO} ${tagMark(UNKNOWN)}`;
    expect(run(name, pair(TITLE, carried))).toEqual([]);
  });
});

describe("the engine's own refusal", () => {
  it("is carried word for word, and it ends the report", () => {
    const name = view("hungry", slot(TITLE));
    let thrown = "";
    try {
      renderView(name, {}, [dir], undefined, { width: WIDTH });
    } catch (e) {
      thrown = (e as Error).message;
    }
    expect(thrown).not.toBe("");
    expect(run(name)).toEqual([{ severity: ERROR, kind: REFUSAL, line: null, message: thrown }]);
  });

  it("answers for a view that resolves to no file at all", () => {
    expect(kinds(run("no-such-view"))).toEqual([REFUSAL]);
  });
});

describe("a field that arrived and was never read", () => {
  it("is a WARNING, since a view narrowing what it shows is a choice and not a fault", () => {
    const name = view("narrow", slot(TITLE));
    const findings = run(name, `${pair(TITLE, VALUE)}\n${pair(EXTRA, VALUE)}`);
    expect(findings).toMatchObject([{ severity: WARNING, kind: UNREAD, line: null }]);
    expect(findings[0].message).toContain(EXTRA);
    expect(failed(findings)).toBe(false);
  });
});

describe("what no verdict depends on", () => {
  it("reports the same with neither docs/ nor agent/ anywhere near it", () => {
    // `check` reads the engine and nothing written ABOUT it, so a stale catalogue or a deleted doc cannot move a
    // verdict. Run from a directory holding neither, against the same absolute views path.
    const name = view("elsewhere", `${BOX} ${TYPO}`, slot(TITLE));
    const block = pair(TITLE, VALUE);
    const here = process.cwd();
    const fromRepo = run(name, block);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-bare-"));
    try {
      process.chdir(empty);
      expect(fs.existsSync(path.join(empty, "docs"))).toBe(false);
      expect(fs.existsSync(path.join(empty, "agent"))).toBe(false);
      expect(run(name, block)).toEqual(fromRepo);
    } finally {
      process.chdir(here);
      fs.rmSync(empty, { recursive: true, force: true });
    }
    expect(kinds(fromRepo)).toEqual([DIRECTIVE]);
  });
});

describe("one finding on one line", () => {
  it("names the view, the line and the severity, in the shape a compiler has always printed", () => {
    const name = view("shaped", `${BOX} ${TYPO}`, slot(TITLE));
    const [found] = run(name, pair(TITLE, VALUE));
    expect(report(name, found)).toBe(`${name}:${found.line}: ${ERROR}: ${found.message}`);
    expect(report(name, { ...found, line: null })).toBe(`${name}: ${ERROR}: ${found.message}`);
  });
});
