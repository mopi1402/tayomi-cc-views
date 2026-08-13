// This repo's OWN session bookends, wired in .claude/settings.json beside messagedisplay-dev.mjs: SessionStart runs
// `node scripts/session-dev.mjs start`, SessionEnd runs `node scripts/session-dev.mjs end`, and the working tree's
// engine signs the election roster the way an installed one would.
//
// Same wrapper, same reason: dist/ is gitignored, so the packaged `dist/bin/session.js` does not exist in a fresh
// clone. Fail open everywhere: a bookend that cannot run costs one signature, which the first flush recreates.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// The compiled EDGE, not the bin beside it: the bin owns a main() and a process.exit, and both belong to this file.
const EDGE = path.join(REPO, "dist", "hook", "session.js");

const START = "start";
const END = "end";
const verb = process.argv[2];

if (fs.existsSync(EDGE)) {
  try {
    const { runSessionStartHook, runSessionEndHook } = await import(pathToFileURL(EDGE).href);
    if (verb === START) await runSessionStartHook();
    else if (verb === END) await runSessionEndHook();
  } catch {
    // A build in flight, or a module that throws on load: the first flush's net signs on instead.
  }
}

process.exit(0);
