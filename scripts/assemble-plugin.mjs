// The plugin, assembled into plugin/, which is what the marketplace points at: an install copies the source
// directory WHOLE (no ignore mechanism exists, .gitignore included), so pointing it at the repo root shipped
// node_modules and every dev artefact around it, 226 MB where the plugin needs four entries and no build.
//
// 100% copied from ENTRIES below, which lets its gate be a byte diff: --check compares in memory and fails on
// any difference, a missing file, a stale one, and an extra one alike.
//
// Run via `pnpm assemble:plugin` (write) or `pnpm check:plugin` (gate, wired into `pnpm verify`).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = "plugin";
/** What an install needs and nothing else: the manifest, the hook, the briefing, the skill. Versioned files, no build. */
const ENTRIES = [".claude-plugin/plugin.json", "hooks", "agent", "skills"];
/** The marketplace entry this directory exists for: what an install copies is what this script wrote. */
const MARKETPLACE = ".claude-plugin/marketplace.json";
const SOURCE = `./${OUT_DIR}`;

/** Every file under `rel`, as repo-relative paths. */
function filesUnder(rel) {
  const abs = path.join(ROOT, rel);
  if (fs.statSync(abs).isFile()) return [rel];
  return fs
    .readdirSync(abs)
    .flatMap((name) => filesUnder(path.join(rel, name)))
    .sort();
}

/** Every file under an absolute directory, relative to it. Empty where the directory does not exist. */
function copied(out) {
  if (!fs.existsSync(out)) return [];
  const walk = (rel) => {
    const abs = path.join(out, rel);
    if (fs.statSync(abs).isFile()) return [rel];
    return fs.readdirSync(abs).flatMap((name) => walk(path.join(rel, name)));
  };
  return walk(".").map((rel) => path.normalize(rel)).sort();
}

const files = ENTRIES.flatMap(filesUnder);

function assemble() {
  const out = path.join(ROOT, OUT_DIR);
  fs.rmSync(out, { recursive: true, force: true });
  for (const rel of files) {
    const to = path.join(out, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), to);
  }
  console.log(`assemble-plugin: ${OUT_DIR}/ holds ${files.length} files`);
}

function check() {
  const out = path.join(ROOT, OUT_DIR);
  const failures = [];
  const marketplace = JSON.parse(fs.readFileSync(path.join(ROOT, MARKETPLACE), "utf8"));
  if (!(marketplace.plugins ?? []).some((p) => p.source === SOURCE)) {
    failures.push(`${MARKETPLACE} points no plugin at ${SOURCE}`);
  }
  for (const rel of files) {
    const copy = path.join(out, rel);
    if (!fs.existsSync(copy)) {
      failures.push(`${OUT_DIR}/${rel} is missing`);
    } else if (!fs.readFileSync(copy).equals(fs.readFileSync(path.join(ROOT, rel)))) {
      failures.push(`${OUT_DIR}/${rel} differs from ${rel}`);
    }
  }
  const wanted = new Set(files);
  for (const rel of copied(out)) {
    if (!wanted.has(rel)) failures.push(`${OUT_DIR}/${rel} matches no source entry`);
  }
  if (failures.length) {
    for (const failure of failures) console.error(`check-plugin: ${failure}`);
    console.error("check-plugin: FAIL. Run `pnpm assemble:plugin` and commit the result.");
    process.exit(1);
  }
  console.log(`check-plugin: PASS (${OUT_DIR}/ carries ${files.length} files and nothing else)`);
}

if (process.argv.includes("--check")) check();
else assemble();
