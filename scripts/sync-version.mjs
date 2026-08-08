// The ONE version, carried into the three files that cannot import it: a plugin manifest is static JSON read before any
// of our code runs, and src/data/engine.ts is the number itself, spelled rather than read so it survives a bundler.
//
// This WRITES and the GATES live elsewhere, one each: check-skill.mjs for the manifests, src/data/engine.test.ts for
// the constant. Deliberately no --check mode here, since a second reader of the same rule is the drift it exists to stop.
//
// Run via `pnpm sync:version` after bumping package.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_DIR = ".claude-plugin";
const PLUGIN = path.join(PLUGIN_DIR, "plugin.json");
const MARKETPLACE = path.join(PLUGIN_DIR, "marketplace.json");
const ENGINE = path.join("src", "data", "engine.ts");
const INDENT = 2;

const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
/** Written the way the file already reads: two spaces and a closing newline, so a rerun is no diff. */
const write = (rel, value) =>
  fs.writeFileSync(path.join(ROOT, rel), `${JSON.stringify(value, null, INDENT)}\n`);

const { version } = read("package.json");
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

// The number the engine ANSWERS with, and what every badge on screen derives from.
//
// It REFUSES rather than write nothing: a silent no-match is precisely the drift this file exists
// to stop, and it would ship an engine claiming a version from two releases ago.
const constant = /^(export const ENGINE_VERSION = ")([^"]*)(";)$/m;
const engine = fs.readFileSync(path.join(ROOT, ENGINE), "utf8");
if (!constant.test(engine)) {
  console.error(`sync-version: no ENGINE_VERSION line in ${ENGINE}`);
  process.exit(1);
}
const stamped = engine.replace(constant, `$1${version}$3`);
if (stamped !== engine) {
  fs.writeFileSync(path.join(ROOT, ENGINE), stamped);
  changed.push(ENGINE);
}

if (changed.length === 0) {
  console.log(`sync-version: already at ${version}`);
} else {
  console.log(`sync-version: ${version} written to ${changed.join(", ")}`);
}
