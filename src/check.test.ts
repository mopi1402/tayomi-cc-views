// The checker, judged on what it must NOT say as much as on what it must.
//
// Its whole claim is that it needs no parser: it runs the engine and reads back what stands in the output. So the cases
// below pin the two ways that claim could be a lie. A survivor the SAMPLE DATA carried is not the template's fault, and
// each case here feeds one deliberately. And the engine's refusal is compared against the message the engine itself
// throws, captured in the same test, because a copy of that wording here would be free to drift from it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  DIRECTIVE,
  ERROR,
  REFUSAL,
  TAG,
  UNREAD,
  WARNING,
  check,
  checkAll,
  failed,
  report,
  takes,
  type Finding,
} from "./check.js";
import {
  BARE,
  BOX,
  EACH,
  END,
  FIELDS,
  FIELD_CONTENT,
  FIELD_FLOW,
  FIELD_LABEL,
  FIELD_ROWS,
  FIELD_TYPE,
  PAYLOAD_QUOTE,
  PAYLOAD_TABLE,
} from "./data/language.js";
import { NAME_MARK } from "./data/markup.js";
import { isTag, tagMark } from "./style.js";
import { bundledViewsDir, listViews, loadTemplate, viewFile } from "./template/load.js";
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

/** A sample as a MODEL writes it: the decorator line, then the payload, which is the whole of the second carrier. */
const decorated = (name: string, ...payload: string[]): string =>
  [`@{view:${name}}`, ...payload, ""].join("\n");
const EMPTY_HEADER = "| | |";
const DELIM = "| --- | --- |";

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

describe("a sample that arrives on the decorated carrier", () => {
  // The silence this closes: a decorated block is the ONLY carrier that names a payload shape, and the shape is what
  // render.ts refuses on. Checked as flat data the refusal can never fire, so a view broken for every decorated block
  // a model writes came back CLEAN, and shipped.

  it("carries the refusal when the shape handed over is not the one the view takes", () => {
    // A view spending `content` alone is asking for a quote (quote.view is exactly this), and a table is not one.
    const name = view("quoted", slot(FIELD_CONTENT));
    const findings = run(name, decorated(name, EMPTY_HEADER, DELIM, "| a | b |"));
    expect(findings).toMatchObject([{ severity: ERROR, kind: REFUSAL, line: null }]);
    // Both shapes: what arrived, and what this view promised to take. Either alone leaves the author guessing.
    expect(findings[0].message).toContain(PAYLOAD_TABLE);
    expect(findings[0].message).toContain(PAYLOAD_QUOTE);
  });

  it("reports nothing for a view handed the shape it does take", () => {
    const name = view(
      "rowed",
      `${FIELDS} ${FIELD_ROWS} ${FIELD_LABEL} ${FIELD_CONTENT}`,
      `${EACH} ${FIELD_ROWS}`,
      `  \${${FIELD_LABEL}} \${${FIELD_CONTENT}}`,
      END
    );
    expect(run(name, decorated(name, EMPTY_HEADER, DELIM, "| FIX | a thing |"))).toEqual([]);
  });

  it("names a payload that announced its shape and would not parse", () => {
    // A table missing its delimiter row: markdown's own rule, and the near-miss an author must see rather than find
    // as raw pipes on screen.
    const name = view("rowed-too", `${EACH} ${FIELD_ROWS}`, `  \${${FIELD_LABEL}}`, END);
    expect(kinds(run(name, decorated(name, EMPTY_HEADER, "| FIX | a thing |")))).toEqual([REFUSAL]);
  });

  it("refuses a sample that feeds some OTHER view, rather than checking that one instead", () => {
    // The hole this closes: a sample whose decorator names a different view drew that view, reported it clean, and
    // left the one under check untested behind a green gate. A sweep that skips a view silently is the very silence
    // this command exists to break, so a sample naming the wrong view is an error and never a pass.
    const checked = view("under-check", slot(TITLE));
    const other = view("some-other", slot(FIELD_CONTENT));
    const findings = run(checked, decorated(other, "> a quote"));
    expect(findings).toMatchObject([{ severity: ERROR }]);
    expect(findings[0].message).toContain(checked);
  });

  it("still reads a block with no decorator as the fenced carrier's flat data", () => {
    const name = view("plain", slot(TITLE));
    expect(run(name, pair(TITLE, VALUE))).toEqual([]);
  });
});

