// handleMessageDisplay: the whole edge dance minus the process, which is exactly why it exists as its own storey. Every
// scenario here is one the live hook meets on ordinary turns: flushes landing out of order, a predecessor that never
// lands, the final flush cleaning up, a payload that is not the protocol at all.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleMessageDisplay, type MessageContext } from "./runner.js";
import { readEarlier } from "../platform/stream-state.js";
import { announce, peersDir } from "../platform/peers.js";
import { ANSI_RE } from "../style.js";
import { ENGINE_VERSION } from "../data/engine.js";
import { BOX, EACH, END, ENDBOX, HEAD } from "../data/language.js";
import { SCRATCH_DIR, VIEW_EXT } from "../data/markup.js";

const VIEW = [
  BOX,
  `${HEAD} {{box_title}}NOTE{{/}}`,
  `${EACH} note bullet="- "`,
  " ${#bullet}${.}",
  END,
  ENDBOX,
  "",
].join("\n");

const views = fs.mkdtempSync(path.join(os.tmpdir(), `${SCRATCH_DIR}-runner-`));
fs.writeFileSync(path.join(views, "note" + VIEW_EXT), VIEW);
// Its own state dir, so these tests never collide with another suite's messages.
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), `${SCRATCH_DIR}-runner-state-`));
const options = { viewsPath: [views], width: 100, stateDir };

// This edge consults the machine's engine register on every flush, and that register lives under the temp dir. Pointed
// at an EMPTY one for every case here: a real engine installed on the developer's machine would otherwise stand this
// whole suite down, and a green run would mean nothing.
const registerHome = fs.mkdtempSync(path.join(os.tmpdir(), `${SCRATCH_DIR}-runner-peers-`));
/** Told apart from this engine by version alone, and DERIVED from it so neither can drift into the other. */
const NEWER = `${Number(ENGINE_VERSION.split(".")[0]) + 1}.0.0`;
const OLDER = "0.0.1";

beforeEach(() => {
  fs.rmSync(path.join(registerHome, SCRATCH_DIR), { recursive: true, force: true });
  vi.stubEnv("TMPDIR", registerHome);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Another engine on the machine, with a real file behind it: a claim whose path is gone is one nobody believes. */
function otherEngine(version: string): void {
  const at = path.join(registerHome, `engine-${version}.js`);
  fs.writeFileSync(at, "", "utf8");
  announce(peersDir(), { path: at, version });
}

let n = 0;
const msg = (): string => `runner-test-${process.pid}-${n++}`;

function payload(id: string, index: number, delta: string, final = false): Record<string, unknown> {
  return { message_id: id, index, delta, final };
}

const shown = (envelope: string | null): string =>
  envelope === null
    ? ""
    : (JSON.parse(envelope) as { hookSpecificOutput: { displayContent: string } })
        .hookSpecificOutput.displayContent.replace(ANSI_RE, "");

describe("handleMessageDisplay", () => {
  it("reassembles a message whose flushes land out of order", async () => {
    const id = msg();
    // Flush 1 (the body) is dispatched but SLOW: it lands while flush 2 (the final, carrying the closing fence) is
    // already waiting on it.
    await handleMessageDisplay(payload(id, 0, "```view:note\n"), undefined, options);
    setTimeout(() => {
      void handleMessageDisplay(payload(id, 1, "note:\n- carried\n"), undefined, options);
    }, 30);
    const out = await handleMessageDisplay(payload(id, 2, "```", true), undefined, options);
    expect(shown(out)).toContain("NOTE");
    expect(shown(out)).toContain("- carried");
  });

  it("returns null on an incomplete prefix rather than mis-slicing", async () => {
    const id = msg();
    await handleMessageDisplay(payload(id, 0, "```view:note\nnote:\n- x\n"), undefined, options);
    // Index 1 never lands: the flush at index 2 cannot know its offset on screen.
    const out = await handleMessageDisplay(payload(id, 2, "```", true), undefined, options);
    expect(out).toBeNull();
  });

  it("cleans its message dir on the final flush", async () => {
    const id = msg();
    await handleMessageDisplay(payload(id, 0, "just prose"), undefined, options);
    expect(readEarlier(id, 1, stateDir).complete).toBe(true);
    await handleMessageDisplay(payload(id, 1, ", the end", true), undefined, options);
    expect(readEarlier(id, 1, stateDir).complete).toBe(false);
  });

  it("hands the payload meta to a factory host", async () => {
    // Written once on each side of the rename: the test is about the MAPPING (snake_case payload -> camelCase context),
    // not about the values.
    const meta = { prompt_id: "p1", session_id: "s1", cwd: "/somewhere" };
    const seen: MessageContext[] = [];
    const id = msg();
    await handleMessageDisplay(
      {
        message_id: id,
        index: 0,
        delta: "```view:note\nnote:\n- a\n```",
        final: true,
        ...meta,
      },
      (ctx) => {
        seen.push(ctx);
        return undefined; // a factory may also decline: the render must still happen
      },
      options
    );
    expect(seen).toEqual([
      { messageId: id, promptId: meta.prompt_id, sessionId: meta.session_id, cwd: meta.cwd, final: true },
    ]);
  });

  it("treats a payload with no index as a message of its own", async () => {
    const out = await handleMessageDisplay(
      { message_id: msg(), delta: "```view:note\nnote:\n- alone\n```", final: true },
      undefined,
      options
    );
    expect(shown(out)).toContain("- alone");
  });

  it("returns null on anything that is not the protocol, and never throws", async () => {
    for (const junk of [null, 42, "text", [], { delta: 7, index: "x" }]) {
      expect(await handleMessageDisplay(junk, undefined, options)).toBeNull();
    }
  });
});

describe("when another engine is registered on the machine", () => {
  const block = "```view:note\nnote:\n- a\n```";

  it("stands down for a NEWER one, so the delta reaches it untouched", async () => {
    // Null is what this edge already answers for "nothing to say", and it is exactly what standing down means: the
    // dispatcher hands the raw delta to the next hook in the chain, which is the newer engine.
    otherEngine(NEWER);
    expect(await handleMessageDisplay(payload(msg(), 0, block, true), undefined, options)).toBeNull();
  });

  it("draws for an OLDER one, which is the half a bare presence check would get wrong", async () => {
    otherEngine(OLDER);
    expect(shown(await handleMessageDisplay(payload(msg(), 0, block, true), undefined, options))).toContain("- a");
  });

  it("draws where it is alone, which is every screen this engine has ever drawn", async () => {
    expect(shown(await handleMessageDisplay(payload(msg(), 0, block, true), undefined, options))).toContain("- a");
  });
});
