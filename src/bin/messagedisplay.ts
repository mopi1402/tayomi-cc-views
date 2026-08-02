#!/usr/bin/env node
// The zero-config MessageDisplay edge: an adopter points their hooks.json at this file and gets the whole pipeline
// (views, {{tags}}, streaming reassembly) with no code of their own. No host, so every block renders from its own text;
// default options, so templates resolve from CLAUDE_PLUGIN_ROOT/views and the state lives in the package's own scratch
// dir.
//
// This file is the ONE main() of this package and must never be imported: the guard is what keeps it safe inside a
// bundle (two main() in one process steal each other's stdin).

import { isDirectExecution } from "@tayomi/utils";
import { runMessageDisplayHook } from "../hook/runner.js";

async function main(): Promise<void> {
  await runMessageDisplayHook();
  process.exit(0);
}

if (isDirectExecution(import.meta.url)) void main();
