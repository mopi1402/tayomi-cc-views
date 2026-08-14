// The COMPOSITION, end to end: one message streamed across several flushes, two engines' zones interleaved, the test
// playing the peer's side of the store at the moments a real sibling process would. A suite for a PATH, so it lives
// here: the unit cases prove each half, and only the whole stream can prove the SEAM, the flush that carries the end
// of one engine's zone and the head of the other's, which is the exact shape that painted the interleaved collage
// (docs/caveats.md).

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleMessageDisplay } from "../../src/hook/runner.js";
import { COMPOSE_PROTOCOL, announce, peersDir } from "../../src/platform/peers.js";
import {
  DECORATED_ZONE,
  FENCED_ZONE,
  composeMessageDir,
  piecePath,
  rawVerdictPath,
  zoneKey,
  type Piece,
} from "../../src/platform/compose.js";
import { ENGINE_VERSION } from "../../src/data/engine.js";
import { ENGINES_DIR_ENV, SCRATCH_DIR } from "../../src/data/markup.js";
import { ANSI_RE } from "../../src/style.js";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUNDLED = path.join(REPO, "views");

const home = fs.mkdtempSync(path.join(os.tmpdir(), `${SCRATCH_DIR}-composition-`));
const stateDir = path.join(home, "state");
const options = { viewsPath: [BUNDLED], width: 60, stateDir };

const NEWER = `${Number(ENGINE_VERSION.split(".")[0]) + 1}.0.0`;
const OLDER = "0.0.1";

const SENTENCE = "la ligne que tu aurais ecrite de toute facon";
/** OURS: a bundled view this engine resolves, the blank line CLOSING the quote zone the way its grammar demands. */
const OURS = ["@{view:quote, tone:gold}", `> ${SENTENCE}`, "", ""].join("\n");
/** THEIRS: a view only the peer declares, so its zones are lost unopposed whatever this engine ranks. */
const THEIRS = "elsewhere";
const THEIR_DECORATOR = `@{view:${THEIRS}}`;
/** What the peer would render, distinctive enough that only a splice can put it on screen. */
const PEER_RENDER = "█ PEER DREW ELSEWHERE █";

let n = 0;
const msg = (): string => `composition-${process.pid}-${n++}`;

/** A peer speaking the protocol, real file behind the claim. */
function peerWith(version: string, views: string[]): void {
  const at = path.join(home, `peer-${version}-${n}.js`);
  fs.writeFileSync(at, "", "utf8");
  announce(peersDir(), { path: at, version, views, speaks: COMPOSE_PROTOCOL });
}

const answered = (envelope: string | null): string | null =>
  envelope === null
    ? null
    : (JSON.parse(envelope) as { hookSpecificOutput: { displayContent: string } })
        .hookSpecificOutput.displayContent.replace(ANSI_RE, "");

/** What the terminal accumulates: a null answer shows the delta itself, a defined one replaces it, "" included. */
const onScreen = (answer: string | null, delta: string): string => answer ?? delta;

beforeEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.mkdirSync(home, { recursive: true });
  vi.stubEnv(ENGINES_DIR_ENV, home);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

