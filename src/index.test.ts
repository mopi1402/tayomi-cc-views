// The PUBLIC surface against a FAKE host and explicit options: what any adopter
// gets without TAYOMI anywhere. Everything is imported through the barrel, so an
// export dropped from index.ts fails here before it fails in a consumer. The
// TAYOMI wiring (its views, its injection, its strict view) is covered by the
// integration suite in plugins/core, not here.

import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  transform,
  slice,
  renderView,
  loadTemplate,
  extendTags,
  isTag,
  displayWidth,
  defaultViewsPath,
  bundledViewsDir,
  VIEWS_PATH_ENV,
  ANSI_RE,
  renderTags,
  tagMark,
  type DisplayHost,
} from "./index.js";
import { BOX, EACH, END, ENDBOX, HEAD, TONE } from "./data/language.js";
import { BLOCK_HINT, FENCE, SCRATCH_DIR, VIEWS_DIR, VIEW_EXT } from "./data/markup.js";
import { hasControlMark } from "./data/marks.js";

const stripAnsi = (s: string): string => s.replace(ANSI_RE, "");
// A fenced block, spelled by the engine's own carrier rather than retyped here: a
// test that hard-codes the fence stops proving anything the day the carrier moves.
const fenced = (name: string, ...body: string[]): string =>
  [BLOCK_HINT + name, ...body, FENCE].join("\n");
// What a tag PRINTS AS, asked of the engine by name. An escape pasted here would be
// a second copy of a palette this module cannot see, unreadable and free to drift.
const seq = (name: string): string => renderTags(tagMark(name));
// A sequence the palette does NOT carry, for every registration test. The one escape
// written out, because its whole purpose is to be a value the engine does not own.
const MAGENTA = "\x1b[35m";
const NOTE = "note";
const NOTE_FILE = NOTE + VIEW_EXT;
// The frame's own glyphs, spelled here because box.ts keeps them PRIVATE: they are its
// alone to choose, and this only needs to tell a framed line from any other.
const FRAME_EDGE_RE = /^[╭│╰]/;
/** What the loader says when it is handed nowhere to look. */
const EMPTY_PATH_RE = /search path is empty/;
const frameLines = (out: string): string[] =>
  stripAnsi(out)
    .split("\n")
    .filter((l) => FRAME_EDGE_RE.test(l));

// A minimal view of its own, so nothing here depends on a host's template library.
const NOTE_VIEW = [
  BOX,
  `${HEAD} {{box_title}}NOTE{{/}}`,
  `${EACH} note bullet="- "`,
  " ${#bullet}${.}",
  END,
  ENDBOX,
  "",
].join("\n");

// A view spending the TONE SLOT. The fenced block carries no attributes, so its own
// `tone` field is the way in: one template, whatever colour the block asks for.
const TONED = "toned";
const TONED_FILE = TONED + VIEW_EXT;
const TONED_VIEW = [`${TONE} key`, `${EACH} note`, " {{tone}}${.}{{/}}", END, ""].join("\n");
// The class the toned tests ask for, and what it prints as.
const WARN = "warn";
const WARN_SEQ = seq(WARN);

// Created at module scope, not in beforeAll: describe bodies run at collection,
// so a `const options = { viewsPath: [builtins] }` written there would capture
// undefined if the dirs were only assigned once the hooks fire.
const builtins = fs.mkdtempSync(path.join(os.tmpdir(), `${SCRATCH_DIR}-builtin-`));
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), `${SCRATCH_DIR}-consumer-`));
fs.writeFileSync(path.join(builtins, NOTE_FILE), NOTE_VIEW);
fs.writeFileSync(path.join(builtins, TONED_FILE), TONED_VIEW);

afterAll(() => {
  fs.rmSync(builtins, { recursive: true, force: true });
  fs.rmSync(consumer, { recursive: true, force: true });
});

