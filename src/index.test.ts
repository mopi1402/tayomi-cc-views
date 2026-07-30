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
  displayWidth,
  defaultViewsPath,
  VIEWS_PATH_ENV,
  ANSI_RE,
  type DisplayHost,
} from "./index.js";

const stripAnsi = (s: string): string => s.replace(ANSI_RE, "");
// A sequence the palette does NOT carry, for every registration test.
const MAGENTA = "\x1b[35m";
const NOTE_FILE = "note.view";
const frameLines = (out: string): string[] =>
  stripAnsi(out)
    .split("\n")
    .filter((l) => /^[╭│╰]/.test(l));

// A minimal view of its own, so nothing here depends on a host's template library.
const NOTE_VIEW = [
  "@box",
  "@head {{box_title}}NOTE{{/}}",
  '@each note bullet="- "',
  " ${#bullet}${.}",
  "@end",
  "@endbox",
  "",
].join("\n");

// Created at module scope, not in beforeAll: describe bodies run at collection,
// so a `const options = { viewsPath: [builtins] }` written there would capture
// undefined if the dirs were only assigned once the hooks fire.
const builtins = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-builtin-"));
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-consumer-"));
fs.writeFileSync(path.join(builtins, NOTE_FILE), NOTE_VIEW);

afterAll(() => {
  fs.rmSync(builtins, { recursive: true, force: true });
  fs.rmSync(consumer, { recursive: true, force: true });
});

describe("the zero-config path", () => {
  it("renders inline markup with no options and no registration", () => {
    expect(transform("a {{b}}bold{{/}} word")).toBe("a \x1b[1mbold\x1b[0m word");
  });

  it("leaves a message without engine business to the host", () => {
    expect(slice("", "plain prose, no markup at all")).toBeNull();
  });

  it("leaves an unknown tag on screen verbatim", () => {
    const prose = "literal {{no_such_tag}} stays";
    expect(transform(prose)).toBe(prose);
  });
});

describe("rendering through explicit options", () => {
  const options = { viewsPath: [builtins], width: 100 };

  it("renders a view block found on the search path", () => {
    const out = transform("```view:note\nnote:\n- first\n- second\n```", undefined, true, undefined, options);
    const plain = stripAnsi(out);
    expect(plain).toContain("NOTE");
    expect(plain).toContain("- first");
    expect(plain).not.toContain("```");
  });

  it("fails open to the raw block when the view exists nowhere on the path", () => {
    const msg = "```view:absent\nnote:\n- kept\n```";
    expect(transform(msg, undefined, true, undefined, options)).toBe(msg);
  });

  it("lets a consumer dir shadow a built-in by naming the same view first", () => {
    fs.writeFileSync(
      path.join(consumer, NOTE_FILE),
      NOTE_VIEW.replace("NOTE", "MINE")
    );
    const block = "```view:note\nnote:\n- x\n```";
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

  it("refuses an empty search path with a named error", () => {
    expect(() => loadTemplate("note", [])).toThrow(/search path is empty/);
  });

  it("injects the fake host's fields into the view's scope", () => {
    const injected = "injected instead";
    const host: DisplayHost = {
      inject: (view) => (view === "note" ? { note: [injected] } : undefined),
    };
    const out = transform("```view:note\nnote:\n- written\n```", host, true, undefined, options);
    expect(stripAnsi(out)).toContain(injected);
    expect(stripAnsi(out)).not.toContain("written");
  });

  it("replaces the strict view's failure with the host's line, and reports once on final", () => {
    const reports: boolean[] = [];
    const host: DisplayHost = {
      strict: { view: "note", failedLine: "{{dim}}note failed{{/}}" },
      onRendered: (ok) => reports.push(ok),
    };
    // A block whose body parses to zero fields throws inside renderView.
    const out = transform("```view:note\nnot a field line\n```", host, true, undefined, options);
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
    const out = renderView("note", DATA, builtins, undefined, {
      width: 50,
    });
    const lines = frameLines(out);
    expect(lines.length).toBeGreaterThan(4); // it wrapped
    for (const l of lines) expect(displayWidth(l)).toBe(50);
  });

  it("takes a function as the width source, treated like probed columns", () => {
    const out = renderView("note", DATA, builtins, undefined, {
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
    const a = path.join(os.tmpdir(), "cc-views-env-a");
    const b = path.join(os.tmpdir(), "cc-views-env-b");
    process.env[VIEWS_PATH_ENV] = [a, b].join(path.delimiter);
    try {
      const dirs = defaultViewsPath();
      expect(dirs.slice(0, 3)).toEqual([a, b, path.join(process.cwd(), "views")]);
      expect(dirs).toHaveLength(4);
    } finally {
      delete process.env[VIEWS_PATH_ENV];
    }
  });

  it("starts at the project's views/ when nothing is configured", () => {
    expect(defaultViewsPath()[0]).toBe(path.join(process.cwd(), "views"));
  });

  it("renders through a CC_VIEWS_PATH dir with zero options", () => {
    process.env[VIEWS_PATH_ENV] = builtins;
    try {
      const out = transform("```view:note\nnote:\n- via env\n```", undefined, true);
      expect(stripAnsi(out)).toContain("- via env");
      expect(stripAnsi(out)).not.toContain("```");
    } finally {
      delete process.env[VIEWS_PATH_ENV];
    }
  });
});

describe("the palette registry", () => {
  it("renders a registered tag and measures it as zero columns", () => {
    extendTags({ engine_test_tone: MAGENTA });
    expect(transform("{{engine_test_tone}}x{{/}}")).toBe(`${MAGENTA}x\x1b[0m`);
  });

  it("is idempotent on an identical re-registration", () => {
    expect(() => extendTags({ engine_test_tone: MAGENTA })).not.toThrow();
  });

  it("throws on redefining an existing tag, built-in or registered", () => {
    expect(() => extendTags({ dim: MAGENTA })).toThrow(/already defined/);
    expect(() => extendTags({ engine_test_tone: "\x1b[36m" })).toThrow(/already defined/);
  });

  it("rejects a name the {{tag}} shape cannot carry", () => {
    expect(() => extendTags({ "not ok": MAGENTA })).toThrow(/shape/);
  });
});
