// The COMPOSITION's shared state: the pieces each speaker publishes for the zones it won, and the record the assembler
// splices them back from. One voice per flush is the invariant the whole protocol buys (docs/caveats.md): the
// dispatcher keeps the LAST defined answer wholesale, so two engines answering one flush is one overwriting the other,
// and the flush that carries the seam between two engines' zones painted one of them raw.
//
// The discipline is stream-state.ts's, for the same reason: several processes share these files and none may ever
// read-modify-write one. A piece is written ONCE, atomically, under a name both sides compute alone: the message, the
// carrier, the view, and the zone's ORDINAL among that view's zones on that carrier. An ordinal and never an offset,
// because the two sides read the zone in different texts: the winner meets it after its own renders rewrote everything
// above, the assembler scans the message as written, and an offset stops naming the same characters the moment one
// render changes length. What both walks preserve is the ORDER of a view's zones. The store lives under the election
// register (peers.ts) because it is the same conversation between the same engines, and because the register's
// redirect (a harness's engines elect among themselves) must cover the pieces too, or a test's engines would compose
// against the machine's.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { composeRole, peersDir } from "./peers.js";
import { journal } from "./journal.js";
import { writeAtomic } from "./atomic.js";

/**
 * One zone's replacement, as the winner rendered it: the text to splice, and the count of SOURCE lines it consumed.
 * Lines and never an offset, for the same reason the key is an ordinal: the zone's own lines read verbatim on both
 * sides, and they are the one ruler the two walks share.
 */
export interface Piece {
  span: number;
  text: string;
}

/** The two carriers a zone can ride, spelled by the store because the key is the store's own naming. */
export const FENCED_ZONE = "fenced";
export const DECORATED_ZONE = "decorated";
export type ZoneKind = typeof FENCED_ZONE | typeof DECORATED_ZONE;

/**
 * The name a zone's piece is filed under: the carrier, the view, and the zone's ordinal among that view's zones on
 * that carrier, in the order written. Every part is filename-safe by construction: a view name is `[\w-]+` before any
 * carrier engages it, and the parts can never impersonate each other, the ordinal being the one part that is digits.
 */
export function zoneKey(kind: ZoneKind, view: string, ordinal: number): string {
  return `${kind}-${view}-${ordinal}`;
}

/** Under the register: the same engines, the same redirect, one conversation. */
const COMPOSE_DIR = "compose";

/** Long enough that no two message ids collide, short enough to stay a filename. The id is another program's word: hashed, never trusted as a path. */
const KEY_LEN = 32;
const DIGEST = "sha256";

/**
 * The RAW verdict, recorded beside the piece it stands for. Two writers reach for it and mean the same thing: a winner
 * declining its own zone (fail-open), and the assembler giving up a wait. Its EXISTENCE is the word; the file is empty.
 * A separate name rather than a piece variant, so the assembler's give-up never races the winner's render on one file.
 */
const RAW_MARK = ".raw";

/**
 * How long the assembler waits for a piece still owed. Sized like stream-state's WAIT_MS and for the same storm: the
 * winner is rendering this same flush in a sibling process, and a cold diagram draw pins the CPU. Its own constant all
 * the same: two waits sharing one number is one of them changing for the other's reason.
 */
export const PIECE_WAIT_MS = 1000;
const POLL_MS = 5;

/** When a message's pieces are garbage rather than in flight: a message streams in seconds. */
export const COMPOSE_STALE_MS = 60 * 60 * 1000;

/** Where message `id`'s pieces live. EXPORTED so a sidecar can name the store instead of recomputing the digest. */
export function composeMessageDir(messageId: string, dir: string = peersDir()): string {
  return path.join(dir, COMPOSE_DIR, createHash(DIGEST).update(messageId).digest("hex").slice(0, KEY_LEN));
}

/** Where the zone under `key` keeps its piece. */
export function piecePath(messageId: string, key: string, dir: string = peersDir()): string {
  return path.join(composeMessageDir(messageId, dir), key);
}

/** Where the zone's RAW verdict sits. EXPORTED so a sidecar names the record instead of respelling the mark. */
export function rawVerdictPath(messageId: string, key: string, dir: string = peersDir()): string {
  return piecePath(messageId, key, dir) + RAW_MARK;
}

/**
 * Write once and atomically, or not at all: the FIRST word on a zone stands, because a later rewrite could flip a zone
 * the assembler already spliced onto a screen that cannot be taken back. Total: a piece that cannot be written costs
 * the assembler one bounded wait and the zone one raw render, never an error.
 */
function writeOnce(file: string, body: string): void {
  try {
    if (fs.existsSync(file)) return;
    writeAtomic(file, body);
  } catch {
    // best effort by construction
  }
}

// This flush's message, installed by the hook edge beside the election's own state and for the same reason: a flush is
// one synchronous pass in a process of its own. Null means composition holds no store this flush.
let MESSAGE: { id: string; dir: string } | null = null;

// What the assembler resolved in its pre-pass, read per zone by the carriers as they splice. A key absent from the
// map is a zone settled RAW: left exactly as written.
let PIECES: ReadonlyMap<string, Piece> = new Map();

/** Install the message this flush composes under, or null to stand down. Resets the pieces: they belong to a pre-pass. */
export function setComposition(messageId: string | null, dir: string = peersDir()): void {
  MESSAGE = messageId === null ? null : { id: messageId, dir };
  PIECES = new Map();
}

