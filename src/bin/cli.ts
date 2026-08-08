#!/usr/bin/env node
// The engine's command line, for whoever is WRITING a view: `dict` prints what this install can do, the language and
// the views this search path resolves, as JSON on stdout. `check` runs a view against a sample block and answers with
// the REASON it will not draw, silently when there is none. `--version` names the copy that answered.
//
// Wiring only, like the other bin/: a main() guard over parts tested elsewhere, and importing it RUNS it. What it
// prints is src/catalogue.ts and src/check.ts, and the contract is written there.

import { isDirectExecution } from "@tayomi/utils";
import fs from "node:fs";
import { liveCatalogue } from "../catalogue.js";
import { check, failed, report } from "../check.js";
import { VERSION_FLAG, engineBadge } from "../data/engine.js";
import { VIEWS } from "../data/markup.js";

const BIN = `cc-${VIEWS}`;
const DICT = "dict";
const CHECK = "check";
const INDENT = 2;
const USAGE_EXIT = 2;
const REFUSED_EXIT = 1;
const STDIN = 0;

/**
 * The sample block: the second argument, or a PIPE when there is none. Never a terminal, where reading would hang on an
 * author who has no block to give, and a view spending no slot is exactly that case.
 */
function sample(given: string | undefined): string {
  if (given !== undefined) return given;
  return process.stdin.isTTY === true ? "" : fs.readFileSync(STDIN, "utf8");
}

function main(argv: string[]): number {
  if (argv[0] === VERSION_FLAG) {
    process.stdout.write(`${engineBadge()}\n`);
    return 0;
  }
  if (argv[0] === DICT) {
    process.stdout.write(`${JSON.stringify(liveCatalogue(), null, INDENT)}\n`);
    return 0;
  }
  const name = argv[1];
  if (argv[0] === CHECK && name !== undefined) {
    // On stderr, so a caller may read the render on stdout one day without filtering the verdict out of it.
    const findings = check(name, sample(argv[2]));
    for (const f of findings) process.stderr.write(`${report(name, f)}\n`);
    return failed(findings) ? REFUSED_EXIT : 0;
  }
  process.stderr.write(
    `usage: ${BIN} ${DICT}\n       ${BIN} ${CHECK} <view> [block]\n       ${BIN} ${VERSION_FLAG}\n`,
  );
  return USAGE_EXIT;
}

if (isDirectExecution(import.meta.url)) process.exit(main(process.argv.slice(2)));
