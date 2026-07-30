// The per-message delta log, on disk.
//
// MessageDisplay streams a message in FLUSHES and each flush is a fresh process, so
// what the earlier flushes carried cannot be held in memory. It is on disk, keyed by
// message_id. What changed here is HOW.
//
// The store used to be one mutable file per message, {full, shown}, which every
// flush read, extended and rewrote. That is a read-modify-write over shared state,
// and the flushes are NOT serialised: read off the 2.1.220 bundle, the dispatcher
// keeps up to THREE hook calls in flight at once (an `inFlight >= 3` test is the only
// brake) and finalize() dispatches the LAST flush immediately, bypassing the 100 ms
// throttle that spaces the others. So the flush carrying a block's body and the flush
// carrying its closing fence routinely run side by side, both read the same state,
// and the second write wins. That lost update is not cosmetic: when the body is the
// update that loses, the closing fence lands right behind the opening one, the block
// parses as EMPTY, and the human gets an empty box on a message whose text was
// perfect (reproduced live on 2026-07-28, with the render marker reporting success).
//
// So there is no shared mutable state left. A flush writes its OWN delta under its
// OWN index, exactly once, and never touches another flush's file; a reader rebuilds
// the prefix it needs by concatenating indices 0..n-1. The order comes from the index
// Claude Code stamps on the payload rather than from whoever ran first, which is what
// makes a flush's output a function of the flush instead of a function of the
// schedule. Two properties of the protocol carry that, read off the 2.1.220 bundle
// and confirmed on a live turn: the message_id is stable across every flush of one
// message, and the index is zero-based, increments by one per flush, and has no holes
// (a flush the dispatcher declines to send does not advance its offset, so the text
// arrives with the next one instead of being skipped).
//
// The one thing a reader still waits on is a PREDECESSOR that has not written yet,
// since spawn jitter can invert two processes that were dispatched in order. The wait
// is bounded and short: a flush writes its delta before doing anything else, so the
// window is one process startup wide.

import fs from "node:fs";
import path from "node:path";
import { DEFAULT_STATE_DIR } from "./scratch.js";

// Its own subdirectory of the host's state dir, so everything under it belongs to
// this module and a sweep by age can never reach another file of the same dir (the
// probed terminal width lives in the state dir itself, and a host may keep files of
// its own beside it). The dir is a trailing parameter on every function rather than
// module state: each caller of one flush passes the same host config it renders with.
function streamDir(stateDir: string): string {
  return path.join(stateDir, "stream");
}

/** How long a reader waits for a predecessor's delta before giving up on it. */
export const WAIT_MS = 250;
const POLL_MS = 5;

/**
 * When a message directory is old enough to be garbage rather than in flight. A
 * message streams in seconds; anything at this age was abandoned mid-stream (the
 * dispatcher aborts a message when a new one begins, and that path sends no final
 * flush, so nothing would ever delete it).
 */
export const STALE_MS = 60 * 60 * 1000;

/** The prefix rebuilt for a flush, and whether every delta before it was there. */
export interface Prefix {
  text: string;
  complete: boolean;
}

function messageDir(id: string, stateDir: string): string {
  return path.join(streamDir(stateDir), id.replace(/[^\w.-]/g, "_"));
}

function deltaPath(dir: string, index: number): string {
  return path.join(dir, `${index}`);
}

/**
 * Record this flush's delta under its index. Write-once and atomic: the text lands in
 * a private temporary file and is RENAMED into place, so a reader either does not see
 * the file at all or sees it whole, and two processes never write the same path.
 *
 * Total by construction, like every write in this scratch dir: a failure costs the
 * successors one incomplete prefix, which they handle, and never an error on screen.
 */
export function recordDelta(
  id: string,
  index: number,
  delta: string,
  stateDir: string = DEFAULT_STATE_DIR
): void {
  const dir = messageDir(id, stateDir);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const target = deltaPath(dir, index);
    const tmp = `${target}.${process.pid}.part`;
    fs.writeFileSync(tmp, delta, "utf8");
    fs.renameSync(tmp, target);
  } catch {
    // best effort by construction
  }
}

/**
 * The text of every flush BEFORE `index`, in index order, or an incomplete prefix
 * when one of them has not landed yet.
 *
 * On a hole it returns no text at all rather than the part it could read: a caller
 * that used a partial prefix would compute an offset into text the screen does not
 * hold, and mis-slicing is the failure this whole module exists to remove.
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
 * readEarlier, with a bounded wait for a predecessor that is still starting up.
 *
 * The wait exists because dispatch order does not guarantee arrival order: process
 * i-1 and process i are spawned milliseconds apart and either can reach its first
 * write first. It is bounded because a predecessor that never writes is a predecessor
 * that died, and waiting longer would only delay the fail-open the caller does next.
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
 * Drop the message directories nothing will ever come back for.
 *
 * A message abandoned mid-stream gets no final flush, so without this the scratch dir
 * grows for as long as the machine is up (the previous format left hundreds of files
 * behind). Swept on the final flush of another message, which costs one readdir on a
 * directory that holds at most a handful of live entries.
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
