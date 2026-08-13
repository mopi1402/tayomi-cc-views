// The MessageDisplay edge, shipped: everything between stdin and stdout that every adopter would otherwise restate.
//
// Two storeys on purpose. handleMessageDisplay takes a PARSED payload and returns the envelope or null: all of the
// reassembly logic, no process anywhere, which is what makes the dance testable. runMessageDisplayHook is the thin edge
// over it. Neither ever exits the process: the exit belongs to the caller (the bin below, or a host's own edge).

import { slice, type DisplayHost } from "../pipeline.js";
import {
  awaitEarlier,
  dropMessage,
  recordDelta,
  sweepStale,
} from "../platform/stream-state.js";
import { DEFAULT_STATE_DIR } from "../platform/scratch.js";
import { holdElection } from "../platform/peers.js";
import { declaredViews } from "../template/load.js";
import { parseStdin, readStdin, stringField } from "@tayomi/utils";
import type { RenderOptions } from "../options.js";

/** The event this edge answers to, spelled once: the envelope names it whether it carries text or a suppression. */
const EVENT = "MessageDisplay";

/** The payload meta a host may key on, parsed once by the runner. */
export interface MessageContext {
  messageId: string;
  promptId?: string;
  sessionId?: string;
  cwd?: string;
  final: boolean;
}

/**
 * A host, or a factory building one per message: a host that keys its behaviour on the turn (a render marker per
 * prompt, a note list per session) needs the payload meta, and the runner is the one who parsed it.
 */
export type HostSource = DisplayHost | ((ctx: MessageContext) => DisplayHost | undefined);

/**
 * One flush in, the envelope to print out, or null when there is nothing to say (the host's own delta rendering
 * stands). Total: any malformed payload is null, never a throw, because this runs on every streamed delta of every
 * message.
 */
export async function handleMessageDisplay(
  payload: unknown,
  host?: HostSource,
  options?: RenderOptions
): Promise<string | null> {
  try {
    if (payload === null || typeof payload !== "object") return null;
    const d = payload as Record<string, unknown>;
    const id = stringField(d, "message_id") || "nomsg";
    const cwd = stringField(d, "cwd");
    const delta = stringField(d, "delta") ?? ""; // ?? and not ||: an empty delta is a real delta
    const final = d.final === true;
    const ctx: MessageContext = {
      messageId: id,
      promptId: stringField(d, "prompt_id"),
      sessionId: stringField(d, "session_id"),
      cwd,
      final,
    };
    // Before any RENDER, and per ZONE: the election says which views this flush draws and which it leaves, whatever
    // order the dispatcher chose. After the parse on purpose: the electorate is the SESSION's roster, and the
    // proximity tie-break reads the project's own directory.
    holdElection(declaredViews(options?.viewsPath), ctx.sessionId, cwd);
    const resolved = typeof host === "function" ? host(ctx) : host;
    const stateDir = options?.stateDir ?? DEFAULT_STATE_DIR;
    // The flush's position in its message, and the ONLY ordering this edge trusts. A payload without it (an older
    // protocol, or a runner handing the whole message over as one delta) is treated as a message of its own: render the
    // delta alone rather than accumulate against a sequence that was never numbered.
    const index =
      typeof d.index === "number" && Number.isInteger(d.index) && d.index >= 0 ? d.index : null;
    let prev = "";
    let whole = true;
    if (index !== null) {
      // Recorded BEFORE the prefix is read, and that order is the contract: a successor waits on this file, so the wait
      // it pays is one process startup and not one render.
      recordDelta(id, index, delta, stateDir);
      const earlier = await awaitEarlier(id, index, undefined, stateDir);
      prev = earlier.text;
      whole = earlier.complete;
    }
    // An incomplete prefix means a predecessor never landed, so no offset into the screen can be computed. The delta
    // renders ALONE instead of going back to the host: handed back, a zone's opening lines printed raw and stayed
    // (measured 2026-08-11). The engine's own withholding cuts what still streams; prose stays prose, null means prose.
    const display = whole
      ? slice(prev, delta, resolved, final, cwd, options)
      : slice("", delta, resolved, final, cwd, options);
    if (final && index !== null) {
      dropMessage(id, stateDir);
      sweepStale(undefined, stateDir);
    }
    if (display === null) return null;
    // "" INCLUDED, and it is the protocol's own suppression: the host schema reads any DEFINED displayContent as the
    // delta's replacement, and omitting it means "display the original" (read off the 2.1.228 binary, 2026-08-11).
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: EVENT,
        displayContent: display,
      },
    });
  } catch {
    return null; // fail open: emit nothing, the host shows the original text
  }
}

/**
 * The whole edge: read stdin, reassemble, write the envelope. What a host's own hook file reduces to (plus its exit),
 * and what the zero-config bin calls with no arguments at all.
 */
export async function runMessageDisplayHook(
  host?: HostSource,
  options?: RenderOptions
): Promise<void> {
  const payload = parseStdin<Record<string, unknown>>(await readStdin());
  if (payload === null) return;
  const envelope = await handleMessageDisplay(payload, host, options);
  if (envelope !== null) process.stdout.write(envelope);
}
