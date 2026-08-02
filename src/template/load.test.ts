// Where a template comes from: an ORDERED search path, first hit wins.
//
// The order IS the override contract, so it is asserted rather than assumed. A project
// that names a view the engine also ships must win, or an adopter can never redress a
// standard view; and a TYPE must never outrank the path, or the same reasoning breaks
// one level down.

import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VIEWS_DIR, VIEW_EXT } from "../data/markup.js";
import { bundledViewsDir, defaultViewsPath, loadTemplate, viewsDir } from "./load.js";

const NAME = "probe";
const TYPE = "warning";
/** The health check the package ships, which must resolve wherever the engine runs. */
const BUNDLED = "welcome";
/** Read from the manifest rather than retyped, since drift is the thing being gated. */
const OWN_NAME = (
  JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    name: string;
  }
).name;

const dirs: string[] = [];
const mkdir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-load-"));
  dirs.push(dir);
  return dir;
};
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const write = (dir: string, file: string, body: string): void =>
  fs.writeFileSync(path.join(dir, file), body);

describe("loadTemplate", () => {
  it("reads a view and hands back its parsed template", () => {
    const dir = mkdir();
    write(dir, NAME + VIEW_EXT, "the body");
    expect(loadTemplate(NAME, dir).body).toEqual(["the body"]);
  });

  it("accepts a single dir as well as a list, so a caller need not wrap one", () => {
    const dir = mkdir();
    write(dir, NAME + VIEW_EXT, "one");
    expect(loadTemplate(NAME, dir).body).toEqual(loadTemplate(NAME, [dir]).body);
  });

  it("takes the FIRST dir that has it: an earlier dir shadows a later one", () => {
    const early = mkdir();
    const late = mkdir();
    write(early, NAME + VIEW_EXT, "early");
    write(late, NAME + VIEW_EXT, "late");
    expect(loadTemplate(NAME, [early, late]).body).toEqual(["early"]);
  });

  it("walks past a dir that does not have it", () => {
    const empty = mkdir();
    const has = mkdir();
    write(has, NAME + VIEW_EXT, "found");
    expect(loadTemplate(NAME, [empty, has]).body).toEqual(["found"]);
  });

  it("refuses an empty search path with an error naming the view", () => {
    expect(() => loadTemplate(NAME, [])).toThrow(NAME);
  });

  it("throws with a real path when the view resolves nowhere, never silently", () => {
    const dir = mkdir();
    expect(() => loadTemplate("absent", [dir])).toThrow(dir);
  });
});

describe("a typed view", () => {
  it("beats the plain form inside ONE dir", () => {
    const dir = mkdir();
    write(dir, NAME + VIEW_EXT, "plain");
    write(dir, `${NAME}.${TYPE}${VIEW_EXT}`, "typed");
    expect(loadTemplate(NAME, dir, TYPE).body).toEqual(["typed"]);
  });

  it("falls back to the plain form when no typed file exists", () => {
    const dir = mkdir();
    write(dir, NAME + VIEW_EXT, "plain");
    expect(loadTemplate(NAME, dir, "no_such_type").body).toEqual(["plain"]);
  });

  it("does NOT outrank path order: an earlier plain form beats a later typed one", () => {
    const early = mkdir();
    const late = mkdir();
    write(early, NAME + VIEW_EXT, "early plain");
    write(late, `${NAME}.${TYPE}${VIEW_EXT}`, "late typed");
    expect(loadTemplate(NAME, [early, late], TYPE).body).toEqual(["early plain"]);
  });

  it("is still found in the LAST dir, which is read without an existence check", () => {
    const dir = mkdir();
    write(dir, `${NAME}.${TYPE}${VIEW_EXT}`, "typed");
    expect(loadTemplate(NAME, [dir], TYPE).body).toEqual(["typed"]);
  });
});

describe("the default search path", () => {
  it("ends on the package's own views, so the bundled health check always resolves", () => {
    const search = defaultViewsPath();
    expect(search[search.length - 1]).toBe(bundledViewsDir());
    expect(() => loadTemplate(BUNDLED, search)).not.toThrow();
  });

  it("puts the project's own views/ ahead of them, so a project can shadow one", () => {
    const search = defaultViewsPath();
    const project = search.indexOf(path.join(process.cwd(), VIEWS_DIR));
    expect(project).toBeGreaterThanOrEqual(0);
    expect(project).toBeLessThan(search.length - 1);
  });

  it("resolves the bundled dir to somewhere that actually holds the health check", () => {
    expect(fs.existsSync(path.join(bundledViewsDir(), BUNDLED + VIEW_EXT))).toBe(true);
  });

  // The defect this pins: the dir is found by walking UPWARDS, and a host that bundles
  // the engine has its own views/ one hop above the bundle. Claiming it made the engine
  // serve the host's templates as its own, silently, which is what a `cp` into the
  // host's tree was papering over. Whatever comes back, the manifest beside it must
  // name US. This also gates the package name the resolution is spelled with: a name
  // that no longer matches the manifest makes every candidate fail the check, and the
  // dir handed back then holds no manifest at all.
  it("answers with a dir belonging to THIS package, never one it merely found above", () => {
    const parent = path.dirname(bundledViewsDir());
    const manifest: unknown = JSON.parse(fs.readFileSync(path.join(parent, "package.json"), "utf8"));
    expect((manifest as { name?: unknown }).name).toBe(OWN_NAME);
  });

  it("names a plugin's own views dir when the host sets its root", () => {
    const root = mkdir();
    const before = process.env.CLAUDE_PLUGIN_ROOT;
    process.env.CLAUDE_PLUGIN_ROOT = root;
    try {
      expect(viewsDir()).toBe(path.join(root, VIEWS_DIR));
    } finally {
      if (before == null) delete process.env.CLAUDE_PLUGIN_ROOT;
      else process.env.CLAUDE_PLUGIN_ROOT = before;
    }
  });
});
