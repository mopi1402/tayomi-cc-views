// The engine's flight recorder: one line per event, appended under the register, so a display gone wrong is READ
// instead of theorised about (it convicted the duplicate-hook overwrite of 2026-08-14 on its first day). Silent
// unless the operator sets the DEBUG flag: an engine in good health owes the machine no writes. Best effort
// everywhere, because recording must never cost a render. No message TEXT ever lands here: ids, roles, durations.

import fs from "node:fs";
import path from "node:path";
import { DEBUG_ENV } from "../data/markup.js";
import { peersDir, SELF } from "./peers.js";

// A directory of its own under the register: claims() reads the register's FILES, and a journal is not a claim.
const JOURNAL_DIR = "journal";
const JOURNAL_FILE = "log";

/** One previous generation survives rotation: the line that matters is often just before the cap. */
const JOURNAL_KEEP = "log.1";

/** Past this the log rotates instead of growing: the recorder stays harmless on a machine that never reads it. */
export const JOURNAL_CAP_BYTES = 256 * 1024;

/** What a journal line can carry: words, never structures. A reader greps this file, no parser ever will. */
export type JournalFields = Record<string, string | number | boolean>;

/** Where the recorder writes, under the same redirect as the register: a harness journals beside its own election. */
export function journalPath(dir: string = peersDir()): string {
  return path.join(dir, JOURNAL_DIR, JOURNAL_FILE);
}

/** Record one event: timestamp, pid, engine version, then the caller's words. Never throws, never blocks a render. */
export function journal(event: string, fields: JournalFields = {}, dir: string = peersDir()): void {
  try {
    const on = process.env[DEBUG_ENV];
    if (on === undefined || on === "") return;
    const file = journalPath(dir);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      if (fs.statSync(file).size > JOURNAL_CAP_BYTES) {
        fs.renameSync(file, path.join(path.dirname(file), JOURNAL_KEEP));
      }
    } catch {
      // no log yet: nothing to rotate
    }
    const words = Object.entries(fields).map(([key, value]) => `${key}=${String(value)}`);
    const line = [new Date().toISOString(), `pid=${process.pid}`, `v=${SELF.version}`, event, ...words];
    fs.appendFileSync(file, line.join(" ") + "\n", "utf8");
  } catch {
    // best effort by construction: a journal that cannot be written silences nobody
  }
}