describe("every view this package ships, against the block a reader would write", () => {
  // The sweep that was missing. `check` existed and nothing ever ran it over a set of views, which is why a broken one
  // shipped and was caught by a parity test aimed at something else.
  const bundled = { viewsPath: [bundledViewsDir()], width: WIDTH };
  const gallery = fileURLToPath(new URL("../scripts/gallery", import.meta.url));
  const sampled = fs.readdirSync(gallery).map((f) => path.basename(f, ".md"));
  const takesPayload = listViews(bundledViewsDir()).filter(
    (name) => loadTemplate(name, [bundledViewsDir()]).payload !== null
  );

  it("has a sample for every view that takes one, or the sweep below checks nothing", () => {
    // The teeth: a view added with no sample would otherwise join the tree unchecked, which is the hole this closes.
    expect([...takesPayload].sort()).toEqual([...sampled].sort());
  });

  it("draws every one of them, through the same sweep a consumer runs on their own views", () => {
    // checkAll and not a loop written here: what gates this package must be what it hands anyone else, or the two
    // drift and the one nobody runs is the one that breaks.
    const swept = checkAll(gallery, bundled);
    expect(swept.map((s) => s.name).sort()).toEqual([...sampled].sort());
    expect(swept.filter((s) => s.findings.length)).toEqual([]);
  });
});

describe("a whole set of views swept in one run", () => {
  // What a CONSUMER needs and had to hand-roll: `check` judged one view, so gating a repo's views meant a shell loop
  // per repo. The convention is the one this package already lives by, a sample named after the view it feeds.
  const swept = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-sweep-"));
  afterAll(() => fs.rmSync(swept, { recursive: true, force: true }));
  const sampleFor = (name: string, ...payload: string[]): void =>
    fs.writeFileSync(path.join(swept, `${name}.md`), decorated(name, ...payload));
  const TABLE = [EMPTY_HEADER, DELIM, "| FIX | a thing |"];

  it("checks each sample against the view it names, and answers for every one", () => {
    const drawn = view(
      "swept-ok",
      `${FIELDS} ${FIELD_ROWS} ${FIELD_LABEL} ${FIELD_CONTENT}`,
      `${EACH} ${FIELD_ROWS}`,
      `  \${${FIELD_LABEL}} \${${FIELD_CONTENT}}`,
      END
    );
    const broken = view("swept-broken", slot(FIELD_CONTENT));
    sampleFor(drawn, ...TABLE);
    sampleFor(broken, ...TABLE);
    const swept_ = checkAll(swept, { viewsPath: [dir], width: WIDTH });
    expect(swept_.map((r) => r.name).sort()).toEqual([drawn, broken].sort());
    expect(swept_.find((r) => r.name === drawn)?.findings).toEqual([]);
    expect(kinds(swept_.find((r) => r.name === broken)!.findings)).toEqual([REFUSAL]);
  });

  it("reports a sample naming a view that resolves nowhere, rather than passing over it", () => {
    const alone = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-sweep-lost-"));
    fs.writeFileSync(path.join(alone, "no-such-view.md"), decorated("no-such-view", EMPTY_HEADER));
    const [only, ...rest] = checkAll(alone, { viewsPath: [dir], width: WIDTH });
    expect(rest).toEqual([]);
    expect(kinds(only.findings)).toEqual([REFUSAL]);
    fs.rmSync(alone, { recursive: true, force: true });
  });

  it("answers nothing for a directory holding no sample, which is not a pass to report as one", () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-sweep-bare-"));
    expect(checkAll(bare, { viewsPath: [dir], width: WIDTH })).toEqual([]);
    fs.rmSync(bare, { recursive: true, force: true });
  });

  it("leaves no view unchecked when its sample names another, which a green gate would hide", () => {
    const named = view("swept-named", slot(TITLE));
    view("swept-elsewhere", slot(FIELD_CONTENT));
    fs.writeFileSync(
      path.join(swept, `${named}.md`),
      decorated("swept-elsewhere", "> drawn, but not the view this file is named for")
    );
    const found = checkAll(swept, { viewsPath: [dir], width: WIDTH }).find((s) => s.name === named);
    expect(failed(found!.findings)).toBe(true);
  });

  it("throws on a directory it cannot read, which a gate must never take for an empty one", () => {
    // The two are one keystroke apart and worlds apart in meaning: a path that does not exist is a gate aimed at
    // nothing, and answering it with the empty list would report green forever.
    expect(() => checkAll(path.join(swept, "no-such-dir"))).toThrow();
  });
});

