// Every module answers for itself: `foo.ts` is tested by `foo.test.ts` beside it, or it says IN WRITING why it is not.
//
// Coverage measures lines executed, which a suite driving the engine from the top satisfies without pinning one
// module's edge. This asks the coarser question, and bites in BOTH directions or the exclusion list rots into excuses:
// an entry naming a file that has gained a test, or no longer exists, fails too.
//
// Run via `pnpm check:sidecars`, wired into `pnpm verify`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "src";
const TEST_EXT = ".test.ts";
const SOURCE_EXT = ".ts";

/**
 * A module with no edge of its own to state, each with the reason it has none. A
 * reason is what makes this a decision rather than a backlog: anything that reads
 * "not yet" belongs in the suite, not here.
 */
const EXCLUDED = {
  "src/bin/cli.ts":
    "an executable's wiring: a shebang and a main() guard over parts tested elsewhere, and importing it RUNS it",
  "src/bin/messagedisplay.ts":
    "an executable's wiring: a shebang and a main() guard over parts tested elsewhere, and importing it RUNS it",
  "src/bin/session.ts":
    "an executable's wiring: a shebang and a main() guard over parts tested elsewhere, and importing it RUNS it",
  "src/data/markup.ts":
    "one word and the tokens derived from it, with no behaviour: a test here would restate the constants it reads",
  "src/options.ts": "a public interface: types and JSDoc, no runtime behaviour to state",
};

// Where a suite answering for a PATH rather than for a module lives. Exempt by
// LOCATION rather than by an allowlist: a list of blessed filenames is a second place
// to keep in step, and the directory already says which kind of test a file is.
//
// Integration, not end to end: these still run in-process, over the engine's own
// entry points. The end-to-end gate is scripts/verify-pack.mjs, which packs, installs
// and spawns the real binary, and it is the only thing here that crosses a process.
const INTEGRATION_DIR = "tests";

const walk = (dir) =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return walk(rel);
    return e.isFile() && rel.endsWith(SOURCE_EXT) ? [rel] : [];
  });

const files = walk(SRC);
const sources = files.filter((f) => !f.endsWith(TEST_EXT));
const tests = new Set(files.filter((f) => f.endsWith(TEST_EXT)));
const sidecar = (source) => source.slice(0, -SOURCE_EXT.length) + TEST_EXT;

const failures = [];
const report = (title, items) => {
  if (items.length > 0) failures.push([title, items]);
};

report(
  "no sidecar, and no exclusion saying why",
  sources.filter((s) => !tests.has(sidecar(s)) && EXCLUDED[s] === undefined)
);

report(
  "excluded, yet a sidecar now exists: drop the entry",
  Object.keys(EXCLUDED).filter((s) => tests.has(sidecar(s)))
);

report(
  "excluded, yet the file is gone: drop the entry",
  Object.keys(EXCLUDED).filter((s) => !sources.includes(s))
);

report(
  `a test beside no source: move it under ${INTEGRATION_DIR}/, or beside its module`,
  [...tests].filter((t) => !sources.includes(t.slice(0, -TEST_EXT.length) + SOURCE_EXT))
);

if (failures.length > 0) {
  for (const [title, items] of failures) {
    console.error(`\ncheck-sidecars: ${title}`);
    for (const item of items) console.error(`  ${item}`);
  }
  console.error(`\ncheck-sidecars: FAIL (${failures.reduce((n, [, i]) => n + i.length, 0)})`);
  process.exit(1);
}

const integration = fs.existsSync(path.join(ROOT, INTEGRATION_DIR))
  ? walk(INTEGRATION_DIR).filter((f) => f.endsWith(TEST_EXT)).length
  : 0;
const covered = sources.length - Object.keys(EXCLUDED).length;
console.log(
  `check-sidecars: PASS (${covered} modules with a sidecar, ` +
    `${Object.keys(EXCLUDED).length} excluded, ${integration} integration)`
);
