// The ONE version, carried into the two manifests that cannot import it: a plugin manifest is static JSON read before
// any of our code runs, so it has to spell the number rather than ask for it.
//
// This WRITES and check-skill.mjs GATES. Deliberately no --check mode here, since a second reader of the same rule is
// the drift the rule exists to stop.
//
// Run via `pnpm sync:version` after bumping package.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_DIR = ".claude-plugin";
const PLUGIN = path.join(PLUGIN_DIR, "plugin.json");
const MARKETPLACE = path.join(PLUGIN_DIR, "marketplace.json");
const WELCOME = path.join("views", "welcome.view");
const INDENT = 2;

const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
/** Written the way the file already reads: two spaces and a closing newline, so a rerun is no diff. */
const write = (rel, value) =>
  fs.writeFileSync(path.join(ROOT, rel), `${JSON.stringify(value, null, INDENT)}\n`);

const { name, version } = read("package.json");
const changed = [];

const plugin = read(PLUGIN);
if (plugin.version !== version) {
  plugin.version = version;
  write(PLUGIN, plugin);
  changed.push(PLUGIN);
}

// Only the entries naming OUR plugin: a marketplace may one day list someone else's, and theirs is
// versioned by them.
const marketplace = read(MARKETPLACE);
const mine = marketplace.plugins.filter((p) => p.name === plugin.name && p.version !== version);
if (mine.length > 0) {
  for (const entry of mine) entry.version = version;
  write(MARKETPLACE, marketplace);
  changed.push(MARKETPLACE);
}

// The health check's badge. A .view is read, never imported, so this is the same copy as the
// manifests above; it is also the only line telling a reader WHICH engine drew the box, which is
// the whole point of the view when two of them could have (docs/caveats.md).
//
// Anchored on the package's own name so it can only ever touch the badge that already names us,
// and it REFUSES rather than write nothing: a silent no-match is precisely the drift this file
// exists to stop, and it would ship a box claiming a version from two releases ago.
const badge = new RegExp(`^@right ${name.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}.*$`, "m");
const welcome = fs.readFileSync(path.join(ROOT, WELCOME), "utf8");
if (!badge.test(welcome)) {
  console.error(`sync-version: no "@right ${name}" line in ${WELCOME}`);
  process.exit(1);
}
const badged = welcome.replace(badge, `@right ${name} v${version}`);
if (badged !== welcome) {
  fs.writeFileSync(path.join(ROOT, WELCOME), badged);
  changed.push(WELCOME);
}

if (changed.length === 0) {
  console.log(`sync-version: already at ${version}`);
} else {
  console.log(`sync-version: ${version} written to ${changed.join(", ")}`);
}