/**
 * Publish the piece for a zone this SPEAKER won: what it rendered, over the span it consumed. A no-op in every other
 * role, so the carriers call it unconditionally from the exact points where a zone's fate is decided.
 */
export function publishPiece(key: string, span: number, text: string): void {
  if (composeRole() !== "speaker" || MESSAGE === null) return;
  writeOnce(piecePath(MESSAGE.id, key, MESSAGE.dir), JSON.stringify({ span, text }));
  journal("piece", { msg: MESSAGE.id, key, span }, MESSAGE.dir);
}

/**
 * Publish the RAW verdict for a zone this SPEAKER won and declines: its own fail-open, told to the assembler so the
 * wait ends now instead of at the budget. The zone shows as written, which is what fail-open has always meant.
 */
export function publishRaw(key: string): void {
  if (composeRole() !== "speaker" || MESSAGE === null) return;
  writeOnce(rawVerdictPath(MESSAGE.id, key, MESSAGE.dir), "");
  journal("declined", { msg: MESSAGE.id, key }, MESSAGE.dir);
}

/** A piece file's word, or null for one missing or unreadable: the caller keeps waiting, the budget decides. */
function readPiece(file: string): Piece | null {
  try {
    const read: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    const piece = read as Partial<Piece> | null;
    if (typeof piece?.span !== "number" || typeof piece.text !== "string") return null;
    return { span: piece.span, text: piece.text };
  } catch {
    return null;
  }
}

/**
 * The assembler's pre-pass: resolve every zone the election owes a peer, waiting BOUNDED for the pieces still owed.
 * One budget for the whole flush, not one per zone: the winners render in sibling processes of this same flush, in
 * parallel, so the slowest of them is the wait, not the sum.
 *
 * A wait that expires is recorded as a RAW verdict, write-once, and that record is the screen's consistency: what this
 * flush leaves raw must stay raw when the next flush re-derives what the screen already shows, even though the piece
 * may land a millisecond after the budget. Irrevocable on purpose, the price one late zone pays so no zone is ever
 * painted twice.
 *
 * Async and in the runner's storey, deliberately: the carriers splice synchronously from what this installed, so no
 * render ever blocks mid-walk.
 */
export async function gatherPieces(zoneKeys: string[], budgetMs: number = PIECE_WAIT_MS): Promise<void> {
  PIECES = new Map();
  if (composeRole() !== "assembler" || MESSAGE === null || zoneKeys.length === 0) return;
  const { id, dir } = MESSAGE;
  const found = new Map<string, Piece>();
  const declined: string[] = [];
  let pending = [...new Set(zoneKeys)];
  let waited = 0;
  for (;;) {
    pending = pending.filter((key) => {
      try {
        if (fs.existsSync(rawVerdictPath(id, key, dir))) {
          declined.push(key);
          return false; // settled raw: absent from the map
        }
        const piece = readPiece(piecePath(id, key, dir));
        if (piece === null) return true;
        found.set(key, piece);
        return false;
      } catch {
        return true; // unreadable now is not unreadable forever: the budget decides
      }
    });
    if (pending.length === 0 || waited >= budgetMs) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    waited += POLL_MS;
  }
  for (const key of pending) writeOnce(rawVerdictPath(id, key, dir), ""); // the give-up, recorded so the screen stays re-derivable
  const keysWord = (keys: Iterable<string>): string => [...keys].join(",") || "none";
  journal(
    "gather",
    { msg: id, waited, found: keysWord(found.keys()), declined: keysWord(declined), expired: keysWord(pending) },
    dir
  );
  PIECES = found;
}

/**
 * The piece the ASSEMBLER splices for the zone under `key`, or undefined for a zone left exactly as written: a raw
 * verdict, a wait that expired, or any other role asking. The carriers' one question.
 */
export function pieceFor(key: string): Piece | undefined {
  if (composeRole() !== "assembler") return undefined;
  return PIECES.get(key);
}

/**
 * Forget one message's pieces surgically. The runner never calls this: a final flush dropping the store starves the
 * DUPLICATE of its own engine still gathering from it, whose expired wait then paints the drawn zone raw (measured
 * 2026-08-14). Production forgets by AGE alone (sweepCompose); this is for a harness cleaning the ids it wrote.
 */
export function dropComposition(messageId: string, dir: string = peersDir()): void {
  try {
    fs.rmSync(composeMessageDir(messageId, dir), { recursive: true, force: true });
  } catch {
    // already gone: nothing to forget
  }
}

/**
 * Drop the piece stores nothing will come back for: the ONLY forgetting production runs. By age and never by message,
 * because a finished message's store may still be feeding a duplicate of this same engine, wired twice by human hands.
 */
export function sweepCompose(maxAgeMs = COMPOSE_STALE_MS, dir: string = peersDir()): void {
  try {
    const now = Date.now();
    const store = path.join(dir, COMPOSE_DIR);
    for (const name of fs.readdirSync(store)) {
      const entry = path.join(store, name);
      try {
        if (now - fs.statSync(entry).mtimeMs > maxAgeMs) {
          fs.rmSync(entry, { recursive: true, force: true });
        }
      } catch {
        // vanished under us, or unreadable: not this sweep's problem
      }
    }
  } catch {
    // no store yet: nothing to sweep
  }
}
