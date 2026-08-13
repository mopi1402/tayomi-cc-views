// The session lifecycle edges of the election's roster: SessionStart signs this engine on, SessionEnd tears the
// session's roster down, and between the two the fleet holds still. Same two storeys as runner.ts: handle* takes a
// PARSED payload and does the work with no process anywhere, run* is the thin edge over stdin. Neither exits the
// process, and neither ever throws: these run at a session's bookends, where a failure must cost nothing but the
// roster, which the first flush's net (holdElection) recreates.

import { announce, announceRoster, clearRoster, peersDir, selfClaim } from "../platform/peers.js";
import { declaredViews } from "../template/load.js";
import { parseStdin, readStdin } from "@tayomi/utils";
import type { RenderOptions } from "../options.js";

/** The one payload field both edges read. Claude Code writes it on every hook event, absent here on a bad payload. */
function sessionOf(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== "object") return undefined;
  const id = (payload as Record<string, unknown>).session_id;
  return typeof id === "string" && id !== "" ? id : undefined;
}

/**
 * Sign this engine onto the session's roster, and onto the legacy register in the same breath: the engines from
 * before the election read nothing else. A malformed payload costs the signature alone, never the announce.
 */
export function handleSessionStart(payload: unknown, options?: RenderOptions): void {
  try {
    const self = selfClaim(declaredViews(options?.viewsPath));
    announce(peersDir(), self);
    const sessionId = sessionOf(payload);
    if (sessionId !== undefined) announceRoster(sessionId, peersDir(), self);
  } catch {
    // best effort at a bookend: the first flush recreates what this could not write
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

/** The whole SessionStart edge: read stdin, sign on. What a host's SessionStart hook file reduces to. */
export async function runSessionStartHook(options?: RenderOptions): Promise<void> {
  handleSessionStart(parseStdin<Record<string, unknown>>(await readStdin()), options);
}

/** The whole SessionEnd edge: read stdin, tear down. */
export async function runSessionEndHook(): Promise<void> {
  handleSessionEnd(parseStdin<Record<string, unknown>>(await readStdin()));
}
