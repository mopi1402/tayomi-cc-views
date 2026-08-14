// What the session bookends owe the roster: a SessionStart signs THIS engine on, a SessionEnd tears the session's
// roster down and nobody else's, and neither ever throws, whatever the payload. The near-misses matter as much as the
// hits: these run unattended at a session's edge, where the only acceptable failure is a missing signature the first
// flush recreates.

import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleSessionEnd, handleSessionStart, handleUserPrompt } from "./session.js";
import { SELF, announce, clearRoster, peersDir, rosterHolds } from "../platform/peers.js";
import { ANSI_RE } from "../style.js";
import { RESET } from "@tayomi/utils";

/** The payload field Claude Code writes on every hook event. */
const SESSION = "session-under-test";

/** A claim from before the composition protocol, real file behind it, cleaned with the case that wrote it. */
const MUTE_VERSION = "9.9.9";
function announceMuteEngine(): string {
  const at = path.join(peersDir(), "mute-engine.js");
  fs.mkdirSync(peersDir(), { recursive: true });
  fs.writeFileSync(at, "", "utf8");
  announce(peersDir(), { path: at, version: MUTE_VERSION, views: ["tldr"], speaks: 0 });
  return at;
}

// The edges write through the REAL default paths on purpose, which the suite's register isolation redirects to a
// directory of this worker's own (tests/env-isolation.ts): each case still cleans its own session up.
afterEach(() => {
  clearRoster(SESSION);
  fs.rmSync(path.join(peersDir(), "mute-engine.js"), { force: true }); // its claim dies with its path
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

// The edges that can WARN: the systemMessage channel, outside the display race a drawn band would ride. The PROMPT
// edge is the one that never misses (a mute engine signs the register at its first flush, whatever emptied it before);
// SessionStart is the head start when the register is still warm. One claim serves both: exactly one warning a session.
describe("the mixed-fleet warning", () => {
  it("names the culprit at SessionStart, version and path, dressed as an accented NOTICE with its call", () => {
    const at = announceMuteEngine();
    const envelope = handleSessionStart({ session_id: SESSION });
    expect(envelope).not.toBeNull();
    const parsed = JSON.parse(envelope as string) as { systemMessage: string };
    expect(parsed.systemMessage).toContain(MUTE_VERSION);
    // A path under no node_modules and no engine tail is a LOCATION already: it shows whole, never folded.
    expect(parsed.systemMessage).toContain(at);
    // Printed by the HOST in its own dim grey unless the message carries its accent: unreadable is unwarned.
    expect(parsed.systemMessage.match(ANSI_RE)).not.toBeNull();
    // The kit's box, and the CALL under its rule: a warning without one is a riddle, and the call names WHERE
    // (each listed location, a project or a global install), because the reader's own session may well be the
    // up-to-date one.
    expect(parsed.systemMessage).toContain("╭");
    expect(parsed.systemMessage).toContain("update @tayomi/cc-views in each location");
    // Inside the box every style closes NARROW (SGR 22): a full RESET also cancels the colour the host paints its
    // own dialog line with, and the rest of that row renders default-bright (measured 2026-08-14). Only the header,
    // with nothing after it on its line, may RESET.
    const [head, ...box] = parsed.systemMessage.split("\n");
    expect(head).toContain(RESET);
    for (const line of box) expect(line).not.toContain(RESET);
  });

  it("names the culprit at the NEXT PROMPT when it signed on mid-session, the reboot and the expiry both", () => {
    handleSessionStart({ session_id: SESSION }); // the register was empty: no warning to give yet
    announceMuteEngine(); // the mute engine speaks at the first message's flush
    const envelope = handleUserPrompt({ session_id: SESSION });
    expect(envelope).not.toBeNull();
    const parsed = JSON.parse(envelope as string) as {
      systemMessage: string;
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(parsed.systemMessage).toContain(MUTE_VERSION);
    // The model's copy rides along, PLAIN on purpose: escapes and box-drawing are noise inside a context window,
    // and the printed line already does the telling, so no relay instruction either.
    expect(parsed.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    expect(parsed.hookSpecificOutput.additionalContext).toContain(MUTE_VERSION);
    expect(parsed.hookSpecificOutput.additionalContext.match(ANSI_RE)).toBeNull();
  });

  it("names the PROJECT a lagging install sits under, never its node_modules innards", () => {
    // The reader acts at the project (the CTA says where): a package.json at the prefix before the first
    // node_modules is what makes a path a project's, and the store detour below it is noise a reader never uses.
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-project-"));
    const at = path.join(project, "node_modules", "@tayomi", "cc-views", "dist", "platform", "peers.js");
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, "", "utf8");
    fs.writeFileSync(path.join(project, "package.json"), "{}", "utf8");
    announce(peersDir(), { path: at, version: MUTE_VERSION, views: ["tldr"], speaks: 0 });
    const envelope = handleSessionStart({ session_id: SESSION });
    expect(envelope).not.toBeNull();
    const parsed = JSON.parse(envelope as string) as { systemMessage: string };
    expect(parsed.systemMessage).toContain(project);
    expect(parsed.systemMessage).not.toContain("node_modules");
    fs.rmSync(project, { recursive: true, force: true }); // its claim dies with its path
  });

  it("names a GLOBAL install whole minus the engine's own tail, the package name in full view", () => {
    // No package.json above the global node_modules (npm -g roots in a bare lib/): cutting there would name a
    // system directory that says nothing, so the location keeps node_modules/@tayomi/cc-views and drops only
    // dist/platform/peers.js, our internal layout.
    const lib = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-lib-"));
    const at = path.join(lib, "node_modules", "@tayomi", "cc-views", "dist", "platform", "peers.js");
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, "", "utf8");
    announce(peersDir(), { path: at, version: MUTE_VERSION, views: ["tldr"], speaks: 0 });
    const envelope = handleSessionStart({ session_id: SESSION });
    expect(envelope).not.toBeNull();
    const parsed = JSON.parse(envelope as string) as { systemMessage: string };
    expect(parsed.systemMessage).toContain(path.join(lib, "node_modules", "@tayomi", "cc-views"));
    expect(parsed.systemMessage).not.toContain(path.join("dist", "platform"));
    fs.rmSync(lib, { recursive: true, force: true }); // its claim dies with its path
  });

  it("warns ONCE per session, whichever edge asks second", () => {
    announceMuteEngine();
    expect(handleSessionStart({ session_id: SESSION })).not.toBeNull();
    expect(handleUserPrompt({ session_id: SESSION })).toBeNull();
    expect(handleSessionStart({ session_id: SESSION })).toBeNull();
  });

  it("stands aside on a RESUMED session and leaves the claim to the prompt edge", () => {
    // The host replays the transcript OVER a resumed SessionStart's output (measured 2026-08-14): claiming there
    // burns the session's one warning on a line nobody reads. The roster is still signed, the claim stays whole.
    announceMuteEngine();
    expect(handleSessionStart({ session_id: SESSION, source: "resume" })).toBeNull();
    expect(rosterHolds(SESSION)).toBe(true);
    expect(handleUserPrompt({ session_id: SESSION })).not.toBeNull();
  });

  it("prints on the sources whose output the operator actually sees, a fresh startup first", () => {
    announceMuteEngine();
    expect(handleSessionStart({ session_id: SESSION, source: "startup" })).not.toBeNull();
  });

  it("stays silent for a fleet with nothing to warn about, on both edges", () => {
    expect(handleSessionStart({ session_id: SESSION })).toBeNull();
    expect(handleUserPrompt({ session_id: SESSION })).toBeNull();
  });

  it("never accuses a location its operator already fixed: a newer claim there retires the ghost", () => {
    // The old engine's claim survives an update by up to its expiry (measured 2026-08-14): the one screen it must
    // never reach is the first session after the operator did exactly what the warning asked.
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-fixed-"));
    const engineAt = (pkg: string, version: string, speaks: number): void => {
      const at = path.join(project, "node_modules", pkg, "dist", "platform", "peers.js");
      fs.mkdirSync(path.dirname(at), { recursive: true });
      fs.writeFileSync(at, "", "utf8");
      announce(peersDir(), { path: at, version, views: ["tldr"], speaks });
    };
    fs.writeFileSync(path.join(project, "package.json"), "{}", "utf8");
    engineAt("ghost", "2.3.2-rc.0", 0);
    engineAt("fixed", "2.3.3", 1);
    expect(handleSessionStart({ session_id: SESSION })).toBeNull();
    expect(handleUserPrompt({ session_id: SESSION })).toBeNull();
    fs.rmSync(project, { recursive: true, force: true }); // both claims die with their paths
  });

  it("stays silent with no session to claim the warning under, and still announces", () => {
    announceMuteEngine();
    expect(handleSessionStart({})).toBeNull();
    expect(handleUserPrompt({})).toBeNull();
    expect(() => handleUserPrompt(null)).not.toThrow();
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
