#!/usr/bin/env node
// The engine's command line, for whoever is WRITING a view: `dict` prints what this install can do, the language and
// the views this search path resolves, as JSON on stdout.
//
// Wiring only, like the other bin/: a main() guard over parts tested elsewhere, and importing it RUNS it. What it
// prints is src/catalogue.ts, and the contract is written there.

import { isDirectExecution } from "@tayomi/utils";
import { liveCatalogue } from "../catalogue.js";
import { VIEWS } from "../data/markup.js";

const BIN = `cc-${VIEWS}`;
const DICT = "dict";
const INDENT = 2;
const USAGE_EXIT = 2;

function main(argv: string[]): number {
  if (argv[0] === DICT) {
    process.stdout.write(`${JSON.stringify(liveCatalogue(), null, INDENT)}\n`);
    return 0;
  }
  process.stderr.write(`usage: ${BIN} ${DICT}\n`);
  return USAGE_EXIT;
}

if (isDirectExecution(import.meta.url)) process.exit(main(process.argv.slice(2)));
