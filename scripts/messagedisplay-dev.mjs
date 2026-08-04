// This repo's OWN MessageDisplay hook, wired in .claude/settings.json so a session opened at the ROOT is dressed by
// this working tree. Without it a fresh clone renders every `@{view:...}` raw, in the repo that owns the engine.
//
// Why a wrapper and not the packaged bin: dist/ is gitignored, so `dist/bin/messagedisplay.js` does not exist in a
// clone and Claude Code would report a missing command on every message. THIS file is versioned, so it always exists,
// and it is what decides.
//
// Fail open everywhere, for the reason the runner itself gives: this runs on every flush of every message, and an
// engine that is mid-build or half broken must cost a plain screen, never a lost sentence.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// The compiled RUNNER, not the bin beside it: the bin owns a main() and a process.exit, and both belong to this file
// here. Importing it would also trip its own direct-execution guard.
const RUNNER = path.join(REPO, "dist", "hook", "runner.js");

// No build yet. Emitting nothing leaves the raw markdown on screen, which is exactly the verdict
// docs/contributing/manual-checks.md already teaches a contributor to read as "no engine ran".
if (fs.existsSync(RUNNER)) {
  try {
    const { runMessageDisplayHook } = await import(pathToFileURL(RUNNER).href);
    await runMessageDisplayHook();
  } catch {
    // A build in flight (`pnpm build` is rm -rf then tsc) or a module that throws on load.
  }
}

process.exit(0);
