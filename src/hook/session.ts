// The session lifecycle edges of the election's roster: SessionStart signs this engine on, SessionEnd tears the
// session's roster down, and between the two the fleet holds still. Same two storeys as runner.ts: handle* takes a
// PARSED payload and does the work with no process anywhere, run* is the thin edge over stdin. Neither exits the
// process, and neither ever throws: these run at a session's bookends, where a failure must cost nothing but the
// roster, which the first flush's net (holdElection) recreates.

import {
  announce,
  announceRoster,
  claimMuteWarning,
  clearRoster,
  locationOf,
  mutePeers,
  peers,
  peersDir,
  selfClaim,
  type Peer,
} from "../platform/peers.js";
import { declaredViews } from "../template/load.js";
import { notice } from "../notice.js";
import { BOLD, DIM, RESET, parseStdin, readStdin, sgr, stringField } from "@tayomi/utils";
import type { RenderOptions } from "../options.js";

/**
 * The dress the printed warning wears: the notice kit's header-and-box, in the accent TAYOMI's own session notices
 * warn in. The host renders ANSI inside a `systemMessage` (measured 2026-08-14), and the raw text prints in the
 * host's dim grey otherwise, unreadable on the very screen it exists for. The MODEL's copy stays plain prose:
 * escapes and box-drawing are noise in a context.
 */
const WARN_ACCENT = sgr("1;38;5;208");

/**
 * The in-row closer, SGR 22 (normal intensity), which ends BOLD and DIM both and touches nothing else. Never a full
 * RESET inside a boxed row: the host paints its dialog line in a colour of its own, a RESET cancels that too, and
 * everything after it (text, padding, the right border) renders default-bright (measured 2026-08-14). The header may
 * still RESET: nothing follows it on its line.
 */
const UNBOLD = sgr("22");

/**
 * The printed rendition, written for a reader who knows NOTHING of the mechanics: the problem in one breath, then the
 * culprits as the LIST they are (several installs can lag at once, and naming one would send the reader chasing the
 * wrong path next time), then the call, which happens in EACH listed location and never "here": the session the
 * reader sits in may well be the up-to-date one.
 */
function warningNotice(mute: Peer[]): string {
  const header = `⚠  ${WARN_ACCENT}cc-views · some projects need an update${RESET}`;
  const rows: Array<string | null> = [
    "engine versions from different generations are installed on this machine,",
    "and their renders can collide on screen over one same message:",
    null,
    // The LOCATION leads and wears the bold: it is the thing the reader acts on, the version only says how far it lags.
    ...mute.map((peer) => `${BOLD}${locationOf(peer.path)}${UNBOLD} ${DIM}${peer.version}${UNBOLD}`),
    null,
    `${BOLD}update @tayomi/cc-views in each location listed above${UNBOLD}, then restart.`,
    "an install already on the latest needs nothing: only the listed locations lag.",
  ];
  return notice(header, rows);
}

/** The model's rendition of the same facts: plain prose, full paths, nothing to render. */
function warningProse(mute: Peer[]): string {
  const culprits = mute.map((peer) => `${peer.version} at ${peer.path}`).join("; ");
  return (
    `cc-views: engine versions from different generations are installed and their renders can collide on screen. ` +
    `Outdated: ${culprits}. ` +
    `Update @tayomi/cc-views in each location carrying one of those paths, then restart the session.`
  );
}

/** The one payload field both edges read, non-empty or absent: an edge has no use for a roster keyed on "". */
function sessionOf(payload: unknown): string | undefined {
  return stringField(payload, "session_id") || undefined;
}

/**
 * The culprits a MIXED fleet owes a warning about, or null for the ordinary silence, shared by the two edges that can
 * carry one. A hook answer and never a drawn band, because a warning drawn INTO a message would ride the very
 * last-defined-answer race it warns about (MessageDisplay output carries no channel for it: display-only event, per
 * the hooks reference, read 2026-08-14). Claimed once per session fleet-wide, so however many engines and edges are
 * registered, exactly one warns.
 */
function claimedCulprits(sessionId: string | undefined): Peer[] | null {
  if (sessionId === undefined) return null;
  return claimMuteWarning(sessionId, mutePeers(peers(peersDir())));
}