describe("the zero-config path", () => {
  it("leaves a message without engine business to the host", () => {
    expect(slice("", "plain prose, no markup at all")).toBeNull();
  });

  // Only a template writes presentation. `b` bolds inside a view, `no_such_tag` is
  // in no palette; in prose the two are indistinguishable, and that is the guarantee.
  it("leaves markup written in PROSE inert, a known name exactly like an unknown one", () => {
    const known = "a {{b}}bold{{/}} word";
    const unknown = "literal {{no_such_tag}} stays";
    expect(transform(known)).toBe(known);
    expect(transform(unknown)).toBe(unknown);
  });

  it("hands a message that merely MENTIONS a tag back to the host, markdown intact", () => {
    expect(slice("", "the {{warn}} tag opens a colour")).toBeNull();
  });
});

describe("rendering through explicit options", () => {
  const options = { viewsPath: [builtins], width: 100 };

  it("renders a view block found on the search path", () => {
    const out = transform(
      fenced(NOTE, "note:", "- first", "- second"),
      undefined,
      true,
      undefined,
      options
    );
    const plain = stripAnsi(out);
    expect(plain).toContain("NOTE");
    expect(plain).toContain("- first");
    expect(plain).not.toContain(FENCE);
  });

  it("fails open to the raw block when the view exists nowhere on the path", () => {
    const msg = fenced("absent", "note:", "- kept");
    expect(transform(msg, undefined, true, undefined, options)).toBe(msg);
  });

  it("lets a consumer dir shadow a built-in by naming the same view first", () => {
    fs.writeFileSync(
      path.join(consumer, NOTE_FILE),
      NOTE_VIEW.replace("NOTE", "MINE")
    );
    const block = fenced(NOTE, "note:", "- x");
    const shadowed = transform(block, undefined, true, undefined, {
      ...options,
      viewsPath: [consumer, builtins],
    });
    expect(stripAnsi(shadowed)).toContain("MINE");
    // Same path the other way round: the built-in wins, shadowing is pure order.
    const upstream = transform(block, undefined, true, undefined, {
      ...options,
      viewsPath: [builtins, consumer],
    });
    expect(stripAnsi(upstream)).toContain("NOTE");
  });

  it("takes the tone from a fenced block's own field, one template in two colours", () => {
    const block = (...fields: string[]): string => fenced(TONED, ...fields, "note:", "- row");
    const neutral = transform(block(), undefined, true, undefined, options);
    const warned = transform(block(`tone: ${WARN}`), undefined, true, undefined, options);
    expect(warned).toContain(WARN_SEQ);
    expect(neutral).not.toContain(WARN_SEQ);
    // The field dresses the view without ever printing itself.
    expect(stripAnsi(warned)).toBe(stripAnsi(neutral));
  });

  // One item of the note view, the way a MESSAGE supplies it.
  const noteBlock = (item: string): string => fenced(NOTE, "note:", `- ${item}`);
  // A span the model wrote itself, around a tag the palette DOES know, so the engine
  // has every reason to resolve it and must not.
  const span = (tag: string, text: string): string => tagMark(tag) + text + tagMark("/");
  const FAIL_SPAN = span("fail", "not red");
  const WITNESS = "x";
  // The frame width of the note view around one value. Frame lines agreeing with
  // EACH OTHER proves nothing (markup consumed as zero-width shrinks the whole box
  // and it stays square), so every caller compares against a witness of the same
  // printed length that carries no markup.
  const box = (value: string): number => {
    const out = transform(noteBlock(value), undefined, true, undefined, options);
    const widths = new Set(frameLines(out).map((l) => [...l].length));
    expect(widths.size).toBe(1); // square before it is comparable
    return [...widths][0];
  };
  const asWide = (value: string): number => box(WITNESS.repeat(value.length));

  it("leaves markup written in a block's DATA inert", () => {
    const out = transform(noteBlock(FAIL_SPAN), undefined, true, undefined, options);
    expect(stripAnsi(out)).toContain(FAIL_SPAN);
    expect(out).not.toContain(seq("fail")); // the tag never opened its colour
    expect(hasControlMark(out)).toBe(false);
  });

  it("MEASURES that inert markup as the text it is, against a witness of equal length", () => {
    // The engine that resolved the data's tags drew this box 14 wide against 27.
    expect(box(FAIL_SPAN)).toBe(asWide(FAIL_SPAN));
  });

  it("measures a value that merely LOOKS like a control mark as the text it is", () => {
    // A reserved mark must be a real control, never a spelling: RULE_MARK was the
    // six ASCII characters below until 2026-08-01, and printedWidth stripped that
    // text wherever it appeared, so a value carrying it measured six columns short
    // and pulled the frame open. Data may type any text; only a control is reserved.
    const looksLikeAMark = String.raw`\u0000`;
    expect(box(looksLikeAMark)).toBe(asWide(looksLikeAMark));
  });

  it("keeps the TEMPLATE's own tags working beside inert data", () => {
    const written = span("b", "x");
    const out = transform(noteBlock(written), undefined, true, undefined, options);
    expect(out).toContain(seq("box_title")); // @head's tag, written by the template
    expect(stripAnsi(out)).toContain(written); // the data's, written by the message
  });

  it("refuses an empty search path with a named error", () => {
    // The wording is asserted deliberately, not shared with load.ts: an operator reads
    // this line to know WHAT went wrong, so rewording it silently is the regression.
    expect(() => loadTemplate(NOTE, [])).toThrow(EMPTY_PATH_RE);
  });

  it("injects the fake host's fields into the view's scope", () => {
    const injected = "injected instead";
    const host: DisplayHost = {
      inject: (view) => (view === NOTE ? { note: [injected] } : undefined),
    };
    const out = transform(fenced(NOTE, "note:", "- written"), host, true, undefined, options);
    expect(stripAnsi(out)).toContain(injected);
    expect(stripAnsi(out)).not.toContain("written");
  });

  it("replaces the strict view's failure with the host's line, and reports once on final", () => {
    const reports: boolean[] = [];
    const host: DisplayHost = {
      strict: { view: NOTE, failedLine: "{{dim}}note failed{{/}}" },
      onRendered: (ok) => reports.push(ok),
    };
    // A block whose body parses to zero fields throws inside renderView.
    const out = transform(fenced(NOTE, "not a field line"), host, true, undefined, options);
    expect(stripAnsi(out)).toContain("note failed");
    expect(stripAnsi(out)).not.toContain("not a field line");
    expect(reports).toEqual([false]);
  });
});

