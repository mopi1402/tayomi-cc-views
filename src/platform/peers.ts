// WHICH engine draws when more than one is registered on the machine.
//
// Claude Code chains every MessageDisplay hook and the FIRST to run consumes the zone, an order that is not ours to
// choose (docs/caveats.md). So without this the engine that draws is whichever the dispatcher happened to call first,
// and a plugin's older copy silently drew over a newer checkout: the only cure was a publish and a plugin bump per
// change. Here each engine announces ITSELF and reads the others, so the newest one draws whatever the order.
//
// It never reads Claude Code's own settings or plugin manifests. That format is not ours and it moves; an engine
// answering for itself alone is the one thing that cannot go out of date.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ENGINE_VERSION } from "../data/engine.js";
import { ENGINES_DIR, NO_YIELD_ENV, SCRATCH_DIR } from "../data/markup.js";

/**
 * One engine's claim: where it runs from, the version of the code that would draw, and the view NAMES it can resolve.
 * The names are what makes the yield a per-ZONE decision: an engine stands aside on a view a newer engine also has, and
 * draws every other one itself, with its own templates and its own host's colours.
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
    fs.mkdirSync(dir, { recursive: true });
    const target = entryPath(dir, self.path);
    const tmp = `${target}.${process.pid}.part`;
    fs.writeFileSync(tmp, JSON.stringify(self), "utf8");
    fs.renameSync(tmp, target);
  } catch {
    // best effort by construction
  }
}

/**
 * The other engines worth believing. An expired claim and one whose path has gone are DROPPED on the way past: an
 * engine that was uninstalled must not go on silencing the ones left behind, and a claim nobody clears would cost a
 * full expiry of raw screens.
 */
export function peers(dir: string = peersDir(), self: Peer = SELF): Peer[] {
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
      if (now - fs.statSync(file).mtimeMs > PEER_STALE_MS) {
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

/**
 * The views a strictly NEWER engine also has. Those and only those are the zones this engine stands aside on: a view no
 * newer engine declares is one only this engine can draw, and a view nobody else has is nobody else's to draw.
 *
 * Names rather than a verdict on the whole message, which is the entire point. An engine that stood down for a message
 * left every zone in it to whoever ran next, so a view the newer engine did NOT have reached the screen as raw text
 * with nobody left to draw it. Standing aside per zone costs nothing: the chain already consumes zone by zone.
 */
export function newerViews(list: Peer[], self: Peer = SELF): Set<string> {
  const out = new Set<string>();
  if (parse(self.version) === null) return out; // unrankable: this engine outranks nobody and defers to nobody
  for (const peer of list) {
    if (compareVersions(peer.version, self.version) <= 0) continue;
    for (const name of peer.views) out.add(name);
  }
  return out;
}

// The names this flush stands aside on, installed once by the hook edge and read per zone by the carriers. Module state
// rather than an argument threaded through the pipeline: a flush is one synchronous pass in a process of its own.
let DEFERRED: ReadonlySet<string> = new Set();

/** Install what this flush defers. Empty is the answer for every failure, and empty means DRAW. */
export function setDeferred(names: ReadonlySet<string>): void {
  DEFERRED = names;
}

/** Whether a newer engine on this machine also has this view, so this one leaves the zone for it. */
export function defersView(name: string): boolean {
  return DEFERRED.has(name);
}

/**
 * Announce this engine and work out what it stands aside on. The announce comes first and always: an engine that only
 * appeared on the register when it drew would vanish from it the moment it started deferring, and the two would take
 * turns.
 *
 * Total. Every failure defers NOTHING, because the cost of a wrong deferral is a blank where a view was, and the cost
 * of a wrong draw is the screen this machine already had.
 */
export function standAside(views: string[], dir: string = peersDir(), me: Peer = SELF): void {
  try {
    const self = { ...me, views: views.slice(0, MAX_VIEWS) };
    announce(dir, self);
    const off = process.env[NO_YIELD_ENV];
    if (off !== undefined && off !== "") return setDeferred(new Set());
    setDeferred(newerViews(peers(dir, self), self));
  } catch {
    setDeferred(new Set());
  }
}
