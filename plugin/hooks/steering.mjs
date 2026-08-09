// The SessionStart hook: it puts agent/steering.md into the session's context.
//
// Zero dependency and no build, both load-bearing: a plugin is installed by COPYING the git repository, so the copy
// holds versioned files alone, dist/ being gitignored and node_modules/ never in it.
//
// The INSTALLED package's copy is preferred over the plugin's own, because the two update on independent tracks: a
// plugin one version ahead teaches a view the engine cannot resolve, and the block prints raw.
//
// The text is a FILE because it is itself markdown, fences and decorators included, which a string literal would have
// to escape. Nothing here parses it; the words are gated by scripts/check-steering.mjs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Where the text lives, relative to the plugin root this file sits one level under. */
const AGENT_DIR = "agent";
const STEERING_FILE = "steering.md";
const EVENT = "SessionStart";

// The install to ask FIRST, spelled here for the same reason as the switch below: there is no build to import through.
// check-steering.mjs reads the name back against package.json.
const PKG_NAME = "@tayomi/cc-views";
const MODULES_DIR = "node_modules";
/** The two manifests the drift check compares, the plugin's own and the installed engine's. */
const PLUGIN_DIR = ".claude-plugin";
const PLUGIN_MANIFEST = "plugin.json";
const MANIFEST = "package.json";
/** How a user names the plugin to `claude plugin update`. check-steering.mjs reads it back against the manifest. */
const PLUGIN_SLUG = "cc-views";
/** The installed engine's entry, imported ONLY to draw the notice below: a drift means that copy is there. */
const DIST_ENTRY = ["dist", "index.js"];
/** What an UNDRAWN block still opens with, which is how a copy too old to know the view is told from one that drew. */
const DECORATOR = "@{";
/** The directory the session opened, which the host sets on every hook it runs. */
const PROJECT_DIR_ENV = "CLAUDE_PROJECT_DIR";
// Searched UPWARDS: a workspace hoists the dependency to its root, a plain project keeps it beside the manifest.
const MAX_HOPS = 5;

// The opt-out, for an install wanting the skill without the briefing. Spelled here rather than imported from
// src/data/markup.ts: the switch belongs to the HOOK, the engine never reads it, and there is no build to import
// through. check-steering.mjs keeps the name in the family and the README naming it.
const OPT_OUT_ENV = "CC_VIEWS_STEERING";
/** Forgiving in the one direction whose intent is unambiguous. Anything else, `on` included, keeps the text. */
const OFF = ["off", "0", "false", "no"];
/** An HTML comment opening the file: a note to whoever EDITS it, never something a session should read. */
const NOTE_OPEN = "<!--";
const NOTE_CLOSE = "-->";

/**
 * The install the session would DRAW with, or null when none is in reach. The NEAREST one answers, because it is the
 * one node resolves; walking past it would answer for a copy the running engine never agreed to.
 *
 * The engine's OWN checkout counts as one, and it is the case a contributor lives in: nothing is installed there, the
 * copy that draws is the working tree, and the drift it hides is exactly the one that wastes an afternoon, a bump
 * landing with no `plugin update` behind it.
 */
function installedRoot(env) {
  let dir = env[PROJECT_DIR_ENV] ?? process.cwd();
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const installed = path.join(dir, MODULES_DIR, PKG_NAME);
    if (fs.existsSync(installed)) return installed;
    if (manifest(path.join(dir, MANIFEST)).name === PKG_NAME) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/**
 * The file the INSTALLED engine ships, or null when the install in reach holds none. That copy is the honest one: it
 * names the views the engine that draws them can actually resolve.
 */
function installedSteering(env) {
  const installed = installedRoot(env);
  if (installed === null) return null;
  const candidate = path.join(installed, AGENT_DIR, STEERING_FILE);
  return fs.existsSync(candidate) ? candidate : null;
}

/** A manifest's fields, or nothing at all for anything unreadable: a warning is never worth a broken session start. */
function manifest(file) {
  try {
    const read = JSON.parse(fs.readFileSync(file, "utf8"));
    return read !== null && typeof read === "object" ? read : {};
  } catch {
    return {};
  }
}

/** A manifest's version, or null where it names none. */
function manifestVersion(file) {
  const version = manifest(file).version;
  return typeof version === "string" && version !== "" ? version : null;
}

/** Release order on the RELEASE half alone: a prerelease sorts under its own release, which is close enough to name a lag. */
function behind(a, b) {
  const parts = (v) => v.split("-")[0].split(".").map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  }
  return false;
}