describe("the width option", () => {
  // A token wider than the column hard-splits at exactly the column, so the frame
  // prints at exactly the ceiling: an equality a word-boundary wrap cannot promise.
  const LONG_TOKEN = "x".repeat(80);
  const DATA = `note:\n- ${LONG_TOKEN}\n`;

  it("takes a number as the forced ceiling", () => {
    const out = renderView(NOTE, DATA, builtins, undefined, {
      width: 50,
    });
    const lines = frameLines(out);
    expect(lines.length).toBeGreaterThan(4); // it wrapped
    for (const l of lines) expect(displayWidth(l)).toBe(50);
  });

  it("takes a function as the width source, treated like probed columns", () => {
    const out = renderView(NOTE, DATA, builtins, undefined, {
      width: () => 64,
    });
    // Probed columns lose the 4-column margin: the ceiling is 60.
    for (const l of frameLines(out)) expect(displayWidth(l)).toBe(60);
  });
});

describe("the default views path", () => {
  // The order IS the override contract: an explicit dir beats the project's
  // views/, which beats whatever ships with the plugin. Same-name wins earlier.
  it("orders env dirs, then the project's views/, then the plugin resolution", () => {
    const a = path.join(os.tmpdir(), `${SCRATCH_DIR}-env-a`);
    const b = path.join(os.tmpdir(), `${SCRATCH_DIR}-env-b`);
    // The length-4 assertion holds only without an ambient plugin root: isolate it.
    const prev = process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    process.env[VIEWS_PATH_ENV] = [a, b].join(path.delimiter);
    try {
      const dirs = defaultViewsPath();
      expect(dirs.slice(0, 3)).toEqual([a, b, path.join(process.cwd(), VIEWS_DIR)]);
      expect(dirs).toHaveLength(4);
    } finally {
      delete process.env[VIEWS_PATH_ENV];
      if (prev !== undefined) process.env.CLAUDE_PLUGIN_ROOT = prev;
    }
  });

  it("starts at the project's views/ when nothing is configured", () => {
    expect(defaultViewsPath()[0]).toBe(path.join(process.cwd(), VIEWS_DIR));
  });

  // The bundled dir closes the path even when a plugin root would otherwise be
  // the final word: `welcome` is the health check, it must resolve EVERYWHERE.
  it("closes with the package's bundled views, even under a plugin root", () => {
    const prev = process.env.CLAUDE_PLUGIN_ROOT;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `${SCRATCH_DIR}-plugin-`));
    process.env.CLAUDE_PLUGIN_ROOT = root;
    try {
      const dirs = defaultViewsPath();
      expect(dirs[dirs.length - 2]).toBe(path.join(root, "views"));
      expect(dirs[dirs.length - 1]).toBe(bundledViewsDir());
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
      else process.env.CLAUDE_PLUGIN_ROOT = prev;
    }
  });

  it("resolves welcome with zero options under a plugin that does not carry it", () => {
    const prev = process.env.CLAUDE_PLUGIN_ROOT;
    process.env.CLAUDE_PLUGIN_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), `${SCRATCH_DIR}-plugin-`));
    try {
      const out = transform(
        "```view:welcome\ntitle: Welcome!\nmessage: the hook is wired\n```",
        undefined,
        true
      );
      expect(stripAnsi(out)).toContain("the hook is wired");
      expect(stripAnsi(out)).not.toContain("```");
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
      else process.env.CLAUDE_PLUGIN_ROOT = prev;
    }
  });

  it("renders through a CC_VIEWS_PATH dir with zero options", () => {
    process.env[VIEWS_PATH_ENV] = builtins;
    try {
      const out = transform(fenced(NOTE, "note:", "- via env"), undefined, true);
      expect(stripAnsi(out)).toContain("- via env");
      expect(stripAnsi(out)).not.toContain("```");
    } finally {
      delete process.env[VIEWS_PATH_ENV];
    }
  });
});

