// What this module owes the carriers above it: a piece published exactly once per zone a speaker won, and a splice
// that never disagrees with what an earlier flush left on screen. The half with teeth is the RAW verdict: a wait that
// expires must stay expired, because the pixels it left raw cannot be taken back, and a piece landing a millisecond
// late must never flip a zone the next flush re-derives.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setComposeRole } from "./peers.js";
import {
  COMPOSE_STALE_MS,
  DECORATED_ZONE,
  FENCED_ZONE,
  composeMessageDir,
  dropComposition,
  gatherPieces,
  pieceFor,
  piecePath,
  publishPiece,
  publishRaw,
  rawVerdictPath,
  setComposition,
  sweepCompose,
  zoneKey,
  type Piece,
} from "./compose.js";

const MSG = "msg-1";
/** A zone's identity: its carrier, its view, its ordinal among that view's zones. */
const AT = zoneKey(DECORATED_ZONE, "tldr", 0);
const OTHER_AT = zoneKey(FENCED_ZONE, "tldr", 1);
/** A budget that makes an expiry cheap to test: the poll runs at least once, the wait stays milliseconds. */
const TINY_BUDGET_MS = 10;

let dir = "";

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-compose-"));
  setComposition(MSG, dir);
});

afterEach(() => {
  setComposeRole("off");
  setComposition(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Any zone extent tells the story: what a winner would leave is rendered text over the lines it consumed. */
const SPAN = 3;
const piece = (text = "drawn"): Piece => ({ span: SPAN, text });

/** The store's own word for a settled-raw zone, asked of the owner rather than respelled. */
const rawMarkAt = (at: string): string => rawVerdictPath(MSG, at, dir);

describe("where the store lives", () => {
  it("keeps a message's pieces under the register, keyed by the message and never by its raw name", () => {
    // The id is another program's word: hashed on the way to disk, so no id can climb out of the register.
    const store = composeMessageDir(`../escape`, dir);
    expect(store.startsWith(path.join(dir, "compose"))).toBe(true);
    expect(store.includes("..")).toBe(false);
  });

  it("names a piece by its zone's key, computable alone from either side", () => {
    expect(piecePath(MSG, AT, dir)).toBe(path.join(composeMessageDir(MSG, dir), AT));
  });
});

describe("publishing, the speaker's half", () => {
  it("writes the piece a SPEAKER won, and the first word on a zone stands", () => {
    setComposeRole("speaker");
    publishPiece(AT, SPAN, "first");
    publishPiece(AT, SPAN, "second");
    expect(JSON.parse(fs.readFileSync(piecePath(MSG, AT, dir), "utf8"))).toEqual({
      span: SPAN,
      text: "first",
    });
  });

  it("writes nothing in any other role: the carriers call it unconditionally", () => {
    setComposeRole("off");
    publishPiece(AT, SPAN, "drawn");
    setComposeRole("assembler");
    publishPiece(AT, SPAN, "drawn");
    expect(fs.existsSync(piecePath(MSG, AT, dir))).toBe(false);
  });

  it("writes nothing with no message installed, which is every flush composition stood down on", () => {
    setComposeRole("speaker");
    setComposition(null);
    publishPiece(AT, SPAN, "drawn");
    expect(fs.existsSync(piecePath(MSG, AT, dir))).toBe(false);
  });

  it("records a winner's own fail-open as the RAW verdict, so the assembler stops waiting now", () => {
    setComposeRole("speaker");
    publishRaw(AT);
    expect(fs.existsSync(rawMarkAt(AT))).toBe(true);
  });
});

describe("gathering, the assembler's half", () => {
  beforeEach(() => setComposeRole("assembler"));

  it("resolves a published piece, read back per zone by the splice", async () => {
    fs.mkdirSync(composeMessageDir(MSG, dir), { recursive: true });
    fs.writeFileSync(piecePath(MSG, AT, dir), JSON.stringify(piece()), "utf8");
    await gatherPieces([AT], TINY_BUDGET_MS);
    expect(pieceFor(AT)).toEqual(piece());
  });

  it("waits for a piece still owed: the winner renders this same flush in a sibling process", async () => {
    setTimeout(() => {
      fs.mkdirSync(composeMessageDir(MSG, dir), { recursive: true });
      fs.writeFileSync(piecePath(MSG, AT, dir), JSON.stringify(piece("late")), "utf8");
    }, TINY_BUDGET_MS * 3);
    await gatherPieces([AT], TINY_BUDGET_MS * 20);
    expect(pieceFor(AT)?.text).toBe("late");
  });

  it("gives up at the budget and RECORDS it, so the raw screen stays re-derivable", async () => {
    await gatherPieces([AT], TINY_BUDGET_MS);
    expect(pieceFor(AT)).toBeUndefined();
    expect(fs.existsSync(rawMarkAt(AT))).toBe(true);
  });

  it("holds a recorded give-up over a piece landing later: irrevocable on purpose", async () => {
    await gatherPieces([AT], TINY_BUDGET_MS);
    fs.writeFileSync(piecePath(MSG, AT, dir), JSON.stringify(piece("too late")), "utf8");
    await gatherPieces([AT], TINY_BUDGET_MS);
    expect(pieceFor(AT)).toBeUndefined();
  });

  it("treats a piece that does not parse as one still owed, settled by the budget", async () => {
    fs.mkdirSync(composeMessageDir(MSG, dir), { recursive: true });
    fs.writeFileSync(piecePath(MSG, AT, dir), "{not json", "utf8");
    await gatherPieces([AT], TINY_BUDGET_MS);
    expect(pieceFor(AT)).toBeUndefined();
    expect(fs.existsSync(rawMarkAt(AT))).toBe(true);
  });

  it("resolves each zone on its own: one settled piece never waits on a neighbour's verdict", async () => {
    fs.mkdirSync(composeMessageDir(MSG, dir), { recursive: true });
    fs.writeFileSync(piecePath(MSG, AT, dir), JSON.stringify(piece()), "utf8");
    fs.writeFileSync(rawMarkAt(OTHER_AT), "", "utf8");
    await gatherPieces([AT, OTHER_AT], TINY_BUDGET_MS);
    expect(pieceFor(AT)).toEqual(piece());
    expect(pieceFor(OTHER_AT)).toBeUndefined();
  });

  it("answers nothing in any other role, and nothing before its own pre-pass", async () => {
    fs.mkdirSync(composeMessageDir(MSG, dir), { recursive: true });
    fs.writeFileSync(piecePath(MSG, AT, dir), JSON.stringify(piece()), "utf8");
    expect(pieceFor(AT)).toBeUndefined(); // no pre-pass ran
    await gatherPieces([AT], TINY_BUDGET_MS);
    setComposeRole("speaker");
    expect(pieceFor(AT)).toBeUndefined();
  });
});

describe("forgetting", () => {
  it("drops one message's pieces surgically, a harness's own cleanup and nobody's flush", () => {
    setComposeRole("speaker");
    publishPiece(AT, SPAN, "drawn");
    dropComposition(MSG, dir);
    expect(fs.existsSync(composeMessageDir(MSG, dir))).toBe(false);
  });

  it("sweeps a store nothing will come back for, and spares one still streaming", () => {
    setComposeRole("speaker");
    publishPiece(AT, SPAN, "drawn");
    const abandoned = composeMessageDir("abandoned", dir);
    fs.mkdirSync(abandoned, { recursive: true });
    const old = Date.now() - COMPOSE_STALE_MS * 2;
    fs.utimesSync(abandoned, old / 1000, old / 1000);
    sweepCompose(undefined, dir);
    expect(fs.existsSync(abandoned)).toBe(false);
    expect(fs.existsSync(composeMessageDir(MSG, dir))).toBe(true);
  });

  it("sweeps nothing where no store exists yet", () => {
    expect(() => sweepCompose(undefined, path.join(dir, "nope"))).not.toThrow();
  });
});