/**
 * Sign this engine onto the session's roster, and onto the legacy register in the same breath: the engines from
 * before the election read nothing else. A malformed payload costs the signature alone, never the announce.
 *
 * Returns the hook's ANSWER, or null: a register already carrying a mute claim is warned about right here, before the
 * first message. The register's claims expire in an hour, so this edge alone would miss most mornings: the PROMPT edge
 * below is the one that never misses, and this one is the head start.
 */
/**
 * The SessionStart sources whose hook output the host does NOT put before the operator's eyes: a resumed or compacted
 * session replays the transcript over it (measured 2026-08-14, a fresh startup printing the same line). Warning there
 * would BURN the session's one claim on a line nobody reads, and silence the prompt edge whose relay does reach them.
 */
const UNSEEN_SOURCES = new Set(["resume", "compact"]);

export function handleSessionStart(payload: unknown, options?: RenderOptions): string | null {
  try {
    const self = selfClaim(declaredViews(options?.viewsPath));
    announce(peersDir(), self);
    const sessionId = sessionOf(payload);
    if (sessionId === undefined) return null;
    announceRoster(sessionId, peersDir(), self);
    if (UNSEEN_SOURCES.has(stringField(payload, "source") ?? "")) return null; // the prompt edge owns the claim here
    const culprits = claimedCulprits(sessionId);
    // systemMessage alone: on THIS event the host prints it to the operator directly (measured 2026-08-14).
    return culprits === null ? null : JSON.stringify({ systemMessage: warningNotice(culprits) });
  } catch {
    return null; // best effort at a bookend: the first flush recreates what this could not write
  }
}

/** The event name the prompt edge answers under, spelled once: the envelope's own field requires it. */
const PROMPT_EVENT = "UserPromptSubmit";

/**
 * The PROMPT edge: the moment a mixed fleet is named DURING the session that shows the damage. A mute engine signs the
 * register at its first flush, whatever emptied it before (a reboot, the hour's expiry), so the first prompt AFTER
 * that names it: the warning lands in the very session where views can collide, one turn behind the first risk.
 *
 * BOTH fields on purpose, measured 2026-08-14: the host prints the systemMessage under the prompt, but only when a
 * hookSpecificOutput accompanies it (alone it printed nothing), and the additionalContext is what keeps the session's
 * model in the loop, plain prose, no instruction: the printed line already does the telling.
 */
export function handleUserPrompt(payload: unknown): string | null {
  try {
    const culprits = claimedCulprits(sessionOf(payload));
    if (culprits === null) return null;
    return JSON.stringify({
      systemMessage: warningNotice(culprits),
      hookSpecificOutput: {
        hookEventName: PROMPT_EVENT,
        additionalContext: warningProse(culprits),
      },
    });
  } catch {
    return null;
  }
}

/** Tear down the ending session's roster, and only its own: a neighbouring live session keeps its fleet. */
export function handleSessionEnd(payload: unknown): void {
  try {
    const sessionId = sessionOf(payload);
    if (sessionId !== undefined) clearRoster(sessionId);
  } catch {
    // a roster that survives its session expires by age instead (SESSION_STALE_MS)
  }
}

/** The whole SessionStart edge: read stdin, sign on, warn where a warning is owed. What a host's hook file reduces to. */
export async function runSessionStartHook(options?: RenderOptions): Promise<void> {
  const envelope = handleSessionStart(parseStdin<Record<string, unknown>>(await readStdin()), options);
  if (envelope !== null) process.stdout.write(envelope);
}

/** The whole UserPromptSubmit edge: read stdin, warn where a warning is owed, say nothing otherwise. */
export async function runUserPromptHook(): Promise<void> {
  const envelope = handleUserPrompt(parseStdin<Record<string, unknown>>(await readStdin()));
  if (envelope !== null) process.stdout.write(envelope);
}

/** The whole SessionEnd edge: read stdin, tear down. */
export async function runSessionEndHook(): Promise<void> {
  handleSessionEnd(parseStdin<Record<string, unknown>>(await readStdin()));
}
