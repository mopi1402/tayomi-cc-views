#!/usr/bin/env node
// The zero-config session edges: a host points SessionStart at `session.js start` and SessionEnd at `session.js end`,
// and the election's roster gets its bookends with no code of the host's own. A verb this file does not know exits
// clean and silent: this runs as a hook at a session's edge, where failing loud would cost the session more than the
// roster is worth, and the first flush recreates a missing signature anyway.

import { isDirectExecution } from "@tayomi/utils";
import { VERSION_FLAG, engineBadge } from "../data/engine.js";
import { runSessionEndHook, runSessionStartHook } from "../hook/session.js";

const START = "start";
const END = "end";
const VERB = 2;

async function main(): Promise<void> {
  if (process.argv.includes(VERSION_FLAG)) {
    process.stdout.write(`${engineBadge()}\n`);
    process.exit(0);
  }
  const verb = process.argv[VERB];
  if (verb === START) await runSessionStartHook();
  else if (verb === END) await runSessionEndHook();
  process.exit(0);
}

if (isDirectExecution(import.meta.url)) void main();
