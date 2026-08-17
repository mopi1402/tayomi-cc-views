#!/usr/bin/env node
// The engine's command line, for whoever is WRITING a view: `dict` prints what this install can do, the language and
// the views this search path resolves, as JSON on stdout. `check` runs a view against a sample block and answers with
// the SHAPE it resolved to, then the REASON it will not draw, nothing further when there is none. `--version` names
// the copy that answered.
//
// Wiring only, like the other bin/: a main() guard over parts tested elsewhere, and importing it RUNS it. What it
// prints is src/catalogue.ts and src/check.ts, and the contract is written there.

import { isDirectExecution } from "@tayomi/utils";
import fs from "node:fs";
import { liveCatalogue } from "../catalogue.js";
import { check, checkAll, failed, report, takes } from "../check.js";
import { VERSION_FLAG, engineBadge } from "../data/engine.js";
import { VIEWS } from "../data/markup.js";

const BIN = `cc-${VIEWS}`;
const DICT = "dict";
const CHECK = "check";
const ALL = "--all";
const SAMPLE_GLOB = "<view>.md";
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
  // A whole set of views in one run, for a repo gating its OWN views: `<view>.md` holds the block that feeds `<view>`.
  // A sweep answering for nothing is a FAILURE and not a quiet pass, since an empty directory is exactly what a gate
  // pointed at the wrong path looks like, and it would report green forever.
  if (argv[0] === CHECK && argv[1] === ALL) {
    const dir = argv[2];
    if (dir === undefined) return usage();
    let swept;
    try {
      swept = checkAll(dir);
    } catch (e) {
      // A path it cannot read, reported as the refusal it is: an aimed-at-nothing gate must never exit green, and a
      // stack trace answers a question nobody asked.
      process.stderr.write(`${BIN}: ${e instanceof Error ? e.message : String(e)}\n`);
      return REFUSED_EXIT;
    }
    for (const { name: view, findings } of swept) {
      for (const f of findings) process.stderr.write(`${report(view, f)}\n`);
    }
    if (swept.length === 0) {
      process.stderr.write(`${BIN}: no ${SAMPLE_GLOB} sample in ${dir}\n`);
      return REFUSED_EXIT;
    }
    process.stderr.write(`${BIN}: ${swept.length} views swept\n`);
    return swept.some((s) => failed(s.findings)) ? REFUSED_EXIT : 0;
  }
  if (argv[0] === CHECK && name !== undefined) {
    // The SHAPE first, before any verdict: a view is SCORED into one rather than declaring it, so an author reading
    // "takes a quote payload" on a view they wrote for a table has their answer without a sample to reproduce it with.
    const shape = takes(name);
    if (shape !== null) process.stderr.write(`${name}: ${shape}\n`);
    // On stderr, so a caller may read the render on stdout one day without filtering the verdict out of it.
    const findings = check(name, sample(argv[2]));
    for (const f of findings) process.stderr.write(`${report(name, f)}\n`);
    return failed(findings) ? REFUSED_EXIT : 0;
  }
  return usage();
}

function usage(): number {
  process.stderr.write(
    `usage: ${BIN} ${DICT}\n       ${BIN} ${CHECK} <view> [block]\n       ${BIN} ${CHECK} ${ALL} <dir of ${SAMPLE_GLOB}>\n       ${BIN} ${VERSION_FLAG}\n`,
  );
  return USAGE_EXIT;
}

if (isDirectExecution(import.meta.url)) process.exit(main(process.argv.slice(2)));
