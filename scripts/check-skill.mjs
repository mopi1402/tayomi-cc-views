// The skill is a DOCUMENT, so nothing type-checks it and no suite runs it. This is what does.
//
// It exists because a skill is the one artifact here that teaches the language without executing it.
// Everything else in this repo derives from src/data/ and falls over the day a word changes; a
// markdown file goes on reading beautifully while naming a directive that no longer exists, and the
// only reader who finds out is the agent it just misled, in someone else's project.
//
// So every word the skill spells is read back against agent/catalogue.json, which is itself generated
// from the tables the engine executes. A renamed directive fails here, on the file that names it.
//
// It also holds the DELIVERY together, since the skill reaches nobody by being correct: the manifests
// have to resolve to it, and the README has to say how to install it.
//
// Run via `pnpm check:skill`, wired into `pnpm verify`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_DIR = ".claude-plugin";
const PLUGIN = path.join(PLUGIN_DIR, "plugin.json");
const MARKETPLACE = path.join(PLUGIN_DIR, "marketplace.json");
const CATALOGUE = path.join("agent", "catalogue.json");
const README = "README.md";
const SKILL_FILE = "SKILL.md";
/** What a skill must declare to be discovered, and what a model reads to decide it applies. */
const FRONTMATTER = ["name", "description"];
const FENCE = "---";

/** The pointers that keep the skill spending the LIVE reference instead of a copy of it. */
const LIVE_REFERENCE = ["cc-views dict", "cc-views check"];
// The GENERATED grammar, spelled from the file this gate already reads so the two cannot drift. It is
// checked because losing it is silent and was already lost once: the skill sent a reader to
// docs/CHEATSHEET.md, the HUMAN page, which answers a machine by naming this file. That is one hop,
// taken only by a reader who gets as far as the line that says so.
const GENERATED_REFERENCE = CATALOGUE.split(path.sep).join("/");
/** The two routes that carry a skill from a git repo to where an agent discovers it. */
const INSTALL_ROUTES = ["/plugin marketplace add", "npx skills add"];

// An `@` opening a word, the same shape check-vocabulary.mjs sweeps for, and the same one exception:
// a scoped package specifier is told apart by its slash. `@{` opens a decorator and matches neither.
const AT_WORD_RE = /@\w[\w-]*(\/)?/g;
const TAG_RE = /\{\{([^}\s]+)\}\}/g;

const failures = [];
const fail = (why) => failures.push(why);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const readJson = (rel) => JSON.parse(read(rel));

/** The `name: value` pairs of a leading fenced block, which is all the frontmatter a skill carries. */
function frontmatter(text) {
  const lines = text.split("\n");
  if (lines[0].trim() !== FENCE) return null;
  const end = lines.indexOf(FENCE, 1);
  if (end === -1) return null;
  const pairs = {};
  for (const line of lines.slice(1, end)) {
    const at = line.indexOf(":");
    if (at > 0) pairs[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return pairs;
}

const pkg = readJson("package.json");
const catalogue = readJson(CATALOGUE);
const words = new Set(catalogue.directives.map((d) => d.word));
const tags = new Set(catalogue.tags.names);

/** A tag name, or a name suffixed into one of the forms every colour derives. */
function knownTag(name) {
  if (tags.has(name)) return true;
  return catalogue.tags.suffixes.some(
    (suffix) => name.endsWith(suffix) && tags.has(name.slice(0, -suffix.length))
  );
}

// 1. The manifests, and the ONE version. Written twice on disk, so it is checked rather than trusted:
// a release bumping package.json alone would advertise a plugin that no longer matches the engine.
const plugin = readJson(PLUGIN);
const marketplace = readJson(MARKETPLACE);
if (plugin.version !== pkg.version) {
  fail(`${PLUGIN} says version ${plugin.version}, package.json says ${pkg.version}`);
}
const listed = marketplace.plugins.find((p) => p.name === plugin.name);
if (listed === undefined) {
  fail(`${MARKETPLACE} lists no plugin named ${plugin.name}`);
} else if (listed.version !== pkg.version) {
  fail(`${MARKETPLACE} says version ${listed.version}, package.json says ${pkg.version}`);
}

// 2. Every skill the manifest declares resolves to a real one, with the frontmatter that gets it read.
if (!Array.isArray(plugin.skills) || plugin.skills.length === 0) {
  fail(`${PLUGIN} declares no skill, so nothing it ships is discovered`);
}
for (const rel of plugin.skills ?? []) {
  const dir = path.normalize(rel);
  const file = path.join(dir, SKILL_FILE);
  if (!fs.existsSync(path.join(ROOT, file))) {
    fail(`${PLUGIN} names ${rel}, which holds no ${SKILL_FILE}`);
    continue;
  }
  const text = read(file);
  const meta = frontmatter(text);
  if (meta === null) {
    fail(`${file} opens with no frontmatter, so no agent can read what it is for`);
    continue;
  }
  for (const key of FRONTMATTER) {
    if (!meta[key]) fail(`${file} declares no ${key}`);
  }
  if (meta.name !== path.basename(dir)) {
    fail(`${file} is named ${meta.name} inside a directory named ${path.basename(dir)}`);
  }

  // 3. Every word of the language it spells, read back against the generated catalogue.
  const body = text.split("\n");
  body.forEach((line, n) => {
    for (const m of line.matchAll(AT_WORD_RE)) {
      if (m[1] !== undefined) continue; // a scoped package specifier, not a directive
      if (!words.has(m[0])) fail(`${file}:${n + 1}  ${m[0]} is no directive of the language`);
    }
    for (const m of line.matchAll(TAG_RE)) {
      if (!knownTag(m[1])) fail(`${file}:${n + 1}  {{${m[1]}}} is no tag the palette answers to`);
    }
  });

  // 4. It still points at the live reference and at the generated grammar, rather than having become
  // a copy of either.
  for (const pointer of [...LIVE_REFERENCE, GENERATED_REFERENCE]) {
    if (!text.includes(pointer)) fail(`${file} no longer names \`${pointer}\``);
  }
}

// 5. And a human can find out how to install it.
const readme = read(README);
for (const route of INSTALL_ROUTES) {
  if (!readme.includes(route)) fail(`${README} names no install route \`${route}\``);
}

if (failures.length > 0) {
  console.error(`\ncheck-skill: the skill is out of step with the engine or with its delivery:\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error(`\ncheck-skill: FAIL (${failures.length})`);
  process.exit(1);
}

console.log(`check-skill: PASS (every word it spells is in ${CATALOGUE}, and it installs)`);