describe("one message, two engines, one voice", () => {
  it("carries the seam: the peer's zone head is withheld at the boundary, then spliced at the close", async () => {
    // This engine assembles (the peer ranks below), and the stream splits EXACTLY where the collage was born: flush 1
    // ends our zone and opens theirs.
    peerWith(OLDER, [THEIRS]);
    const id = msg();
    const deltas = [
      `${OURS}`, // flush 0: our zone, closed
      `${THEIR_DECORATOR}\n| a |\n`, // flush 1: THEIR zone's head, still streaming
      `| b |\n\nafter\n`, // flush 2, final: their zone closes, prose follows
    ];
    let screen = "";
    const flush = async (index: number, final = false): Promise<string | null> => {
      const out = answered(
        await handleMessageDisplay(
          { message_id: id, index, delta: deltas[index], final },
          undefined,
          options
        )
      );
      screen += onScreen(out, deltas[index]);
      return out;
    };
    const first = await flush(0);
    expect(first).toContain(SENTENCE); // our zone, drawn by us
    const boundary = await flush(1);
    // The collage-killer: the head of a zone we cannot draw is WITHHELD, never handed to the screen raw.
    expect(boundary).toBe("");
    // The peer (a sibling process on a real machine) publishes its piece: their zone spans decorator plus two rows.
    fs.mkdirSync(composeMessageDir(id), { recursive: true });
    fs.writeFileSync(
      piecePath(id, zoneKey(DECORATED_ZONE, THEIRS, 0)),
      JSON.stringify({ span: 3, text: PEER_RENDER } satisfies Piece),
      "utf8"
    );
    const last = await flush(2, true);
    expect(last).toContain(PEER_RENDER); // their zone, spliced from the piece
    expect(last).toContain("after"); // the prose past the spliced zone survives
    // The whole conversation, as the terminal accumulated it: neither the raw decorator nor its rows ever landed.
    expect(screen).toContain(SENTENCE);
    expect(screen).toContain(PEER_RENDER);
    expect(screen).not.toContain(THEIR_DECORATOR);
    expect(screen).not.toContain("| a |");
  });

  it("splices a peer's FENCED block whole, the other carrier of the same protocol", async () => {
    peerWith(OLDER, [THEIRS]);
    const id = msg();
    const block = `\`\`\`view:${THEIRS}\ndata:\n- x\n\`\`\`\n`;
    fs.mkdirSync(composeMessageDir(id), { recursive: true });
    fs.writeFileSync(
      piecePath(id, zoneKey(FENCED_ZONE, THEIRS, 0)),
      JSON.stringify({ span: 4, text: `${PEER_RENDER}\n` } satisfies Piece),
      "utf8"
    );
    const out = answered(
      await handleMessageDisplay(
        { message_id: id, index: 0, delta: `before\n${block}after\n`, final: true },
        undefined,
        options
      )
    );
    expect(out).toContain(PEER_RENDER);
    expect(out).not.toContain("```view:");
    expect(out).toContain("before");
    expect(out).toContain("after");
  });

  it("stays SILENT as a speaker and leaves its render as a piece for the assembler that outranks it", async () => {
    peerWith(NEWER, [THEIRS]);
    const id = msg();
    const out = await handleMessageDisplay(
      { message_id: id, index: 0, delta: `${OURS}${THEIR_DECORATOR}\n`, final: true },
      undefined,
      options
    );
    expect(out).toBeNull(); // the assembler is the flush's one voice
    const piece = JSON.parse(
      fs.readFileSync(piecePath(id, zoneKey(DECORATED_ZONE, "quote", 0)), "utf8")
    ) as Piece;
    expect(piece.text.replace(ANSI_RE, "")).toContain(SENTENCE); // its zone travelled as a piece
    expect(piece.span).toBe(2); // decorator line plus the quote line, as written
  });

  it("pays the bounded wait for a winner that never answers, records the give-up, and holds it", async () => {
    // The peer is registered and dead: the budget expires and the zone fails open as written. Fail open is SILENCE
    // here: with every zone left as written the answer is the delta itself, an echo, and null is how an echo is said
    // (the host shows the original, raw and whole, never a blank).
    peerWith(OLDER, [THEIRS]);
    const id = msg();
    const key = zoneKey(DECORATED_ZONE, THEIRS, 0);
    const first = await handleMessageDisplay(
      { message_id: id, index: 0, delta: `${THEIR_DECORATOR}\n\n`, final: false },
      undefined,
      options
    );
    expect(first).toBeNull();
    expect(fs.existsSync(rawVerdictPath(id, key))).toBe(true); // the give-up, recorded
    // The winner wakes up LATE: its piece must never repaint what an earlier flush already left raw on screen.
    fs.writeFileSync(piecePath(id, key), JSON.stringify({ span: 1, text: PEER_RENDER } satisfies Piece), "utf8");
    const last = await handleMessageDisplay(
      { message_id: id, index: 1, delta: "done\n", final: true },
      undefined,
      options
    );
    expect(last).toBeNull(); // still the raw echo: the record outranks the late piece
    expect(fs.existsSync(composeMessageDir(id))).toBe(true); // the store stands for a duplicate; age sweeps it
  });

  it("answers the SAME screen from a duplicate final flush, the engine wired twice by human hands", async () => {
    // The incident of 2026-08-14: one engine registered by two hook entries (user settings and project settings)
    // runs every flush in two processes. The first final flush used to drop the store behind it; the duplicate then
    // found nothing, expired its wait, and its RAW answer, dispatched last, overwrote the drawn screen. The store
    // now outlives the flush, so the duplicate converges on the same pixels.
    peerWith(OLDER, [THEIRS]);
    const id = msg();
    fs.mkdirSync(composeMessageDir(id), { recursive: true });
    fs.writeFileSync(
      piecePath(id, zoneKey(DECORATED_ZONE, THEIRS, 0)),
      JSON.stringify({ span: 2, text: PEER_RENDER } satisfies Piece),
      "utf8"
    );
    const delta = `${THEIR_DECORATOR}\n| a |\n\nafter\n`;
    const flush = { message_id: id, index: 0, delta, final: true };
    const first = answered(await handleMessageDisplay(flush, undefined, options));
    const second = answered(await handleMessageDisplay(flush, undefined, options));
    expect(first).toContain(PEER_RENDER);
    expect(second).toBe(first); // identical answers: the last-writer overwrite paints the same pixels
  });
});