/**
 * The two halves say different numbers, in the one place both are readable. Silent where either is missing: an engine
 * reached from somewhere this walk cannot see is the normal case for a host that bundles it, never a fault to report.
 */
function versionDrift(root, installed) {
  if (installed === null) return null;
  const plugin = manifestVersion(path.join(root, PLUGIN_DIR, PLUGIN_MANIFEST));
  const engine = manifestVersion(path.join(installed, MANIFEST));
  if (plugin === null || engine === null || plugin === engine) return null;
  // Naming the ONE command to run is the whole value: knowing they disagree without knowing which way is no help.
  return behind(engine, plugin)
    ? `${PKG_NAME} v${engine} is behind the plugin's v${plugin}. A newer engine is out: npm i -D ${PKG_NAME}@latest`
    : `the ${PLUGIN_SLUG} plugin v${plugin} is behind the engine's v${engine}: claude plugin update ${PLUGIN_SLUG}`;
}

/**
 * The hook's answer for a plugin rooted at `root`, or null when there is nothing to say.
 *
 * Null on any failure IS the contract: a session start is never blocked by this.
 */
/**
 * The notice as a BAND, drawn by the engine that is installed, since a drift is proof one is there and every view it
 * resolves is its own. Falls back to the bare sentence for anything at all: an entry that will not import, a copy too
 * old to know the view, a block that came back undrawn. A notice is never worth a broken session start.
 */
async function drawn(installed, message) {
  const block = `@{view:banner}\n> [!WARNING]\n> ${message}\n`;
  try {
    const entry = pathToFileURL(path.join(installed, ...DIST_ENTRY)).href;
    const { transform } = await import(entry);
    const out = transform(block, undefined, true).trim();
    return out === "" || out.includes(DECORATOR) ? message : out;
  } catch {
    return message;
  }
}

export async function steeringPayload(root, env = process.env) {
  if (OFF.includes((env[OPT_OUT_ENV] ?? "").trim().toLowerCase())) return null;
  // The plugin's own copy answers for the two installs that ship no text: one too old to carry the file, and one the
  // engine reaches from somewhere this walk cannot see. Both draw, and a session left with no briefing is the worse
  // failure of the two.
  const file = installedSteering(env) ?? path.join(root, AGENT_DIR, STEERING_FILE);
  let body = "";
  try {
    body = stripNote(fs.readFileSync(file, "utf8")).trim();
  } catch {
    body = "";
  }
  // Reported even where the briefing is unreadable, since a drift is exactly the reason it could be.
  const installed = installedRoot(env);
  const drift = versionDrift(root, installed);
  if (body === "" && drift === null) return null;
  const payload = {};
  if (body !== "") payload.hookSpecificOutput = { hookEventName: EVENT, additionalContext: body };
  // On the USER's screen and not in the context: it is an action to take, and no answer of the agent's depends on it.
  if (drift !== null) payload.systemMessage = await drawn(installed, drift);
  return JSON.stringify(payload);
}

/** The file without its editor's note, which addresses a contributor and not a session. */
function stripNote(text) {
  if (!text.startsWith(NOTE_OPEN)) return text;
  const end = text.indexOf(NOTE_CLOSE);
  return end === -1 ? text : text.slice(end + NOTE_CLOSE.length);
}

/** This file lives in hooks/, one hop under the plugin root. */
export const pluginRoot = () => path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Only a real hook run writes to stdout; the test beside it reads the function above. Resolved, since argv[1]
// arrives unresolved through a symlink.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const payload = await steeringPayload(pluginRoot());
  if (payload !== null) process.stdout.write(payload);
  process.exit(0);
}
