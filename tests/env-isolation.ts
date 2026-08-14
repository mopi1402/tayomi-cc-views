// Every vitest worker runs in an environment of its OWN, twice over.
//
// First the operator's dress dies: a session launched with a theme, a width or a debug flag leaks its environment
// into every child it spawns, this suite included, and the oracles here assert the UNPAINTED render (a theme turned
// four of them red on 2026-08-15). Every variable of the engine's family goes, whatever it is: any of them can
// repaint, resize or silence what a fixture pinned.
//
// Then the register redirect: every worker elects in a register of its own. Without it, any test crossing the hook
// edge announced to the machine-wide register, and a checkout ahead of the installed engines left a ghost that won
// every election for an hour: real sessions falling back to prose because a test suite ran.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ENGINES_DIR_ENV, ENV_PREFIX } from "../src/data/markup.js";

for (const name of Object.keys(process.env)) {
  if (name.startsWith(ENV_PREFIX)) delete process.env[name];
}

process.env[ENGINES_DIR_ENV] = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-register-"));
