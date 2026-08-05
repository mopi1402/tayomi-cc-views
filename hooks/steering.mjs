// The SessionStart hook: it puts agent/steering.md into the session's context.
//
// Zero dependency and no build, both load-bearing: a plugin is installed by COPYING the git repository, so the copy
// holds versioned files alone, dist/ being gitignored and node_modules/ never in it.
//
// The text is a FILE because it is itself markdown, fences and decorators included, which a string literal would have
// to escape. Nothing here parses it; the words are gated by scripts/check-steering.mjs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Where the text lives, relative to the plugin root this file sits one level under. */
const AGENT_DIR = "agent";
const STEERING_FILE = "steering.md";
const EVENT = "SessionStart";

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
 * The hook's answer for a plugin rooted at `root`, or null when there is nothing to say.
 *
 * Null on any failure IS the contract: a session start is never blocked by this.
 */
export function steeringPayload(root, env = process.env) {
  if (OFF.includes((env[OPT_OUT_ENV] ?? "").trim().toLowerCase())) return null;
  let text;
  try {
    text = fs.readFileSync(path.join(root, AGENT_DIR, STEERING_FILE), "utf8");
  } catch {
    return null;
  }
  const body = stripNote(text).trim();
  if (body === "") return null;
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: EVENT, additionalContext: body },
  });
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
  const payload = steeringPayload(pluginRoot());
  if (payload !== null) process.stdout.write(payload);
  process.exit(0);
}
