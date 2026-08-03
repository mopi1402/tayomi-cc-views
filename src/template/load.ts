// Where a template comes from.
//
// Kept apart from parse.ts so the parser stays disk-free: a template can be parsed from a string in a test, and this
// module is the only place that knows a .view is a file at all.

import fs from "node:fs";
// Aliased, and that is not cosmetic: a host bundling the engine commonly prepends `import { createRequire } from
// "node:module"` as an interop banner (esbuild's documented recipe), and a bundle declaring the name twice is a
// SyntaxError before a line runs.
import { createRequire as requireFrom } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VIEWS_DIR, VIEWS_PATH_ENV, VIEW_EXT } from "../data/markup.js";
import { parseTemplate, type Template } from "./parse.js";

export { VIEWS_PATH_ENV, VIEW_EXT };

// Inside a plugin hook the views ship beside the bundle and CLAUDE_PLUGIN_ROOT is always set by the host, so that path
// is authoritative.
export function viewsDir(): string {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  if (root) return path.join(root, VIEWS_DIR);
  return bundledViewsDir();
}

// The views shipped INSIDE the package, home of `welcome`. Searched UPWARDS from a starting point: the source tree, the
// compiled dist/ and an npm-installed copy sit at different depths under the package root, so the search counts
// nothing.
const MAX_HOPS = 5;

// The package's own NAME, spelled here alone. Asking Node where the package is INSTALLED is the one question that keeps
// a right answer from inside a host's bundle, where a path relative to this module has none: a bundler rewrites
// import.meta.url into its own output, so the walk would measure the HOST's tree. load.test.ts pins this against
// package.json.
const PKG_NAME = "@tayomi/cc-views";

/** Whether `dir` is the root of THIS package, judged on the manifest lying in it. */
function isPackageRoot(dir: string): boolean {
  try {
    const manifest: unknown = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    return (manifest as { name?: unknown }).name === PKG_NAME;
  } catch {
    return false;
  }
}

// The package's views/ at or above `from`, or null. The manifest check is what makes the answer OURS: a host that
// bundles the engine has its own views/ one hop above the bundle, and returning that directory is how the engine used
// to claim the host's templates as its own, silently.
function packageViewsAbove(from: string): string | null {
  let dir = from;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const candidate = path.join(dir, VIEWS_DIR);
    if (fs.existsSync(candidate) && isPackageRoot(dir)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

export function bundledViewsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // By NAME first, which answers for an ordinary install AND from inside a host's bundle, since the package still lies
  // in the host's node_modules either way.
  try {
    const resolved = packageViewsAbove(path.dirname(requireFrom(import.meta.url).resolve(PKG_NAME)));
    if (resolved) return resolved;
  } catch {
    // Not resolvable from here (no node_modules to reach). The walk below still answers for a checkout of this repo,
    // where no package is installed at all.
  }
  const walked = packageViewsAbove(here);
  if (walked) return walked;
  // Nothing found. Name a path under THIS module, never one belonging to the host, so the read that follows fails with
  // something a human can act on. A host that bundles the engine and reaches here has not marked the package external:
  // see docs/architecture/display-host.md.
  return path.join(here, VIEWS_DIR);
}

// The DEFAULT search path: the adopter's explicit dirs first (CC_VIEWS_PATH, split like PATH), then the project's own
// views/ (hooks run with cwd at the project root), then the plugin resolution above. First hit wins, so a project
// template naming a standard view OVERRIDES it: the order IS the override contract (author's decision, 2026-07-31, when
// the quickstart against an installed copy proved the module-relative fallback can never see a project's views/).
export function defaultViewsPath(): string[] {
  const configured = process.env[VIEWS_PATH_ENV] ?? "";
  const dirs = configured.split(path.delimiter).filter((dir) => dir !== "");
  const search = [...dirs, path.join(process.cwd(), VIEWS_DIR), viewsDir()];
  // The package's own views close the path UNCONDITIONALLY (under a plugin root they would otherwise never be
  // consulted), and every earlier dir can still shadow them.
  const bundled = bundledViewsDir();
  if (search[search.length - 1] !== bundled) search.push(bundled);
  return search;
}

/** The file a named view is read from inside `dir`. Spelling a `.view` path is this module's job alone. */
export const viewFile = (dir: string, name: string): string => path.join(dir, name + VIEW_EXT);

/**
 * Every view a directory holds, by name, sorted so a generated catalogue reads the same twice.
 *
 * A directory that does not exist yields nothing rather than throwing: a search path routinely names one (the project's
 * own `views/` under a host that has none), and the resolution above already treats an absent dir as a miss.
 */
export function listViews(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(VIEW_EXT))
      .map((file) => file.slice(0, -VIEW_EXT.length))
      .sort();
  } catch {
    return [];
  }
}

/** The files a (name, type) pair may resolve to, most specific first. */
function candidateFiles(name: string, type?: string): string[] {
  return type ? [`${name}.${type}${VIEW_EXT}`, name + VIEW_EXT] : [name + VIEW_EXT];
}

// An ORDERED search path, first hit wins. The LAST dir is read unconditionally rather than existence-checked, so a view
// found nowhere fails with a real path a human can act on.
//
// A TYPE resolves here too, as a file: within ONE dir `<name>.<type>.view` beats `<name>.view`, and PATH ORDER outranks
// that specificity, because whoever owns the earlier dir owns the view's look, whole. An unknown type lands on the
// default form rather than an error: a semantic name the template does not know is still true information.
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
