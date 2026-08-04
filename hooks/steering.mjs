// The SessionStart hook: it puts agent/steering.md into the session's context, so an adopter installing
// this plugin never has to paste that text into a CLAUDE.md of their own.
//
// Zero dependency and no build, and both are load-bearing rather than tidy. A plugin is installed by
// COPYING the git repository (`/plugin marketplace add mopi1402/tayomi-cc-views`), so the copy holds
// versioned files alone: dist/ is gitignored and absent there, and node_modules/ was never in it. A hook
// reaching for either would fail on every session start of every install, which is the same trap
// scripts/messagedisplay-dev.mjs is versioned to avoid.
//
// The text is a FILE rather than a constant in the engine for a reason that is not convenience: it is
// itself markdown, fences and decorators included, so a string literal would escape every backtick it
// carries. Nothing here parses it; the words are gated by scripts/check-steering.mjs instead.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Where the text lives, relative to the plugin root this file sits one level under. */
const AGENT_DIR = "agent";
const STEERING_FILE = "steering.md";
const EVENT = "SessionStart";
/** An HTML comment opening the file: a note to whoever EDITS it, never something a session should read. */
const NOTE_OPEN = "<!--";
const NOTE_CLOSE = "-->";

/**
 * The hook's answer for a plugin rooted at `root`, or null when there is nothing to say.
 *
 * Null on any failure, and that is the contract rather than a shortcut: a session start is never blocked
 * by this, and a plugin whose copy arrived without the file costs a plain screen and not a broken start.
 */
export function steeringPayload(root) {
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

/** The file without its editor's note. Kept out of the context because it addresses a contributor, not a session. */
function stripNote(text) {
  if (!text.startsWith(NOTE_OPEN)) return text;
  const end = text.indexOf(NOTE_CLOSE);
  return end === -1 ? text : text.slice(end + NOTE_CLOSE.length);
}

/** This file's own plugin root: it lives in hooks/, one hop under it. */
export const pluginRoot = () => path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Executed rather than imported: the test beside it reads the function above, and only a real hook run
// writes to stdout. Compared on the resolved path, since argv[1] arrives unresolved through a symlink.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const payload = steeringPayload(pluginRoot());
  if (payload !== null) process.stdout.write(payload);
  process.exit(0);
}
