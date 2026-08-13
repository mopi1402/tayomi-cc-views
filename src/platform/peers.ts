// WHICH engine draws when more than one is registered on the machine: an ELECTION, one winner per view, computed the
// SAME by every engine from a shared register. The dispatcher's hook order is not ours to choose (docs/caveats.md), so
// each engine announces ITSELF and reads the others: two outputs for one block are impossible by construction.
//
// Two electorates for one transition's sake, folded into one and deduped by path. The session ROSTER is the design:
// signed at SessionStart, held still until SessionEnd, recreated by a first flush finding no signature. The
// machine-wide register is the legacy: engines from before the election announce and read nothing else. Claude Code's
// own settings and manifests are never read: that format is not ours and it moves.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ENGINE_VERSION } from "../data/engine.js";
import { ENGINES_DIR, NO_YIELD_ENV, SCRATCH_DIR, SESSIONS_DIR } from "../data/markup.js";
import { writeAtomic } from "./atomic.js";

/**
 * One engine's claim: where it runs from, the version of the code that would draw, and the view NAMES it can resolve.
 * The names are what makes the election a per-ZONE decision: an engine draws the views it WINS, with its own templates
 * and its own host's colours, and stays silent on every view someone else wins.
 */
export interface Peer {
  path: string;
  version: string;
  views: string[];
}

// A claim is a file another process wrote, read as input and never as truth. The cap bounds what one entry can cost on
// EVERY flush.
const MAX_VIEWS = 256;

/**
 * Read at CALL time, and machine-wide on purpose: `RenderOptions.stateDir` exists so a host does NOT share scratch with
 * another host, and a registry honouring it would put two engines in two directories where neither ever sees the other.
 */
export function peersDir(): string {
  return path.join(os.tmpdir(), SCRATCH_DIR, ENGINES_DIR);
}

/**
 * How long a claim is believed. Every registered engine rewrites its own on every flush, so one that stops running goes
 * stale by itself. Its own number rather than the message sweep's: two unrelated lifetimes sharing one constant is one
 * of them changing for the other's reason.
 */
export const PEER_STALE_MS = 60 * 60 * 1000;

/** Long enough that no two paths collide, short enough to stay a filename. */
const KEY_LEN = 32;
const DIGEST = "sha256";

// Split before matching, so each class stays FLAT. One pattern covering both halves nests a repetition inside an
// optional group, which the linter reads as unsafe on sight and which nothing here needs.
const PRE_MARK = "-";
const RELEASE_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const PRE_RE = /^[0-9A-Za-z.-]+$/;
const PART = ".";
const NUMERIC = /^\d+$/;
const RELEASE_FIELDS = 3;

interface Parsed {
  nums: number[];
  pre: string;
}

/** null for anything that is not a version, which is a peer this module declines to trust rather than one it ranks. */
function parse(v: string): Parsed | null {
  const cut = v.indexOf(PRE_MARK);
  const pre = cut === -1 ? "" : v.slice(cut + PRE_MARK.length);
  const m = RELEASE_RE.exec(cut === -1 ? v : v.slice(0, cut));
  if (m === null) return null;
  if (pre !== "" && !PRE_RE.test(pre)) return null;
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre };
}

// Semver's own rule: identifier by identifier, numerically where both are numbers, and a list that runs out first ranks
// below the one that continues.
function comparePre(a: string, b: string): number {
  const xs = a.split(PART);
  const ys = b.split(PART);
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    const x = xs[i];
    const y = ys[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (NUMERIC.test(x) && NUMERIC.test(y)) return Number(x) < Number(y) ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Negative, zero or positive, the way a comparator reads. A PRERELEASE sits below its own release, so `2.0.1-rc.0` is
 * under `2.0.1` and over `2.0.0`: the ordering a prerelease published for a rehearsal depends on.
 */
export function compareVersions(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  if (x === null || y === null) return 0; // unrankable: neither outranks the other, so neither silences the other
  for (let i = 0; i < RELEASE_FIELDS; i++) {
    if (x.nums[i] !== y.nums[i]) return x.nums[i] < y.nums[i] ? -1 : 1;
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === "") return 1;
  if (y.pre === "") return -1;
  return comparePre(x.pre, y.pre);
}

function selfPath(): string {
  try {
    return fileURLToPath(import.meta.url);
  } catch {
    return ""; // no path to claim: the entry below is one no peer will trust, which is the safe direction
  }
}

/** THIS engine's IDENTITY: the module that would draw, and the version the drawing code answers with. */
export const SELF: Peer = { path: selfPath(), version: ENGINE_VERSION, views: [] };

/**
 * The claim this flush announces. The names come from the CALLER's own search path, never from a default: a host
 * composing its own `viewsPath` resolves from nowhere else, and the register must state what would really be found.
 */
export function selfClaim(views: string[]): Peer {
  return { ...SELF, views: views.slice(0, MAX_VIEWS) };
}

/** The one open field, kept to what a reader can vouch for: a list of strings, bounded. */
function statedViews(read: unknown): string[] {
  if (!Array.isArray(read)) return [];
  return read.slice(0, MAX_VIEWS).filter((name): name is string => typeof name === "string");
}

function entryPath(dir: string, of: string): string {
  return path.join(dir, createHash(DIGEST).update(of).digest("hex").slice(0, KEY_LEN));
}

/**
 * Put this engine on the register. Write-once and atomic, the way every other write in this subsystem is: a reader
 * either does not see the file or sees it whole. Total, and a failure is the safe direction: an engine that cannot
 * announce is one nobody defers to.
 */
export function announce(dir: string = peersDir(), self: Peer = SELF): void {
  try {
    writeAtomic(entryPath(dir, self.path), JSON.stringify(self));
  } catch {
    // best effort by construction
  }
}

/**
 * The claims one directory holds, read with the same hygiene wherever they live. An expired claim (where an expiry
 * applies) and one whose path has gone are DROPPED on the way past: an engine that was uninstalled must not go on
 * silencing the ones left behind, and a claim nobody clears would cost a full expiry of raw screens.
 */
function claims(dir: string, self: Peer, staleMs: number | null): Peer[] {
  const out: Peer[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return out; // no register yet, or unreadable: nobody to defer to
  }
  const now = Date.now();
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      if (staleMs !== null && now - fs.statSync(file).mtimeMs > staleMs) {
        fs.rmSync(file, { force: true });
        continue;
      }
      const read: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      const claim = read as Partial<Peer> | null;
      if (typeof claim?.path !== "string" || typeof claim.version !== "string") continue;
      if (claim.path === self.path) continue; // ourselves, under whatever name this run wrote
      if (!fs.existsSync(claim.path)) {
        fs.rmSync(file, { force: true });
        continue;
      }
      out.push({ path: claim.path, version: claim.version, views: statedViews(claim.views) });
    } catch {
      // malformed, vanished under us, or unreadable: a claim that cannot be read silences nobody
    }
  }
  return out;
}