describe("the shape a view resolved to", () => {
  // A template never DECLARES its payload, it is scored into one. So the author is the one person who cannot see the
  // answer for their own file, and finds out only when every real block falls open on screen. The value has always
  // existed and the catalogue has always published it; what was missing is reading it here.
  const said = (name: string): string | null => takes(name, { viewsPath: [dir], width: WIDTH });

  it("names the table a sectioned view is asking for", () => {
    const name = view("sections", `${slot("said")}`, slot("next"));
    expect(said(name)).toContain(PAYLOAD_TABLE);
  });

  it("names the quote a one-band view is asking for", () => {
    const name = view("band", slot(FIELD_CONTENT));
    expect(said(name)).toContain(PAYLOAD_QUOTE);
  });

  it("says a static view asks for none, which is not the same as an unanswered question", () => {
    const line = said(view("furniture", VALUE));
    expect(line).not.toBeNull();
    expect(line).not.toContain(PAYLOAD_TABLE);
    expect(line).not.toContain(PAYLOAD_QUOTE);
  });

  it("answers nothing for a view that resolves to no file, which check itself reports", () => {
    expect(said("no-such-view")).toBeNull();
    expect(kinds(run("no-such-view"))).toEqual([REFUSAL]);
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

  it("says nothing of a body the view read under its OTHER name, the two being one text", () => {
    // banner.view's own shape: it spends `flow`, the same body with its breaks spent as spaces. A sample carrying
    // `content` was accused of dropping a text the view had drawn, on a view this package ships.
    expect(run(view("band", slot(FIELD_FLOW)), pair(FIELD_CONTENT, VALUE))).toEqual([]);
  });

  it("still says it of a field that body reads under NEITHER name", () => {
    const name = view("band-too", slot(FIELD_FLOW));
    expect(kinds(run(name, `${pair(FIELD_CONTENT, VALUE)}\n${pair(EXTRA, VALUE)}`))).toEqual([
      UNREAD,
    ]);
  });

  it("reports it on a DECORATED sample too, the form an author is now told to run", () => {
    // The carrier records no trace of what it read, so this reading was missing on the very path the skill sends
    // authors to: a view never drawing `type` drops the marker, and the verdict came back green.
    const name = view("marked", slot(FIELD_CONTENT));
    const findings = run(name, decorated(name, "> [!WARNING]", "> the base is read only"));
    expect(findings).toMatchObject([{ severity: WARNING, kind: UNREAD }]);
    expect(findings[0].message).toContain(FIELD_TYPE);
  });

  it("reads the same on both carriers, which is what stops the two drifting apart again", () => {
    const name = view("parity", slot(FIELD_CONTENT));
    expect(kinds(run(name, decorated(name, "> [!WARNING]", "> the base is read only")))).toEqual(
      kinds(run(name, `${pair(FIELD_CONTENT, VALUE)}\n${pair(FIELD_TYPE, "warning")}`))
    );
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
