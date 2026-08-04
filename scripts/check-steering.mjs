// agent/steering.md is a DOCUMENT that reaches a model as context, so nothing type-checks it and no suite
// reads its words. This is what does, and it is the counterpart of check-skill.mjs for the other text this
// repo ships to an agent.
//
// The failure it exists to catch is the quietest one here. A view renamed or dropped leaves this file
// reading perfectly while naming something the engine no longer resolves, and the reader who finds out is
// a model in someone else's session, told to draw with a word that draws nothing. So every view name and
// every attribute it spells is read back against agent/catalogue.json, which is generated from the tables
// the engine executes.
//
// It also holds the DELIVERY together, since correct text reaches nobody on its own: the hook has to be
// registered, it has to name this file's own directory, and the README has to point a reader here rather
// than carrying a copy that drifts.
//
// Run via `pnpm check:steering`, wired into `pnpm verify`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_DIR = "agent";
const CATALOGUE = `${AGENT_DIR}/catalogue.json`;
const STEERING = `${AGENT_DIR}/steering.md`;
const HOOKS = "hooks/hooks.json";
const HOOK_FILE = "hooks/steering.mjs";
const README = "README.md";
const EVENT = "SessionStart";
/** The sources a session is injected on. A `compact` or a `resume` that dropped the text would lose it mid-work. */
const SOURCES = ["startup", "clear", "compact", "resume"];

// The decorator, spelled as the catalogue publishes it: `@{view:<name>}` with optional `attr:value` pairs.
// Deliberately loose on what follows the name, because the point is to READ the words, never to re-implement
// the parser: src/carrier/decorator.ts owns that and its own suite pins it.
const DECORATOR_RE = /@\{view:([^}]*)\}/g;
const PAIR_SEP = ",";
const NAME_MARK = ":";

const failures = [];
const fail = (why) => failures.push(why);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const readJson = (rel) => JSON.parse(read(rel));

const catalogue = readJson(CATALOGUE);
const views = new Set(catalogue.views.map((v) => v.name));
const decorator = catalogue.block.carriers.find((c) => c.kind === "decorator");
const attributes = new Set((decorator?.attributes ?? []).map((a) => a.name));

// 1. Every view and every attribute the text spells, read back against the generated catalogue. An unknown
// VALUE is not checked and must not be: `type:` and `tone:` take any word and fall back by design, which is
// the whole reason the text tells a reader so.
const steering = read(STEERING);
steering.split("\n").forEach((line, n) => {
  const at = `${STEERING}:${n + 1}`;
  for (const m of line.matchAll(DECORATOR_RE)) {
    const [name, ...pairs] = m[1].split(PAIR_SEP).map((part) => part.trim());
    if (!views.has(name)) fail(`${at}  @{view:${name}} names no view this package ships`);
    for (const pair of pairs) {
      const key = pair.slice(0, pair.indexOf(NAME_MARK));
      if (!attributes.has(key)) fail(`${at}  ${key || pair} is no attribute of the decorator`);
    }
  }
});

// 2. Every view that ships and can be summoned from a message is NAMED, or the text quietly teaches a
// smaller language than the one installed. A view spending no payload of its own is not one a message
// summons (`welcome` is the host's own screen), so the list is the ones that read something.
for (const view of catalogue.views) {
  if (view.payload === null) continue;
  if (!steering.includes(`view:${view.name}`)) {
    fail(`${STEERING} never names \`${view.name}\`, a view a message can summon`);
  }
}

// 3. The hook is registered, on every source, and points at a file that exists. Without this the text is
// correct and reaches nobody, which is the failure that looks most like success.
const hooks = readJson(HOOKS);
const registered = hooks.hooks?.[EVENT] ?? [];
const commands = registered.flatMap((entry) => (entry.hooks ?? []).map((h) => h.command ?? ""));
if (!commands.some((cmd) => cmd.includes(path.basename(HOOK_FILE)))) {
  fail(`${HOOKS} registers no ${EVENT} hook running ${HOOK_FILE}`);
}
for (const source of SOURCES) {
  if (!registered.some((entry) => (entry.matcher ?? "").includes(source))) {
    fail(`${HOOKS} does not inject on \`${source}\`, so a session reaching it loses the text`);
  }
}
if (!fs.existsSync(path.join(ROOT, HOOK_FILE))) fail(`${HOOKS} names ${HOOK_FILE}, which does not exist`);
if (!read(HOOK_FILE).includes(path.basename(STEERING))) {
  fail(`${HOOK_FILE} no longer reads ${STEERING}`);
}

// 4. And a human reads about the file rather than a copy of it: the README inlining these words again is
// how the two start disagreeing, and the one an adopter pastes is always the stale one.
if (!read(README).includes(STEERING)) fail(`${README} points nobody at ${STEERING}`);

if (failures.length > 0) {
  for (const why of failures) console.error(`check-steering: ${why}`);
  process.exit(1);
}
console.log(`check-steering: PASS (${views.size} views known, hook registered on ${SOURCES.length} sources)`);
