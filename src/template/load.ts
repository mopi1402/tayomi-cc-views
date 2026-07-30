// Where a template comes from.
//
// Kept apart from parse.ts so the parser stays disk-free: a template can be parsed
// from a string in a test, and this module is the only place that knows a .view is a
// file at all, which makes it the single place a decorator's type resolves to a
// template file.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseTemplate, type Template } from "./parse.js";

// The directory a host's templates live under, wherever the root comes from.
const VIEWS_DIR = "views";

// Inside a plugin hook the views ship beside the bundle and CLAUDE_PLUGIN_ROOT is
// always set by the host, so that path is authoritative.
//
// The fallback covers the two runs that have no plugin root: the test suite (from
// the source tree) and a hand-run of the repo's own dist/ (the documented way to
// exercise a build without releasing it). Those two sit at DIFFERENT depths under
// the plugin root, so the fallback searches upwards instead of counting hops.
// Counting is what used to work only by coincidence, back when this module was one
// level under the plugin root exactly like the bundle it compiles to.
export function viewsDir(): string {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  if (root) return path.join(root, VIEWS_DIR);
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < 5; hop++) {
    const candidate = path.join(dir, VIEWS_DIR);
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  // Nothing found: return the shallowest guess so the read that follows fails with
  // a path a human can act on, which the caller turns into the raw block on screen.
  return path.join(dir, VIEWS_DIR);
}

/** The env var naming extra template dirs for the DEFAULT search path, PATH-like. */
export const VIEWS_PATH_ENV = "CC_VIEWS_PATH";

// The DEFAULT search path, used when a caller passes no viewsPath: the adopter's
// explicit dirs first (CC_VIEWS_PATH, split like PATH), then the project's own
// views/ (the platform runs hooks with cwd at the project root), then the plugin
// resolution above. First hit wins, so a project template that names a standard
// view OVERRIDES it: the order is the override contract, not an accident
// (author's decision, 2026-07-31, when the quickstart run against an installed
// copy proved the module-relative fallback can never see a project's views/).
export function defaultViewsPath(): string[] {
  const configured = process.env[VIEWS_PATH_ENV] ?? "";
  const dirs = configured.split(path.delimiter).filter((dir) => dir !== "");
  return [...dirs, path.join(process.cwd(), VIEWS_DIR), viewsDir()];
}

// An ORDERED search path, first hit wins: a consumer that lists its own dir before
// the built-ins shadows a built-in view by simply naming a file the same. The LAST
// dir is read unconditionally rather than existence-checked, so a view found nowhere
// fails with a real path a human can act on (which the caller turns into the raw
// block on screen).
//
// A TYPE resolves here too, as a file: within ONE dir, `<name>.<type>.view` beats
// `<name>.view`, and PATH ORDER outranks that specificity (a dir earlier on the
// path wins with its default over a later dir's typed form). The path is the
// consumer's authority axis, and phase 2's shadowing contract must keep holding
// with a type in play: whoever owns the earlier dir owns the view's look, whole.
// An unknown type therefore lands on the default form, never on an error: a
// semantic name the template does not know is still true information, and sound
// content is not undressed for a naming slip.
export function loadTemplate(
  name: string,
  dirs: string | string[] = viewsDir(),
  type?: string
): Template {
  const list = Array.isArray(dirs) ? dirs : [dirs];
  if (list.length === 0) throw new Error(`view ${name}: the views search path is empty`);
  for (const dir of list.slice(0, -1)) {
    for (const file of candidateFiles(name, type)) {
      const candidate = path.join(dir, file);
      if (fs.existsSync(candidate)) return parseTemplate(fs.readFileSync(candidate, "utf8"));
    }
  }
  const last = list[list.length - 1];
  if (type) {
    const typed = path.join(last, candidateFiles(name, type)[0]);
    if (fs.existsSync(typed)) return parseTemplate(fs.readFileSync(typed, "utf8"));
  }
  return parseTemplate(fs.readFileSync(path.join(last, name + VIEW_EXT), "utf8"));
}

/** The template file extension, exported so a test names files from it (the barrel does not carry it). */
export const VIEW_EXT = ".view";

/** The files a (name, type) pair may resolve to, most specific first. */
function candidateFiles(name: string, type?: string): string[] {
  return type ? [`${name}.${type}${VIEW_EXT}`, name + VIEW_EXT] : [name + VIEW_EXT];
}
