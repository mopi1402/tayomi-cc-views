#!/usr/bin/env node
// The zero-config MessageDisplay edge: an adopter points their hooks.json at this file and gets the whole pipeline
// (views, {{tags}}, streaming reassembly) with no code of their own. No host, so every block renders from its own text;
// default options, so templates resolve from CLAUDE_PLUGIN_ROOT/views and the state lives in the package's own scratch
// dir.
//
// This file is the ONE main() of this package and must never be imported: the guard is what keeps it safe inside a
// bundle (two main() in one process steal each other's stdin).

import { isDirectExecution } from "@tayomi/utils";
import { VERSION_FLAG, engineBadge } from "../data/engine.js";
import { runMessageDisplayHook } from "../hook/runner.js";

async function main(): Promise<void> {
  // Answered here and not in the runner: this is the copy a hook SPAWNS, and asking it costs nothing only while the
  // question is settled before stdin is read, which otherwise blocks on a terminal.
  if (process.argv.includes(VERSION_FLAG)) {
    process.stdout.write(`${engineBadge()}\n`);
    process.exit(0);
  }
  await runMessageDisplayHook();
  process.exit(0);
}

if (isDirectExecution(import.meta.url)) void main();
