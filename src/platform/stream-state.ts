// The per-message delta log, on disk: each flush is a fresh process, so what the earlier ones carried cannot be held in
// memory. NO shared mutable state, which is the whole design. A flush writes its OWN delta under its OWN index, exactly
// once; a reader concatenates 0..n-1.
//
// The facts that force it, read off the 2.1.220 bundle: the dispatcher keeps up to THREE hook calls in flight and
// finalize() bypasses the throttle, so a mutable per-message file was read-modify-written by racing flushes and the
// second write won, leaving an EMPTY box on a perfect message. message_id is stable across every flush and the index is
// zero-based with no holes, which is what makes ordering a function of the payload rather than of the schedule.

import fs from "node:fs";
import path from "node:path";
import { DEFAULT_STATE_DIR } from "./scratch.js";
import { writeAtomic } from "./atomic.js";

// Its own subdirectory, so a sweep by age can never reach another file of the state dir (the probed terminal width
// lives there, and a host may keep files of its own beside it).
function streamDir(stateDir: string): string {
  return path.join(stateDir, "stream");
}

/** How long a reader waits for a predecessor's delta before giving up on it. */
export const WAIT_MS = 250;
const POLL_MS = 5;

/**
 * When a message directory is garbage rather than in flight: a message streams in seconds, so anything this old was
 * abandoned mid-stream, and that path sends no final flush.
 */
export const STALE_MS = 60 * 60 * 1000;

export interface Prefix {
  text: string;
  complete: boolean;
}

/**
 * Anything a message id may NOT put in a path. A host chooses the id, so a separator or a `..` in one would reach
 * outside the scratch dir. Folded rather than rejected, which keeps the naming total.
 */
const UNSAFE_IN_ID = /[^\w.-]/g;
const SAFE_CHAR = "_";

function messageDir(id: string, stateDir: string): string {
  return path.join(streamDir(stateDir), id.replace(UNSAFE_IN_ID, SAFE_CHAR));
}

function deltaPath(dir: string, index: number): string {
  return path.join(dir, `${index}`);
}

/**
 * Record this flush's delta under its index. Write-once and atomic: the text lands in a private temporary file and is
 * RENAMED into place, so a reader either does not see the file or sees it whole. Total by construction, a failure
 * costing the successors one incomplete prefix rather than an error on screen.
 */
export function recordDelta(
  id: string,
  index: number,
  delta: string,
  stateDir: string = DEFAULT_STATE_DIR
): void {
  const dir = messageDir(id, stateDir);
  try {
    writeAtomic(deltaPath(dir, index), delta);
  } catch {
    // best effort by construction
  }
}

/**
 * The text of every flush BEFORE `index`, in index order. On a hole it returns no text at all rather than the part it
 * could read: a caller using a partial prefix would compute an offset into text the screen does not hold.
 */
export function readEarlier(
  id: string,
  index: number,
  stateDir: string = DEFAULT_STATE_DIR
): Prefix {
  const dir = messageDir(id, stateDir);
  let text = "";
  for (let i = 0; i < index; i++) {
    try {
      text += fs.readFileSync(deltaPath(dir, i), "utf8");
    } catch {
      return { text: "", complete: false };
    }
  }
  return { text, complete: true };
}

/**
 * readEarlier, with a bounded wait: process i-1 and process i are spawned milliseconds apart and either can reach its
 * first write first. Bounded, because a predecessor that never writes is one that died.
 */
export async function awaitEarlier(
  id: string,
  index: number,
  budgetMs = WAIT_MS,
  stateDir: string = DEFAULT_STATE_DIR
): Promise<Prefix> {
  let waited = 0;
  for (;;) {
    const prefix = readEarlier(id, index, stateDir);
    if (prefix.complete || waited >= budgetMs) return prefix;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    waited += POLL_MS;
  }
}

/** Forget a finished message. Called on the final flush, which is the only flush that knows. */
export function dropMessage(id: string, stateDir: string = DEFAULT_STATE_DIR): void {
  try {
    fs.rmSync(messageDir(id, stateDir), { recursive: true, force: true });
  } catch {
    // already gone: nothing to forget
  }
}

/**
 * Drop the message directories nothing will ever come back for: a message abandoned mid-stream gets no final flush, so
 * without this the scratch dir grows for as long as the machine is up.
 */
export function sweepStale(maxAgeMs = STALE_MS, stateDir: string = DEFAULT_STATE_DIR): void {
  try {
    const now = Date.now();
    const dir = streamDir(stateDir);
    for (const name of fs.readdirSync(dir)) {
      const entry = path.join(dir, name);
      try {
        if (now - fs.statSync(entry).mtimeMs > maxAgeMs) {
          fs.rmSync(entry, { recursive: true, force: true });
        }
      } catch {
        // vanished under us, or unreadable: not this sweep's problem
      }
    }
  } catch {
    // no directory yet: nothing to sweep
  }
}
