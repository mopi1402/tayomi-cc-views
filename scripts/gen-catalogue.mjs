// The stable half of the catalogue, frozen into agent/catalogue.json.
//
// 100% generated, which is what lets its gate be a byte diff: --check regenerates in MEMORY and fails on any
// difference without touching the file, so a word added to the language and never regenerated cannot ship, and an
// entry left behind for a word since deleted fails the same way.
//
// It imports the BUILT module rather than reading TypeScript as text: the catalogue is assembled by the engine's own
// modules, so what is dumped here is what the engine executes.
//
// Run via `pnpm gen:catalogue` (write) or `pnpm check:catalogue` (gate, wired into `pnpm verify`).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stableCatalogue } from "../dist/index.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_DIR = "agent";
const OUT = path.join(ROOT, AGENT_DIR, "catalogue.json");
const REL = `${AGENT_DIR}/catalogue.json`;
const INDENT = 2;
const CHECK = "--check";
const WRITE_CMD = "pnpm gen:catalogue";

const wanted = `${JSON.stringify(stableCatalogue(), null, INDENT)}\n`;
const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : null;

if (process.argv.includes(CHECK)) {
  if (current === wanted) {
    console.log(`${REL} is up to date`);
    process.exit(0);
  }
  const why = current === null ? "missing" : "stale";
  console.error(`${REL} is ${why}: the engine no longer dumps what this file holds. Run \`${WRITE_CMD}\`.`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, wanted);
console.log(`${current === wanted ? "unchanged" : "wrote"} ${REL}`);
