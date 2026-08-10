// What this module owes the hook edge above it, and the half with teeth is the REFUSAL to yield.
//
// A suite that only ever proves the yield cannot tell it apart from an engine that never draws, and every failure here
// has that same shape on screen: a blank where a view was. So each case that must NOT silence gets its own, and the
// cheapest way to break this module is to make one of them throw.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NO_YIELD_ENV } from "../data/markup.js";
import { PEER_STALE_MS, announce, compareVersions, peers, peersDir, yieldsToNewer } from "./peers.js";

/** Two engines, told apart by the path they run from, which is what the register keys on. */
const MINE = "2.0.0";
const NEWER = "2.0.1";
const OLDER = "1.9.0";

let dir = "";
let ours = "";
let theirs = "";

/** A peer is believed only if the path it claims EXISTS, so a fake one needs a real file behind it. */
const engineAt = (name: string): string => {
  const file = path.join(dir, `${name}.js`);
  fs.writeFileSync(file, "", "utf8");
  return file;
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-peers-"));
  ours = engineAt("ours");
  theirs = engineAt("theirs");
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

const self = (version = MINE): { path: string; version: string } => ({ path: ours, version });
const other = (version: string): { path: string; version: string } => ({
  path: theirs,
  version,
});

describe("where the register lives", () => {
  it("is machine-wide, under the temp dir and never under a host's own state dir", () => {
    // The property that makes the whole mechanism work: two engines must land in ONE directory, and stateDir is the
    // knob a host turns precisely so it does NOT share.
    expect(peersDir().startsWith(os.tmpdir())).toBe(true);
  });
});

describe("ranking two versions", () => {
  it("orders release over release, field by field", () => {
    expect(compareVersions(NEWER, MINE)).toBeGreaterThan(0);
    expect(compareVersions(OLDER, MINE)).toBeLessThan(0);
    expect(compareVersions(MINE, MINE)).toBe(0);
  });

  it("puts a PRERELEASE below its own release and above the one before it", () => {
    // The ordering a rehearsal depends on: a prerelease is published to be newer than what shipped and older than what
    // will. Read as a plain string, `2.0.1-rc.0` sorts above `2.0.1` and the rehearsal silences the real thing.
    expect(compareVersions("2.0.1-rc.0", "2.0.1")).toBeLessThan(0);
    expect(compareVersions("2.0.1-rc.0", "2.0.0")).toBeGreaterThan(0);
    expect(compareVersions("2.0.1-rc.2", "2.0.1-rc.10")).toBeLessThan(0);
  });

  it("ranks NEITHER above the other where one is not a version at all", () => {
    expect(compareVersions("not-a-version", MINE)).toBe(0);
    expect(compareVersions(MINE, "")).toBe(0);
  });
});

describe("the register", () => {
  it("carries one entry per engine, and rewriting is the same entry", () => {
    announce(dir, self());
    announce(dir, self());
    announce(dir, other(NEWER));
    expect(fs.readdirSync(dir).filter((n) => !n.endsWith(".js"))).toHaveLength(2);
  });

  it("does not hand an engine back to ITSELF, whatever it announced", () => {
    announce(dir, self());
    expect(peers(dir, self())).toEqual([]);
  });

  it("hands back a peer that is fresh, real and readable", () => {
    announce(dir, other(NEWER));
    expect(peers(dir, self())).toEqual([{ path: theirs, version: NEWER }]);
  });
});

describe("yielding to a newer engine", () => {
  it("yields where a peer is STRICTLY newer", () => {
    announce(dir, other(NEWER));
    expect(yieldsToNewer(dir, self())).toBe(true);
  });

  it("draws where the peer is older, which is the case a bare presence check would get wrong", () => {
    announce(dir, other(OLDER));
    expect(yieldsToNewer(dir, self())).toBe(false);
  });

  it("draws where the peer is the SAME version: same version, same code, and the first to run wins", () => {
    announce(dir, other(MINE));
    expect(yieldsToNewer(dir, self())).toBe(false);
  });

  it("draws where no register exists at all", () => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    expect(yieldsToNewer(dir, self())).toBe(false);
  });

  it("ANNOUNCES itself even when it yields, so the two never take turns", () => {
    // The trap the order was written for: an engine that only appeared on the register when it drew would vanish from
    // it the moment it started yielding, its peer would then see nobody, and the two would alternate.
    announce(dir, other(NEWER));
    expect(yieldsToNewer(dir, self())).toBe(true);
    expect(peers(dir, other(NEWER))).toEqual([{ path: ours, version: MINE }]);
  });
});

describe("what must never silence a screen", () => {
  it("an engine that was UNINSTALLED, its claim dropped on the way past", () => {
    announce(dir, other(NEWER));
    fs.rmSync(theirs);
    expect(yieldsToNewer(dir, self())).toBe(false);
    expect(peers(dir, self())).toEqual([]);
  });

  it("a claim older than the expiry, swept on the way past", () => {
    announce(dir, other(NEWER));
    const stale = fs
      .readdirSync(dir)
      .map((n) => path.join(dir, n))
      .filter((f) => !f.endsWith(".js"));
    const old = Date.now() - PEER_STALE_MS * 2;
    for (const f of stale) fs.utimesSync(f, old / 1000, old / 1000);
    expect(yieldsToNewer(dir, self())).toBe(false);
  });

  it("a claim that is not JSON, or JSON of the wrong shape", () => {
    fs.writeFileSync(path.join(dir, "garbage"), "{not json", "utf8");
    fs.writeFileSync(path.join(dir, "shaped-wrong"), JSON.stringify({ version: NEWER }), "utf8");
    expect(yieldsToNewer(dir, self())).toBe(false);
  });

  it("a peer whose version does not parse, however new it looks", () => {
    announce(dir, other("newest-ever"));
    expect(yieldsToNewer(dir, self())).toBe(false);
  });

  it("a running engine whose OWN version does not parse", () => {
    announce(dir, other(NEWER));
    expect(yieldsToNewer(dir, self("dev"))).toBe(false);
  });

  it("the opt-out, which draws whatever else is registered", () => {
    announce(dir, other(NEWER));
    vi.stubEnv(NO_YIELD_ENV, "1");
    expect(yieldsToNewer(dir, self())).toBe(false);
  });

  it("the opt-out set EMPTY, which is a variable nobody meant to set", () => {
    announce(dir, other(NEWER));
    vi.stubEnv(NO_YIELD_ENV, "");
    expect(yieldsToNewer(dir, self())).toBe(true);
  });

  it("still announces under the opt-out, so a peer can defer to THIS engine", () => {
    vi.stubEnv(NO_YIELD_ENV, "1");
    expect(yieldsToNewer(dir, self())).toBe(false);
    expect(peers(dir, other(OLDER))).toEqual([{ path: ours, version: MINE }]);
  });
});