/** The other engines worth believing on the machine-wide register, the legacy electorate. */
export function peers(dir: string = peersDir(), self: Peer = SELF): Peer[] {
  return claims(dir, self, PEER_STALE_MS);
}

/**
 * A roster a SessionEnd never tore down, kept from outliving its machine: long enough that no live session is swept
 * (a resume re-announces and refreshes it), short enough that a crashed session's roster does not elect ghosts for a
 * week.
 */
export const SESSION_STALE_MS = 24 * 60 * 60 * 1000;

/** Where SESSION `id`'s roster lives. The id is a filename from another program: hashed, never trusted as a path. */
export function rosterDir(sessionId: string, dir: string = peersDir()): string {
  return path.join(dir, SESSIONS_DIR, createHash(DIGEST).update(sessionId).digest("hex").slice(0, KEY_LEN));
}

/**
 * Sign this engine onto a session's roster, sweeping ABANDONED sibling rosters on the way: SessionEnd is the intended
 * teardown, the sweep is the one for the session that never got its own.
 */
export function announceRoster(sessionId: string, dir: string = peersDir(), self: Peer = SELF): void {
  try {
    const roster = rosterDir(sessionId, dir);
    announce(roster, self);
    sweepRosters(path.dirname(roster), roster);
  } catch {
    // best effort by construction
  }
}

/** Whether THIS engine signed the session's roster at all, whatever the signature says: the bookends' question. */
export function rosterHolds(sessionId: string, dir: string = peersDir(), self: Peer = SELF): boolean {
  try {
    return fs.existsSync(entryPath(rosterDir(sessionId, dir), self.path));
  } catch {
    return false;
  }
}

/**
 * The flush's stricter question: does the signature still SAY this claim? A roster lying about the catalogue (a view
 * born or dead mid-session) hands a view two voices again. Every writer serialises the same shape, so comparing the
 * words is comparing the claim.
 */
function rosterCarries(sessionId: string, dir: string, self: Peer): boolean {
  try {
    return fs.readFileSync(entryPath(rosterDir(sessionId, dir), self.path), "utf8") === JSON.stringify(self);
  } catch {
    return false;
  }
}

/** Tear a session's roster down, which is SessionEnd's one job here. Someone else's roster is never touched. */
export function clearRoster(sessionId: string, dir: string = peersDir()): void {
  try {
    fs.rmSync(rosterDir(sessionId, dir), { recursive: true, force: true });
  } catch {
    // a roster that cannot be removed expires by age instead
  }
}

/** Drop sibling rosters whose sessions ended without a SessionEnd, sparing the one being written. */
function sweepRosters(sessionsDir: string, spare: string): void {
  const now = Date.now();
  for (const name of fs.readdirSync(sessionsDir)) {
    const dir = path.join(sessionsDir, name);
    if (dir === spare) continue;
    try {
      if (now - fs.statSync(dir).mtimeMs > SESSION_STALE_MS) fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // a sibling swept by someone else mid-read is a sibling already handled
    }
  }
}

/** The engines signed onto a session's roster. No age limit inside a live session: a session outlasting an hour keeps its fleet. */
export function rosterPeers(sessionId: string, dir: string = peersDir(), self: Peer = SELF): Peer[] {
  return claims(rosterDir(sessionId, dir), self, null);
}

