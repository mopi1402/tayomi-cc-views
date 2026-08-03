// The ONE version, carried into the two manifests that cannot import it.
//
// `package.json` holds the version this package is. A plugin manifest is static JSON read by Claude
// Code before any of our code runs, so it cannot ask for the number: it has to spell it. That is a
// copy, and this repo's answer to a copy it cannot remove is never to trust it.
//
// So the pair is the one gen-catalogue.mjs already draws, one storey up: this WRITES, and
// check-skill.mjs GATES. Deliberately no --check mode here, since a second reader of the same rule
// is the drift the rule exists to stop; a manifest out of step fails `pnpm verify` on the gate that
// already answers for it.
//
// Run via `pnpm sync:version` after bumping package.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_DIR = ".claude-plugin";
const PLUGIN = path.join(PLUGIN_DIR, "plugin.json");
const MARKETPLACE = path.join(PLUGIN_DIR, "marketplace.json");
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

if (changed.length === 0) {
  console.log(`sync-version: already at ${version}`);
} else {
  console.log(`sync-version: ${version} written to ${changed.join(", ")}`);
}
