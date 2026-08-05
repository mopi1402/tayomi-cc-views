// Which engine dresses a session opened at the repo root, said in one line rather than drawn on every message.
//
// A STANDING fact is said once at SessionStart (--always); the only thing said again is one that CHANGED and can be
// measured, dist/ older than src/, and that notice extinguishes itself on the next build.
//
// systemMessage is the host's own channel, so nothing here touches what the MessageDisplay hook renders.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ALWAYS = "--always";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(REPO, "src");
const DIST = path.join(REPO, "dist");
// Excluded from tsconfig.build.json, so editing one CANNOT make dist stale. Counting them would cry wolf on every test
// a contributor writes, which is the fastest way to teach someone to ignore this line.
const NOT_BUILT = ".test.ts";

const BUILD = "pnpm build";
const HEALTH_CHECK = "@{view:welcome}";

const MS = 1000;
const SEC_PER_MIN = 60;
const MIN_PER_HOUR = 60;
const HOUR_PER_DAY = 24;

/** The most recent mtime under `dir`, or null where the directory holds nothing this cares about. */
function newestMtime(dir, skip = () => false) {
  let newest = null;
  const walk = (at) => {
    let entries;
    try {
      entries = fs.readdirSync(at, { withFileTypes: true });
    } catch {
      return; // absent or unreadable: the caller reads null as "no build"
    }
    for (const entry of entries) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (skip(entry.name)) continue;
      const { mtimeMs } = fs.statSync(full);
      if (newest === null || mtimeMs > newest) newest = mtimeMs;
    }
  };
  walk(dir);
  return newest;
}

/** A gap in the coarsest unit that still says something true about it. */
function ago(ms) {
  const seconds = Math.round(ms / MS);
  if (seconds < SEC_PER_MIN) return `${seconds}s ago`;
  const minutes = Math.round(seconds / SEC_PER_MIN);
  if (minutes < MIN_PER_HOUR) return `${minutes} min ago`;
  const hours = Math.round(minutes / MIN_PER_HOUR);
  if (hours < HOUR_PER_DAY) return `${hours}h ago`;
  return `${Math.round(hours / HOUR_PER_DAY)}d ago`;
}

const built = newestMtime(DIST);
const edited = newestMtime(SRC, (name) => name.endsWith(NOT_BUILT));
const always = process.argv.includes(ALWAYS);

let message = null;
if (built === null) {
  message = `cc-views: no dist/ yet, so this repo's own hook draws nothing and views show raw. Run \`${BUILD}\`.`;
} else if (edited !== null && edited > built) {
  message =
    `cc-views: src/ has moved since the last build (${ago(Date.now() - built)}). ` +
    `What you are about to read was drawn by the OLD engine. Run \`${BUILD}\`.`;
} else if (always) {
  // The standing fact, and the reason it is worth one line: a contributor's instinct is that seeing a change costs the
  // publish chain of docs/contributing/manual-checks.md. At the root it costs one build.
  message =
    `cc-views: this session is dressed by your own dist/, built ${ago(Date.now() - built)}. ` +
    `\`${BUILD}\` is the whole loop, no publish, no install. Another registered MessageDisplay hook can chain ` +
    `ahead of it: ask for \`${HEALTH_CHECK}\` and the box names the engine that drew it.`;
}

if (message !== null) process.stdout.write(JSON.stringify({ systemMessage: message }));
