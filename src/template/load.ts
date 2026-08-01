// Where a template comes from.
//
// Kept apart from parse.ts so the parser stays disk-free: a template can be parsed
// from a string in a test, and this module is the only place that knows a .view is a
// file at all, which makes it the single place a decorator's type resolves to a file.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VIEWS_DIR, VIEWS_PATH_ENV, VIEW_EXT } from "../data/markup.js";
import { parseTemplate, type Template } from "./parse.js";

export { VIEWS_PATH_ENV, VIEW_EXT };

// Inside a plugin hook the views ship beside the bundle and CLAUDE_PLUGIN_ROOT is
// always set by the host, so that path is authoritative.
export function viewsDir(): string {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  if (root) return path.join(root, VIEWS_DIR);
  return bundledViewsDir();
}

// The views shipped INSIDE the package, home of `welcome`, the health check that must
// resolve wherever the engine runs. Found by searching UPWARDS from this module: the
// source tree, the compiled dist/ and an npm-installed copy sit at different depths
// under the package root, so the search counts nothing. Counting used to work only by
// coincidence, back when this module sat one level under the plugin root exactly like
// the bundle it compiles to.
const MAX_HOPS = 5;

export function bundledViewsDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const candidate = path.join(dir, VIEWS_DIR);
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  // Nothing found: return the shallowest guess so the read that follows fails with a
  // path a human can act on, which the caller turns into the raw block on screen.
  return path.join(dir, VIEWS_DIR);
}

// The DEFAULT search path: the adopter's explicit dirs first (CC_VIEWS_PATH, split
// like PATH), then the project's own views/ (the platform runs hooks with cwd at the
// project root), then the plugin resolution above. First hit wins, so a project
// template naming a standard view OVERRIDES it: the order is the override contract,
// not an accident (author's decision, 2026-07-31, when the quickstart run against an
// installed copy proved the module-relative fallback can never see a project's views/).
export function defaultViewsPath(): string[] {
  const configured = process.env[VIEWS_PATH_ENV] ?? "";
  const dirs = configured.split(path.delimiter).filter((dir) => dir !== "");
  const search = [...dirs, path.join(process.cwd(), VIEWS_DIR), viewsDir()];
  // The package's own views close the path UNCONDITIONALLY (under a plugin root they
  // would otherwise never be consulted), and every earlier dir can still shadow them.
  const bundled = bundledViewsDir();
  if (search[search.length - 1] !== bundled) search.push(bundled);
  return search;
}

/** The files a (name, type) pair may resolve to, most specific first. */
function candidateFiles(name: string, type?: string): string[] {
  return type ? [`${name}.${type}${VIEW_EXT}`, name + VIEW_EXT] : [name + VIEW_EXT];
}

// An ORDERED search path, first hit wins. The LAST dir is read unconditionally rather
// than existence-checked, so a view found nowhere fails with a real path a human can
// act on (which the caller turns into the raw block on screen).
//
// A TYPE resolves here too, as a file: within ONE dir, `<name>.<type>.view` beats
// `<name>.view`, and PATH ORDER outranks that specificity. The path is the consumer's
// authority axis, and the shadowing contract must keep holding with a type in play:
// whoever owns the earlier dir owns the view's look, whole. An unknown type therefore
// lands on the default form, never on an error: a semantic name the template does not
// know is still true information, and sound content is not undressed for a slip.
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