describe("the palette registry", () => {
  // Through a TEMPLATE, the only place a tag resolves: the toned view's slot spends
  // the registered name, which is what a host actually gets.
  const options = { viewsPath: [builtins], width: 100 };
  const toned = (tone: string): string =>
    transform(`\`\`\`view:toned\ntone: ${tone}\nnote:\n- x\n\`\`\``, undefined, true, undefined, options);

  // A name the engine does NOT carry, and one it does: registering the first adds,
  // registering the second shadows, and the report must tell them apart.
  const ADDED = "engine_test_tone";
  const SHADOWED = "dim";
  const UNNAMEABLE = "not ok"; // the {{tag}} shape takes \w+ only

  it("renders a registered tag and measures it as zero columns", () => {
    extendTags({ [ADDED]: MAGENTA });
    const out = toned(ADDED);
    expect(out).toContain(MAGENTA);
    expect(stripAnsi(out)).toContain("x");
  });

  it("is idempotent on an identical re-registration", () => {
    const report = extendTags({ [ADDED]: MAGENTA });
    expect(report.shadowed).toEqual([]);
    expect(report.skipped).toEqual([]);
  });

  it("lets a host shadow any tag, last registration winning, and reports it", () => {
    const builtin = seq(SHADOWED); // read BEFORE the shadow, to hand the name back
    expect(extendTags({ [SHADOWED]: MAGENTA }).shadowed).toEqual([SHADOWED]);
    expect(toned(SHADOWED)).toContain(MAGENTA);
    // The same law hands the name back: the palette is restored for the suite.
    expect(extendTags({ [SHADOWED]: builtin }).shadowed).toEqual([SHADOWED]);
    const back = toned(SHADOWED);
    expect(back).toContain(builtin);
    expect(back).not.toContain(MAGENTA);
  });

  it("skips a name the {{tag}} shape cannot carry, reported, never thrown", () => {
    const report = extendTags({ [UNNAMEABLE]: MAGENTA });
    expect(report.skipped).toEqual([UNNAMEABLE]);
    expect(isTag(UNNAMEABLE)).toBe(false);
  });
});