// Proximity classes, nearest first: the checkout open in the project beats the project's own installed copy, which
// beats an install belonging to anywhere else (a global, another project), which beats a path saying neither.
const NODE_MODULES = "node_modules";
const IN_PROJECT = 0;
const IN_PROJECT_MODULES = 1;
const IN_OTHER_MODULES = 2;
const ELSEWHERE = 3;

/** How close an engine's code sits to the session's own project, the tie-break the user reaches for by instinct. */
function proximity(enginePath: string, cwd: string | undefined): number {
  const inModules = enginePath.includes(`${path.sep}${NODE_MODULES}${path.sep}`);
  if (cwd !== undefined && cwd !== "" && enginePath.startsWith(`${cwd}${path.sep}`)) {
    return inModules ? IN_PROJECT_MODULES : IN_PROJECT;
  }
  return inModules ? IN_OTHER_MODULES : ELSEWHERE;
}

/**
 * The TOTAL order the election sorts by, first is elected: a rankable version over an unrankable one, then the newest,
 * then the nearest, then the lesser path. Total on purpose, down to the last field: two engines left tied would each
 * compute itself the winner, and two voices is the disease this module exists to cure.
 */
function rank(a: Peer, b: Peer, cwd: string | undefined): number {
  const va = parse(a.version);
  const vb = parse(b.version);
  if (va === null || vb === null) {
    if ((va === null) !== (vb === null)) return va === null ? 1 : -1;
  } else {
    const byVersion = compareVersions(a.version, b.version);
    if (byVersion !== 0) return -byVersion;
  }
  const byProximity = proximity(a.path, cwd) - proximity(b.path, cwd);
  if (byProximity !== 0) return byProximity;
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/**
 * Every view whose election SELF loses, which is exactly the set this flush stays silent on. A view nobody else
 * declares is won unopposed and drawn; a view only OTHERS declare is lost by definition, resolvable here or not, and
 * that last clause is the cure for the worst screen this module ever produced: an older peer's own view echoed back as
 * raw prose above that peer's render, by an engine that could not resolve it and never asked who could.
 */
export function electedLosses(list: Peer[], self: Peer = SELF, cwd?: string): Set<string> {
  const out = new Set<string>();
  const mine = new Set(self.views);
  const contested = new Map<string, Peer[]>();
  for (const peer of list) {
    for (const name of peer.views) {
      const entry = contested.get(name);
      if (entry === undefined) contested.set(name, [peer]);
      else entry.push(peer);
    }
  }
  for (const [name, candidates] of contested) {
    if (!mine.has(name)) {
      out.add(name); // only others declare it: lost unopposed, theirs to draw
      continue;
    }
    let winner: Peer = self;
    for (const candidate of candidates) {
      if (rank(candidate, winner, cwd) < 0) winner = candidate;
    }
    if (winner !== self) out.add(name);
  }
  return out;
}

// The views this flush LOST, installed once by the hook edge and read per zone by the carriers. Module state rather
// than an argument threaded through the pipeline: a flush is one synchronous pass in a process of its own.
let DEFERRED: ReadonlySet<string> = new Set();

/** Install what this flush defers. Empty is the answer for every failure, and empty means DRAW. */
export function setDeferred(names: ReadonlySet<string>): void {
  DEFERRED = names;
}

/** Whether another engine on this machine WON this view's election, so this one leaves the zone for it. */
export function defersView(name: string): boolean {
  return DEFERRED.has(name);
}

/**
 * Announce this engine, then hold the election and install what this flush lost. Announcing precedes drawing ALWAYS:
 * an engine registered only while it drew would vanish once it deferred, and the two would take turns. The legacy
 * register is rewritten every flush (engines from before the election believe nothing else); the roster is re-signed
 * only where the signature is missing or stale, the net that lets a `.view` born mid-session elect without a restart.
 *
 * Total: every failure defers NOTHING, a wrong draw costing the screen this machine already had, a wrong deferral a
 * blank where a view was.
 */
export function holdElection(
  views: string[],
  sessionId: string | undefined,
  cwd: string | undefined,
  dir: string = peersDir(),
  me: Peer = SELF
): void {
  try {
    const self = { ...me, views: views.slice(0, MAX_VIEWS) };
    announce(dir, self);
    const off = process.env[NO_YIELD_ENV];
    if (off !== undefined && off !== "") return setDeferred(new Set());
    let electorate = peers(dir, self);
    if (sessionId !== undefined && sessionId !== "") {
      if (!rosterCarries(sessionId, dir, self)) announceRoster(sessionId, dir, self);
      // The roster's word outranks the legacy register's for one same engine: it was signed for THIS session.
      const signed = rosterPeers(sessionId, dir, self);
      const signedPaths = new Set(signed.map((peer) => peer.path));
      electorate = [...signed, ...electorate.filter((peer) => !signedPaths.has(peer.path))];
    }
    setDeferred(electedLosses(electorate, self, cwd));
  } catch {
    setDeferred(new Set());
  }
}
