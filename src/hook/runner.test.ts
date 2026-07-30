// handleMessageDisplay: the whole edge dance minus the process, which is exactly
// why it exists as its own storey. Every scenario here is one the live hook meets
// on ordinary turns: flushes landing out of order, a predecessor that never lands,
// the final flush cleaning up, a payload that is not the protocol at all.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleMessageDisplay, type MessageContext } from "./runner.js";
import { readEarlier } from "../platform/stream-state.js";
import { ANSI_RE } from "../style.js";

const VIEW = ["@box", "@head {{box_title}}NOTE{{/}}", '@each note bullet="- "', " ${#bullet}${.}", "@end", "@endbox", ""].join("\n");

const views = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-runner-"));
fs.writeFileSync(path.join(views, "note.view"), VIEW);
// Its own state dir, so these tests never collide with another suite's messages.
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-runner-state-"));
const options = { viewsPath: [views], width: 100, stateDir };

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
    // Flush 1 (the body) is dispatched but SLOW: it lands while flush 2 (the final,
    // carrying the closing fence) is already waiting on it.
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
    // Written once on each side of the rename: the test is about the MAPPING
    // (snake_case payload -> camelCase context), not about the values.
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
