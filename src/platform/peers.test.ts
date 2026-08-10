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
import {
  PEER_STALE_MS,
  announce,
  compareVersions,
  defersView,
  newerViews,
  peers,
  peersDir,
  standAside,
  type Peer,
} from "./peers.js";

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

const claim = (at: string, version: string, views: string[] = []): Peer => ({ path: at, version, views });
const self = (version = MINE): Peer => claim(ours, version);
const other = (version: string, views: string[] = []): Peer => claim(theirs, version, views);

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
    expect(peers(dir, self())).toEqual([{ path: theirs, version: NEWER, views: [] }]);
  });
});


// The rule, in one line: an engine stands aside on a view a NEWER engine also has, and draws every other one itself.
// Per ZONE and never per message, which is what a set of NAMES is for.
describe("standing aside on a view a newer engine also has", () => {
  const MINE_ONLY = "onlymine";
  const BOTH = "shared";
  const THEIRS_ONLY = "onlytheirs";

  it("defers the view they BOTH have, so the newer one draws it", () => {
    announce(dir, other(NEWER, [BOTH, THEIRS_ONLY]));
    standAside([MINE_ONLY, BOTH], dir, self());
    expect(defersView(BOTH)).toBe(true);
  });

  it("keeps the view only IT has, which is the whole reason this is per zone", () => {
    announce(dir, other(NEWER, [BOTH, THEIRS_ONLY]));
    standAside([MINE_ONLY, BOTH], dir, self());
    // Standing down for the whole MESSAGE is what used to lose this one: nobody else could draw it.
    expect(defersView(MINE_ONLY)).toBe(false);
  });

  it("names a view only THEY have too, which costs it nothing it could have drawn", () => {
    announce(dir, other(NEWER, [THEIRS_ONLY]));
    standAside([MINE_ONLY], dir, self());
    // The set is what a newer peer DECLARES, ours or not: a name this engine never had resolves nowhere anyway, and
    // the zone falls through raw exactly as an unknown view always has.
    expect(defersView(THEIRS_ONLY)).toBe(true);
    expect(defersView(MINE_ONLY)).toBe(false);
  });

  it("defers NOTHING to an older engine, however many views it declares", () => {
    announce(dir, other(OLDER, [BOTH, MINE_ONLY]));
    standAside([MINE_ONLY, BOTH], dir, self());
    expect(defersView(BOTH)).toBe(false);
    expect(defersView(MINE_ONLY)).toBe(false);
  });

  it("defers nothing to an engine of the SAME version, both drawing the same code", () => {
    announce(dir, other(MINE, [BOTH]));
    standAside([BOTH], dir, self());
    expect(defersView(BOTH)).toBe(false);
  });

  it("announces the names it was handed, so a peer can defer to THIS engine", () => {
    standAside([MINE_ONLY, BOTH], dir, self());
    expect(peers(dir, other(OLDER))).toEqual([
      { path: ours, version: MINE, views: [MINE_ONLY, BOTH] },
    ]);
  });

  it("names only what a NEWER peer has, never the union of every peer", () => {
    const list: Peer[] = [
      { path: "/old", version: OLDER, views: ["oldonly"] },
      { path: "/new", version: NEWER, views: [BOTH] },
    ];
    expect([...newerViews(list, self())]).toEqual([BOTH]);
  });
});

describe("what must never silence a screen", () => {
  const VIEW = "somewhere";

  /** Every case here ends the same way: this engine defers NOTHING, so it draws what it has. */
  const defersNothing = (): void => expect(defersView(VIEW)).toBe(false);

  it("an engine that was UNINSTALLED, its claim dropped on the way past", () => {
    announce(dir, other(NEWER, [VIEW]));
    fs.rmSync(theirs);
    standAside([VIEW], dir, self());
    defersNothing();
    expect(peers(dir, self())).toEqual([]);
  });

  it("a claim older than the expiry, swept on the way past", () => {
    announce(dir, other(NEWER, [VIEW]));
    const stale = fs
      .readdirSync(dir)
      .map((n) => path.join(dir, n))
      .filter((f) => !f.endsWith(".js"));
    const old = Date.now() - PEER_STALE_MS * 2;
    for (const f of stale) fs.utimesSync(f, old / 1000, old / 1000);
    standAside([VIEW], dir, self());
    defersNothing();
  });

  it("a claim that is not JSON, or JSON of the wrong shape", () => {
    fs.writeFileSync(path.join(dir, "garbage"), "{not json", "utf8");
    fs.writeFileSync(path.join(dir, "shaped-wrong"), JSON.stringify({ version: NEWER }), "utf8");
    standAside([VIEW], dir, self());
    defersNothing();
  });

  it("a claim whose view list is not a LIST at all", () => {
    const bad = { path: theirs, version: NEWER, views: "everything" };
    fs.writeFileSync(path.join(dir, "hand-written"), JSON.stringify(bad), "utf8");
    standAside([VIEW], dir, self());
    defersNothing();
    expect(peers(dir, self())[0].views).toEqual([]);
  });

  it("a NEWER engine that declares no view at all, which is every engine older than this rule", () => {
    // It announced before view names existed, or it lists none: either way it CLAIMS no zone, and claiming is the only
    // thing that can take one. Nothing is deferred to a silence.
    fs.writeFileSync(path.join(dir, "old-format"), JSON.stringify({ path: theirs, version: NEWER }), "utf8");
    standAside([VIEW], dir, self());
    defersNothing();
  });

  it("a register directory that cannot be read at all", () => {
    standAside([VIEW], path.join(dir, "nope", "deeper"), self());
    defersNothing();
  });

  it("a peer whose version does not parse, however new it looks", () => {
    announce(dir, other("newest-ever", [VIEW]));
    standAside([VIEW], dir, self());
    defersNothing();
  });

  it("a running engine whose OWN version does not parse", () => {
    announce(dir, other(NEWER, [VIEW]));
    standAside([VIEW], dir, self("dev"));
    defersNothing();
  });

  it("the opt-out, which draws whatever else is registered", () => {
    announce(dir, other(NEWER, [VIEW]));
    vi.stubEnv(NO_YIELD_ENV, "1");
    standAside([VIEW], dir, self());
    defersNothing();
  });

  it("the opt-out set EMPTY, which is a variable nobody meant to set", () => {
    announce(dir, other(NEWER, [VIEW]));
    vi.stubEnv(NO_YIELD_ENV, "");
    standAside([VIEW], dir, self());
    expect(defersView(VIEW)).toBe(true);
  });

  it("still announces under the opt-out, so a peer can defer to THIS engine", () => {
    vi.stubEnv(NO_YIELD_ENV, "1");
    standAside([VIEW], dir, self());
    expect(peers(dir, other(OLDER))).toEqual([{ path: ours, version: MINE, views: [VIEW] }]);
  });

  it("caps what one claim can cost on every flush", () => {
    const many = Array.from({ length: 400 }, (_, i) => `v${i}`);
    announce(dir, other(NEWER, many));
    expect(peers(dir, self())[0].views.length).toBeLessThanOrEqual(256);
  });
});
