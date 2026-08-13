// agent/steering.md reaches a model as context, so nothing type-checks it. This does, the counterpart of
// check-skill.mjs: every word it spells is read back against agent/catalogue.json, and the DELIVERY is held together
// too, since a text naming what the engine no longer resolves reads perfectly.
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
/** The documents that teach the language, each on its own road: a session's context, a human's page, an agent's skill. */
const TEACHING = [STEERING, "docs/CHEATSHEET.md", "skills/write-view/SKILL.md"];
const EVENT = "SessionStart";
/** The sources a session is injected on. A `compact` or a `resume` that dropped the text would lose it mid-work. */
const SOURCES = ["startup", "clear", "compact", "resume"];

// Deliberately loose on what follows the name: the point is to READ the words, never to re-implement the parser, which
// src/carrier/decorator.ts owns and its own suite pins.
const DECORATOR_RE = /@\{view:([^}]*)\}/g;
const PAIR_SEP = ",";
const NAME_MARK = ":";

// Read OUT of the hook, never restated: a switch this file spelled on its own could gate a name nothing acts on.
const OPT_OUT_DECL = /const OPT_OUT_ENV = "([^"]+)"/;
const ENV_FAMILY = /^CC_VIEWS_[A-Z_]+$/;
const PKG_DECL = /const PKG_NAME = "([^"]+)"/;
const MANIFEST = "package.json";
/** The switch that turns the diagram half off, and the markers wrapping that half. Read from the HOOK for the same
 * reason as the two above: it owns them, and there is no build to import through. */
const NO_MERMAID_DECL = /const NO_MERMAID_ENV = "([^"]+)"/;
const NEEDS_DECL = [/const NEEDS_OPEN = "([^"]+)"/, /const NEEDS_CLOSE = "([^"]+)"/];
/** The view that half is about: marked text no longer holding it would strip the wrong words. */
const NEEDS_VIEW = "mermaid";

// The colour paragraphs, found by a word each opens rather than by a line number.
const TONES_ANCHOR = "Tones:";
const DEFAULTS_ANCHOR = "spends no tone";
const PARAGRAPH_SEP = "\n\n";
const CODE_SPAN_RE = /`([^`]+)`/g;

const failures = [];
const fail = (why) => failures.push(why);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const readJson = (rel) => JSON.parse(read(rel));

const catalogue = readJson(CATALOGUE);
const views = new Set(catalogue.views.map((v) => v.name));
const decorator = catalogue.block.carriers.find((c) => c.kind === "decorator");
const attributes = new Set((decorator?.attributes ?? []).map((a) => a.name));

// 1. Every view and attribute the text spells, read back against the catalogue. An unknown VALUE is not checked and
// must not be: `type:` and `tone:` take any word and fall back by design.
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

// 2. Every view a message can summon is NAMED, in every document that TEACHES the language, or one of them teaches a
// smaller one than the engine installs. A view spending no payload is not one a message summons.
//
// Three documents because a view reaches an author by three roads: the steering text a session is given, the page a
// human reads, the skill an agent follows. `box` was added and only the gated one gained it.
for (const doc of TEACHING) {
  const text = read(doc);
  for (const view of catalogue.views) {
    if (view.payload === null) continue;
    if (!text.includes(`view:${view.name}`) && !text.includes(`\`${view.name}\``)) {
      fail(`${doc} never names \`${view.name}\`, a view a message can summon`);
    }
  }
}

// 2b. Every tone the text OFFERS resolves to a tag this package ships. An unknown one falls back and draws perfectly,
// so a colour dropped from the palette is a name an author spends forever without seeing it applied.
//
// No check on which DEFAULT each view carries: that is a look, changed while iterating on a .view, and a text one shade
// out of date misleads nobody.
const paragraph = (anchor) => steering.split(PARAGRAPH_SEP).find((p) => p.includes(anchor));
const spans = (text) => [...(text ?? "").matchAll(CODE_SPAN_RE)].map((m) => m[1]);

const tones = paragraph(TONES_ANCHOR);
if (tones === undefined) {
  fail(`${STEERING} no longer has a paragraph opening on "${TONES_ANCHOR}"`);
} else {
  const known = new Set(catalogue.tags.names);
  for (const tone of spans(tones)) {
    if (!known.has(tone)) fail(`${STEERING}  \`${tone}\` is offered as a tone but names no tag this package ships`);
  }
}

