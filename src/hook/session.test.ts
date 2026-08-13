// What the session bookends owe the roster: a SessionStart signs THIS engine on, a SessionEnd tears the session's
// roster down and nobody else's, and neither ever throws, whatever the payload. The near-misses matter as much as the
// hits: these run unattended at a session's edge, where the only acceptable failure is a missing signature the first
// flush recreates.

import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { handleSessionEnd, handleSessionStart } from "./session.js";
import { SELF, clearRoster, peersDir, rosterHolds } from "../platform/peers.js";

/** The payload field Claude Code writes on every hook event. */
const SESSION = "session-under-test";

// The edges write where the engines really register: each case cleans its own session up, and the machine-wide entry
// this engine announces alongside is one every flush rewrites anyway.
afterEach(() => {
  clearRoster(SESSION);
});

describe("the SessionStart edge", () => {
  it("signs this engine onto the session's roster, under the id the payload names", () => {
    handleSessionStart({ session_id: SESSION });
    expect(rosterHolds(SESSION)).toBe(true);
  });

  it("swallows a payload with no session to name, the signature being all it can cost", () => {
    expect(() => handleSessionStart(null)).not.toThrow();
    expect(() => handleSessionStart("not an object")).not.toThrow();
    expect(() => handleSessionStart({ session_id: 7 })).not.toThrow();
    expect(rosterHolds(SESSION)).toBe(false);
  });

  it("still announces on the machine-wide register, which engines from before the election read", () => {
    handleSessionStart({ session_id: SESSION });
    const entries = fs.readdirSync(peersDir()).filter((n) => {
      const file = path.join(peersDir(), n);
      return fs.statSync(file).isFile();
    });
    expect(entries.length).toBeGreaterThan(0);
    expect(SELF.path).not.toBe(""); // the claim those entries carry names a real module
  });
});

describe("the SessionEnd edge", () => {
  it("tears down exactly the roster the payload names", () => {
    handleSessionStart({ session_id: SESSION });
    handleSessionEnd({ session_id: SESSION });
    expect(rosterHolds(SESSION)).toBe(false);
  });

  it("leaves a NEIGHBOURING session's roster standing", () => {
    const neighbour = `${SESSION}-neighbour`;
    handleSessionStart({ session_id: SESSION });
    handleSessionStart({ session_id: neighbour });
    handleSessionEnd({ session_id: SESSION });
    expect(rosterHolds(neighbour)).toBe(true);
    clearRoster(neighbour);
  });

  it("swallows the payloads a bookend can be handed, malformed or empty", () => {
    expect(() => handleSessionEnd(null)).not.toThrow();
    expect(() => handleSessionEnd({})).not.toThrow();
    expect(() => handleSessionEnd({ session_id: "" })).not.toThrow();
  });
});
