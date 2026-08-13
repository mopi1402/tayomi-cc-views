// handleMessageDisplay: the whole edge dance minus the process, which is exactly why it exists as its own storey. Every
// scenario here is one the live hook meets on ordinary turns: flushes landing out of order, a predecessor that never
// lands, the final flush cleaning up, a payload that is not the protocol at all.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleMessageDisplay, type MessageContext } from "./runner.js";
import { readEarlier } from "../platform/stream-state.js";
import { announce, peers, peersDir } from "../platform/peers.js";
import { ANSI_RE } from "../style.js";
import { ENGINE_VERSION } from "../data/engine.js";
import { BOX, EACH, END, ENDBOX, HEAD } from "../data/language.js";
import { DECORATOR_HINT, ENGINES_DIR_ENV, SCRATCH_DIR, VIEW_EXT } from "../data/markup.js";

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

// This edge consults the machine's engine register on every flush. Pointed at an EMPTY register of this suite's own,
// through the same redirect a harness uses (ENGINES_DIR_ENV, which outranks any TMPDIR arithmetic): a real engine
// installed on the developer's machine would otherwise stand this whole suite down, and a green run would mean nothing.
const registerHome = fs.mkdtempSync(path.join(os.tmpdir(), `${SCRATCH_DIR}-runner-peers-`));
/** Told apart from this engine by version alone, and DERIVED from it so neither can drift into the other. */
const NEWER = `${Number(ENGINE_VERSION.split(".")[0]) + 1}.0.0`;
const OLDER = "0.0.1";
/** The view both engines have: the only kind a stand-aside can apply to. */
const SHARED_VIEWS = ["note"];

beforeEach(() => {
  fs.rmSync(registerHome, { recursive: true, force: true });
  fs.mkdirSync(registerHome, { recursive: true });
  vi.stubEnv(ENGINES_DIR_ENV, registerHome);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Another engine on the machine, with a real file behind it: a claim whose path is gone is one nobody believes. */
function otherEngine(version: string): void {
  const at = path.join(registerHome, `engine-${version}.js`);
  fs.writeFileSync(at, "", "utf8");
  announce(peersDir(), { path: at, version, views: SHARED_VIEWS });
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

  it("returns null on an incomplete prefix when the delta alone carries no zone", async () => {
    const id = msg();
    await handleMessageDisplay(payload(id, 0, "```view:note\nnote:\n- x\n"), undefined, options);
    // Index 1 never lands: the flush at index 2 cannot know its offset on screen, and a bare closing fence engages
    // nothing on its own, so the host's own delta stands.
    const out = await handleMessageDisplay(payload(id, 2, "```", true), undefined, options);
    expect(out).toBeNull();
  });

  it("renders an ENGAGED delta alone on an incomplete prefix, its open zone withheld rather than shown raw", async () => {
    const id = msg();
    // Index 0 never lands. Handed back to the host this delta printed raw and STAYED, zone opening included
    // (measured 2026-08-11): rendered alone, the engine's own withholding cuts the open zone and keeps the prose.
    const deco = `${DECORATOR_HINT}note}`;
    const row = "| a | b |";
    const out = await handleMessageDisplay(
      payload(id, 1, `prose kept\n${deco}\n${row}\n`),
      undefined,
      options
    );
    expect(shown(out)).toContain("prose kept");
    expect(shown(out)).not.toContain(deco);
    expect(shown(out)).not.toContain(row);
  });

  it("answers a withheld flush with an EMPTY displayContent, which is the protocol's own suppression", async () => {
    const id = msg();
    // The delta opens a zone and brings nothing showable yet. The field must be PRESENT and empty: the host reads any
    // defined displayContent as the delta's replacement, and an omitted one as "display the original" (read off the
    // 2.1.228 binary, 2026-08-11). Answered null instead, the raw fence reaches the screen and its unclosed ``` puts
    // the host's markdown inside a code block for the whole rest of the message.
    const out = await handleMessageDisplay(payload(id, 0, "```view:note\n"), undefined, options);
    expect(out).not.toBeNull();
    const envelope = JSON.parse(out as string) as {
      hookSpecificOutput: { displayContent?: string };
    };
    expect(envelope.hookSpecificOutput.displayContent).toBe("");
  });

  it("answers NOTHING, flush after flush, for a view its own search path cannot resolve", async () => {
    // The leak of 2026-08-12, at the edge it reached the screen through: three hooks on one machine, two of them
    // running an engine that has no `tldr` template. The zone must never be theirs: withheld flushes re-emitted raw at
    // the close were the LAST defined answer, order permitting, and replaced the box the third engine had drawn.
    const id = msg();
    const flushes = ["@{view:elsewhere}\n", "| | |\n| --- | --- |\n", "| said | - hello |\n"];
    for (const [at, delta] of flushes.entries()) {
      const out = await handleMessageDisplay(
        payload(id, at, delta, at === flushes.length - 1),
        undefined,
        options
      );
      expect(out, `flush ${at}`).toBeNull();
    }
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

  it("stands aside on a view a NEWER one also has, saying NOTHING so its render stands", async () => {
    // Silence and not an untouched copy: the dispatcher hands every hook the original delta and keeps the LAST defined
    // answer, so a DEFINED copy landing after the newer engine's render replaced that render with raw text.
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

  it("announces each view name ONCE, whatever the search path repeats", async () => {
    // Read off the live register on 2026-08-11: two directories resolving the same names announced all of them twice.
    // Shadowing is what an ORDERED path is for, and the claim's cap has to count views rather than directories.
    await handleMessageDisplay(payload(msg(), 0, block, true), undefined, {
      ...options,
      viewsPath: [views, views],
    });
    const [mine] = peers(peersDir(), { path: "/somewhere/else", version: OLDER, views: [] });
    expect(mine.views).toEqual(["note"]);
  });
});
