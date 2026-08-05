// The SessionStart hook, from the file an install actually copies. A suite for a PATH rather than for a
// module, so it lives here: hooks/steering.mjs is not under src/, has no build behind it, and is reached
// by Claude Code alone.
//
// It catches a DELIVERY failure, which no other gate sees. Every way of getting the one contract wrong
// (`hookSpecificOutput.additionalContext` on stdout) is SILENT: the file moves and the hook says nothing,
// the contributor's note rides into the context, a missing file takes the session start with it.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { steeringPayload, pluginRoot } from "../../hooks/steering.mjs";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const EVENT = "SessionStart";
const OPT_OUT_ENV = "CC_VIEWS_STEERING";

/** The payload parsed, which is also the assertion that one was emitted at all. */
const injected = (root: string): { hookEventName: string; additionalContext: string } => {
  const raw = steeringPayload(root);
  expect(raw).not.toBeNull();
  return (JSON.parse(raw as string) as Record<string, never>)["hookSpecificOutput"];
};

/** The env a session would carry, reduced to the one variable under test. */
const withOptOut = (value: string): NodeJS.ProcessEnv => ({ [OPT_OUT_ENV]: value });

describe("the SessionStart hook the plugin ships", () => {
  it("answers from THIS repo, under the event name Claude Code injects on", () => {
    // The root it resolves on its own, and not one a test made up: a hook that answered only for a path
    // handed to it would pass here and find nothing in the copy an install runs it from.
    expect(pluginRoot()).toBe(REPO);
    expect(injected(pluginRoot()).hookEventName).toBe(EVENT);
  });

  it("carries the words a session needs, and NOT the note addressed to whoever edits the file", () => {
    // The note opens the file, so it would ride at the head of every session's context: the one place a
    // reader would take "written for an agent, gated by check-steering" as an instruction to follow.
    const { additionalContext } = injected(pluginRoot());
    expect(additionalContext).toContain("@{view:columns}");
    expect(additionalContext).not.toContain("<!--");
    expect(additionalContext).not.toContain("check-steering");
    expect(additionalContext.startsWith("Draw")).toBe(true);
  });

  it("says nothing at all once the opt-out is set, whichever way a reader spells no", () => {
    // An install whose own views are the ones to reach for: the skill stays, the briefing goes. Every spelling is
    // pinned rather than one, since a value that quietly kept injecting would look exactly like a working opt-out.
    for (const value of ["off", "0", "false", "no", "OFF", " off "]) {
      expect(steeringPayload(pluginRoot(), withOptOut(value))).toBeNull();
    }
  });

  it("keeps the text for any other value, `on` first of all, which must never read as off", () => {
    for (const value of ["on", "1", "true", "", "yes"]) {
      expect(steeringPayload(pluginRoot(), withOptOut(value))).not.toBeNull();
    }
  });

  it("says NOTHING rather than throwing when the copy arrived without the file", () => {
    // The failure this makes safe: a hook that throws blocks the start of every session of every install.
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-steering-"));
    try {
      expect(steeringPayload(empty)).toBeNull();
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});