// The one claim that is STRUCTURAL rather than a shade: `@{view:hr, tone:gold}` draws a plain rule, whatever is written.
const defaults = paragraph(DEFAULTS_ANCHOR);
if (defaults === undefined) {
  fail(`${STEERING} no longer says which view spends no tone`);
} else {
  const quoted = new Set(spans(defaults));
  for (const view of catalogue.views) {
    if (view.tone !== null || !steering.includes(`view:${view.name}`)) continue;
    if (!quoted.has(view.name)) {
      fail(`${STEERING} never names \`${view.name}\` as a view that spends no tone`);
    }
  }
}

// 3. The hook is registered, on every source, and points at a file that exists: a text reaching nobody is the failure
// that looks most like success.
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

// 3b. The opt-out is reachable: in the family every other switch belongs to, and written down, an undocumented switch
// being one nobody turns.
const optOut = OPT_OUT_DECL.exec(read(HOOK_FILE))?.[1];
if (optOut === undefined) {
  fail(`${HOOK_FILE} declares no OPT_OUT_ENV, so the briefing can no longer be turned off`);
} else {
  if (!ENV_FAMILY.test(optOut)) fail(`${HOOK_FILE} names \`${optOut}\`, outside this package's env family`);
  if (!read(README).includes(optOut)) fail(`${README} documents no \`${optOut}\`, a switch nobody can find`);
}

// 3b-bis. The diagram half is turned off by a switch a reader can find, and wrapped in markers that BALANCE. An
// unpaired one strips nothing (the hook keeps the rest as written), so the failure is a briefing that quietly goes on
// advertising a view this install may not draw, which is the whole thing the markers exist to stop.
const noMermaid = NO_MERMAID_DECL.exec(read(HOOK_FILE))?.[1];
if (noMermaid === undefined) {
  fail(`${HOOK_FILE} declares no NO_MERMAID_ENV, so the diagram half can no longer be turned off`);
} else {
  if (!ENV_FAMILY.test(noMermaid)) fail(`${HOOK_FILE} names \`${noMermaid}\`, outside this package's env family`);
  if (!read(README).includes(noMermaid)) fail(`${README} documents no \`${noMermaid}\`, a switch nobody can find`);
}
const marks = NEEDS_DECL.map((re) => re.exec(read(HOOK_FILE))?.[1]);
if (marks.some((mark) => mark === undefined)) {
  fail(`${HOOK_FILE} declares no NEEDS_OPEN/NEEDS_CLOSE, so nothing in ${STEERING} can be made conditional`);
} else {
  const [open, close] = marks;
  const opens = steering.split(open).length - 1;
  const closes = steering.split(close).length - 1;
  if (opens !== closes) {
    fail(`${STEERING} has ${opens} \`${open}\` for ${closes} \`${close}\`: a marker without its pair`);
  }
  if (closes === 0) fail(`${STEERING} marks nothing as needing a renderer, so the diagram half always ships`);
  for (const region of steering.split(open).slice(1)) {
    if (!region.slice(0, region.indexOf(close)).includes(NEEDS_VIEW)) {
      fail(`${STEERING} marks a region that never names \`${NEEDS_VIEW}\`, so the wrong words would be stripped`);
    }
  }
}
// 3c. The name the hook looks the install up under is THIS package's. A typo there never fails: the walk simply finds
// nothing and the plugin's own copy answers forever, which is the drift the lookup exists to end.
const pkgName = PKG_DECL.exec(read(HOOK_FILE))?.[1];
if (pkgName === undefined) {
  fail(`${HOOK_FILE} declares no PKG_NAME, so it can no longer prefer the installed engine's text`);
} else if (pkgName !== readJson(MANIFEST).name) {
  fail(`${HOOK_FILE} looks up \`${pkgName}\`, which is not \`${readJson(MANIFEST).name}\``);
}

// 4. A human reads ABOUT the file rather than a copy of it: the one an adopter pastes is always the stale one.
if (!read(README).includes(STEERING)) fail(`${README} points nobody at ${STEERING}`);

if (failures.length > 0) {
  for (const why of failures) console.error(`check-steering: ${why}`);
  process.exit(1);
}
console.log(`check-steering: PASS (${views.size} views known, hook registered on ${SOURCES.length} sources)`);
