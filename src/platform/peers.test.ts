// What this module owes the hook edge above it: one winner per view, computed the same from every engine, and the
// half with teeth is still the REFUSAL to yield. A suite that only ever proves the deferral cannot tell it apart from
// an engine that never draws, and every failure here has that same shape on screen: a blank where a view was. So each
// case that must NOT silence gets its own, and the cheapest way to break this module is to make one of them throw.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ENGINES_DIR, ENGINES_DIR_ENV, NO_YIELD_ENV, SCRATCH_DIR } from "../data/markup.js";
import {
  PEER_STALE_MS,
  SESSION_STALE_MS,
  announce,
  announceRoster,
  clearRoster,
  compareVersions,
  defersView,
  electedLosses,
  holdElection,
  peers,
  peersDir,
  rosterDir,
  rosterHolds,
  rosterPeers,
  type Peer,
} from "./peers.js";

/** Two engines, told apart by the path they run from, which is what the register keys on. */
const MINE = "2.0.0";
const NEWER = "2.0.1";
const OLDER = "1.9.0";

/** A session id the way the hook payload writes one. */
const SESSION = "sess-1";
const OTHER_SESSION = "sess-2";

let dir = "";
let ours = "";
let theirs = "";

/** A peer is believed only if the path it claims EXISTS, so a fake one needs a real file behind it. */
const engineAt = (name: string): string => {
  const file = path.join(dir, `${name}.js`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
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
    // knob a host turns precisely so it does NOT share. Empty redirect means unset: a variable nobody meant to set.
    vi.stubEnv(ENGINES_DIR_ENV, "");
    expect(peersDir()).toBe(path.join(os.tmpdir(), SCRATCH_DIR, ENGINES_DIR));
  });

  it("honours the redirect, read at CALL time: a harness's engines elect among themselves", () => {
    vi.stubEnv(ENGINES_DIR_ENV, dir);
    expect(peersDir()).toBe(dir);
  });

  it("keeps each session's roster under the register, keyed by the session and never by its raw name", () => {
    // The id is a filename another program wrote: hashed on the way to disk, so no id can climb out of the register.
    const roster = rosterDir(`../escape`, dir);
    expect(roster.startsWith(path.join(dir, "sessions"))).toBe(true);
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

// The rule, in one line: every view is an election with ONE winner, and this engine draws exactly the views it wins.
// Newest first, then the path nearest the project, then the lesser path, so two engines can compute the same result
// apart and never both speak.
describe("the election", () => {
  const MINE_ONLY = "onlymine";
  const BOTH = "shared";
  const THEIRS_ONLY = "onlytheirs";

  it("loses the view a NEWER peer also declares, so the newer one draws it", () => {
    announce(dir, other(NEWER, [BOTH, THEIRS_ONLY]));
    holdElection([MINE_ONLY, BOTH], undefined, undefined, dir, self());
    expect(defersView(BOTH)).toBe(true);
  });

  it("keeps the view only IT declares, which is the whole reason this is per zone", () => {
    announce(dir, other(NEWER, [BOTH, THEIRS_ONLY]));
    holdElection([MINE_ONLY, BOTH], undefined, undefined, dir, self());
    expect(defersView(MINE_ONLY)).toBe(false);
  });

  it("wins the view both declare against an OLDER peer, the newest still outranking", () => {
    announce(dir, other(OLDER, [BOTH]));
    holdElection([MINE_ONLY, BOTH], undefined, undefined, dir, self());
    expect(defersView(BOTH)).toBe(false);
  });

  it("loses a view only an OLDER peer declares, the cure for the echoed tldr", () => {
    // The regression this redesign exists for: an older engine alone held a view, this one could not resolve it, and
    // instead of asking the register who could, it let the block through as raw prose ABOVE that engine's render. A
    // view someone else declares and this engine does not is lost unopposed, resolvable here or not: silence, theirs.
    announce(dir, other(OLDER, [THEIRS_ONLY]));
    holdElection([MINE_ONLY, BOTH], undefined, undefined, dir, self());
    expect(defersView(THEIRS_ONLY)).toBe(true);
  });

  it("breaks a version TIE by the lesser path, one winner always", () => {
    // Both run the same code: somebody still has to be THE one to draw, and both must compute the same somebody.
    const a = claim(engineAt("aaa"), MINE, [BOTH]);
    const z = claim(engineAt("zzz"), MINE, [BOTH]);
    expect(electedLosses([z], a).has(BOTH)).toBe(false);
    expect(electedLosses([a], z).has(BOTH)).toBe(true);
  });

  it("breaks a version tie by PROXIMITY first: the project's own checkout beats an installed copy", () => {
    const project = path.join(dir, "project");
    const checkout = claim(engineAt(path.join("project", "dist", "engine")), MINE, [BOTH]);
    const installed = claim(engineAt(path.join("project", "node_modules", "pkg", "engine")), MINE, [BOTH]);
    expect(electedLosses([installed], checkout, project).has(BOTH)).toBe(false);
    expect(electedLosses([checkout], installed, project).has(BOTH)).toBe(true);
  });

  it("ranks an engine whose version does not PARSE below any rankable peer", () => {
    const dev = claim(ours, "dev", [BOTH]);
    announce(dir, other(OLDER, [BOTH]));
    holdElection([BOTH], undefined, undefined, dir, dev);
    expect(defersView(BOTH)).toBe(true); // the rankable 1.9.0 wins over a version nobody can place
  });

  it("announces the names it was handed, so a peer can elect against THIS engine", () => {
    holdElection([MINE_ONLY, BOTH], undefined, undefined, dir, self());
    expect(peers(dir, other(OLDER))).toEqual([
      { path: ours, version: MINE, views: [MINE_ONLY, BOTH] },
    ]);
  });

  it("computes the losses from a LIST the same way, the pure half a test can hold still", () => {
    const list: Peer[] = [
      { path: "/old", version: OLDER, views: ["oldonly"] },
      { path: "/new", version: NEWER, views: [BOTH] },
    ];
    // BOTH is lost to the newer peer; oldonly is lost unopposed, self never having declared it.
    expect([...electedLosses(list, self())].sort()).toEqual(["oldonly", BOTH]);
  });
});

// The fleets a user actually runs, told as stories. Each ends the same way: one voice per view, computed alike from
// every engine in the fleet. The pure half (electedLosses) is enough to tell them, cwd standing in for the session.
describe("the fleets a user actually runs", () => {
  const BUNDLED = "columns";
  const TLDR = "tldr";
  const CUSTOM = "toto";

  it("a checkout mid-upgrade draws the bundled views over the plugin's engine", () => {
    // Coding the next version in the open repo: the bump wins, and even WITHOUT it the checkout is nearer.
    const project = path.join(dir, "project");
    const checkout = claim(engineAt(path.join("project", "dist", "engine")), NEWER, [BUNDLED]);
    const plugin = claim(engineAt(path.join("plugins", "node_modules", "pkg", "engine")), MINE, [BUNDLED]);
    expect(electedLosses([plugin], checkout, project).has(BUNDLED)).toBe(false);
    expect(electedLosses([checkout], plugin, project).has(BUNDLED)).toBe(true);
    const unbumped = { ...checkout, version: MINE };
    expect(electedLosses([plugin], unbumped, project).has(BUNDLED)).toBe(false);
    expect(electedLosses([unbumped], plugin, project).has(BUNDLED)).toBe(true);
  });

  it("splits the screen: the project's newer install draws the bundled views, the plugin its OWN", () => {
    // tldr lives in the plugin's views dir alone: the filter runs before any ranking, so the newest engine on the
    // machine never outranks the only one that resolves it.
    const project = path.join(dir, "project");
    const installed = claim(engineAt(path.join("project", "node_modules", "pkg", "engine")), NEWER, [BUNDLED]);
    const plugin = claim(engineAt(path.join("plugins", "node_modules", "pkg", "engine")), OLDER, [BUNDLED, TLDR]);
    const installedLosses = electedLosses([plugin], installed, project);
    expect(installedLosses.has(BUNDLED)).toBe(false);
    expect(installedLosses.has(TLDR)).toBe(true);
    const pluginLosses = electedLosses([installed], plugin, project);
    expect(pluginLosses.has(BUNDLED)).toBe(true);
    expect(pluginLosses.has(TLDR)).toBe(false);
  });

  it("a project's own view with ONLY a plugin installed is the plugin's, unopposed", () => {
    // No engine in the project at all: the plugin's search path still opens with ./views, so it DECLARES the custom
    // name and draws it with the project's template.
    const project = path.join(dir, "project");
    const plugin = claim(engineAt(path.join("plugins", "node_modules", "pkg", "engine")), MINE, [BUNDLED, CUSTOM]);
    expect(electedLosses([], plugin, project).has(CUSTOM)).toBe(false);
  });

  it("a global install alone wins the project's view, and a plugin arriving later leaves ONE voice", () => {
    const project = path.join(dir, "project");
    const globalInstall = claim(engineAt(path.join("lib", "node_modules", "pkg", "engine")), MINE, [CUSTOM]);
    expect(electedLosses([], globalInstall, project).has(CUSTOM)).toBe(false);
    // Same version, each an install outside the project: the lesser path is the last word, computed alike from both.
    const plugin = claim(engineAt(path.join("plugins", "node_modules", "pkg", "engine")), MINE, [CUSTOM]);
    const fleet = [globalInstall, plugin];
    const winners = fleet.filter(
      (engine) => !electedLosses(fleet.filter((peer) => peer !== engine), engine, project).has(CUSTOM)
    );
    expect(winners).toHaveLength(1);
  });
});

describe("the session roster", () => {
  const VIEW = "somewhere";

  it("signs on, reads back, and never hands an engine to itself", () => {
    announceRoster(SESSION, dir, { ...self(), views: [VIEW] });
    announceRoster(SESSION, dir, { ...other(NEWER), views: [VIEW] });
    expect(rosterHolds(SESSION, dir, self())).toBe(true);
    expect(rosterPeers(SESSION, dir, self())).toEqual([{ path: theirs, version: NEWER, views: [VIEW] }]);
  });

  it("keeps a roster PER session: tearing one down leaves the neighbour's fleet standing", () => {
    announceRoster(SESSION, dir, { ...self(), views: [VIEW] });
    announceRoster(OTHER_SESSION, dir, { ...self(), views: [VIEW] });
    clearRoster(SESSION, dir);
    expect(rosterHolds(SESSION, dir, self())).toBe(false);
    expect(rosterHolds(OTHER_SESSION, dir, self())).toBe(true);
  });

  it("outlives the register's own expiry: a session longer than an hour keeps its fleet", () => {
    announceRoster(SESSION, dir, { ...other(NEWER), views: [VIEW] });
    const roster = rosterDir(SESSION, dir);
    const old = Date.now() - PEER_STALE_MS * 2;
    for (const n of fs.readdirSync(roster)) fs.utimesSync(path.join(roster, n), old / 1000, old / 1000);
    expect(rosterPeers(SESSION, dir, self())).toHaveLength(1);
  });

  it("sweeps a roster whose session never got its SessionEnd, on the next signature", () => {
    announceRoster(OTHER_SESSION, dir, { ...self(), views: [VIEW] });
    const abandoned = rosterDir(OTHER_SESSION, dir);
    const old = Date.now() - SESSION_STALE_MS * 2;
    fs.utimesSync(abandoned, old / 1000, old / 1000);
    announceRoster(SESSION, dir, { ...self(), views: [VIEW] });
    expect(fs.existsSync(abandoned)).toBe(false);
  });

  it("is recreated by the first flush that finds its own signature missing, the net under the wire", () => {
    holdElection([VIEW], SESSION, undefined, dir, self());
    expect(rosterHolds(SESSION, dir, self())).toBe(true);
  });

  it("re-signs a roster whose claim went STALE, so a view born mid-session keeps one voice", () => {
    // The session opened before the view existed: both engines signed without it. Every flush re-reads the catalogue
    // from disk, and a roster left lying would show EACH engine a fleet where nobody else declares the newcomer: both
    // would draw it, the disease this module exists to cure.
    announceRoster(SESSION, dir, self());
    announceRoster(SESSION, dir, other(NEWER));
    holdElection([VIEW], SESSION, undefined, dir, other(NEWER));
    const theirsLost = defersView(VIEW);
    holdElection([VIEW], SESSION, undefined, dir, self());
    expect([theirsLost, defersView(VIEW)]).toEqual([false, true]); // one voice, the newer engine's
  });

  it("leaves a signature alone while the claim it carries still holds, the stability the roster is FOR", () => {
    announceRoster(SESSION, dir, { ...self(), views: [VIEW] });
    const roster = rosterDir(SESSION, dir);
    const entry = path.join(roster, fs.readdirSync(roster)[0]);
    const signed = Date.now() - PEER_STALE_MS; // any past moment: only "not rewritten" matters
    fs.utimesSync(entry, signed / 1000, signed / 1000);
    holdElection([VIEW], SESSION, undefined, dir, self());
    expect(fs.statSync(entry).mtimeMs).toBeLessThan(signed + PEER_STALE_MS / 2);
  });

  it("believes the roster over the legacy register for one same engine, signed for THIS session", () => {
    // The legacy entry is rewritten on every flush by every engine, old ones included; the roster is what the session
    // opened with. Where both speak for one path, the session's word stands.
    announce(dir, other(NEWER, [VIEW]));
    announceRoster(SESSION, dir, { ...other(OLDER), views: [] });
    holdElection([VIEW], SESSION, undefined, dir, self());
    expect(defersView(VIEW)).toBe(false); // the roster's word: no view claimed, nothing lost to it
  });
});

describe("what must never silence a screen", () => {
  const VIEW = "somewhere";

  /** Every case here ends the same way: this engine defers NOTHING, so it draws what it has. */
  const defersNothing = (): void => expect(defersView(VIEW)).toBe(false);

  it("an engine that was UNINSTALLED, its claim dropped on the way past", () => {
    announce(dir, other(NEWER, [VIEW]));
    fs.rmSync(theirs);
    holdElection([VIEW], undefined, undefined, dir, self());
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
    holdElection([VIEW], undefined, undefined, dir, self());
    defersNothing();
  });

  it("a claim that is not JSON, or JSON of the wrong shape", () => {
    fs.writeFileSync(path.join(dir, "garbage"), "{not json", "utf8");
    fs.writeFileSync(path.join(dir, "shaped-wrong"), JSON.stringify({ version: NEWER }), "utf8");
    holdElection([VIEW], undefined, undefined, dir, self());
    defersNothing();
  });

  it("a claim whose view list is not a LIST at all", () => {
    const bad = { path: theirs, version: NEWER, views: "everything" };
    fs.writeFileSync(path.join(dir, "hand-written"), JSON.stringify(bad), "utf8");
    holdElection([VIEW], undefined, undefined, dir, self());
    defersNothing();
    expect(peers(dir, self())[0].views).toEqual([]);
  });

  it("a NEWER engine that declares no view at all, which is every engine older than this rule", () => {
    // It announced before view names existed, or it lists none: either way it CLAIMS no zone, and claiming is the only
    // thing that can take one. Nothing is lost to a silence.
    fs.writeFileSync(path.join(dir, "old-format"), JSON.stringify({ path: theirs, version: NEWER }), "utf8");
    holdElection([VIEW], undefined, undefined, dir, self());
    defersNothing();
  });

  it("a register directory that cannot be read at all", () => {
    holdElection([VIEW], undefined, undefined, path.join(dir, "nope", "deeper"), self());
    defersNothing();
  });

  it("a peer whose version does not parse, however new it looks", () => {
    announce(dir, other("newest-ever", [VIEW]));
    holdElection([VIEW], undefined, undefined, dir, self());
    defersNothing();
  });

  it("the opt-out, which draws whatever else is registered", () => {
    announce(dir, other(NEWER, [VIEW]));
    vi.stubEnv(NO_YIELD_ENV, "1");
    holdElection([VIEW], undefined, undefined, dir, self());
    defersNothing();
  });

  it("the opt-out set EMPTY, which is a variable nobody meant to set", () => {
    announce(dir, other(NEWER, [VIEW]));
    vi.stubEnv(NO_YIELD_ENV, "");
    holdElection([VIEW], undefined, undefined, dir, self());
    expect(defersView(VIEW)).toBe(true);
  });

  it("still announces under the opt-out, so a peer can elect against THIS engine", () => {
    vi.stubEnv(NO_YIELD_ENV, "1");
    holdElection([VIEW], undefined, undefined, dir, self());
    expect(peers(dir, other(OLDER))).toEqual([{ path: ours, version: MINE, views: [VIEW] }]);
  });

  it("caps what one claim can cost on every flush", () => {
    const many = Array.from({ length: 400 }, (_, i) => `v${i}`);
    announce(dir, other(NEWER, many));
    expect(peers(dir, self())[0].views.length).toBeLessThanOrEqual(256);
  });
});
