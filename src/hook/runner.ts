// The MessageDisplay edge, shipped: everything between stdin and stdout that every
// adopter would otherwise restate, and that took three incidents to get right (the
// lost update the delta log replaces, the UTF-8 split the joined-buffer read
// prevents, fail-open everywhere so an error never blanks the screen).
//
// Two storeys on purpose. handleMessageDisplay takes a PARSED payload and returns
// the envelope or null: all of the reassembly logic, no process anywhere, which is
// what makes the dance testable. runMessageDisplayHook is the thin edge over it,
// and the only storey that touches stdin or stdout. Neither ever exits the
// process: a library that calls process.exit cannot be composed, so the exit
// belongs to the caller (the bin below, or a host's own edge).

import { slice, type DisplayHost } from "../pipeline.js";
import {
  awaitEarlier,
  dropMessage,
  recordDelta,
  sweepStale,
} from "../platform/stream-state.js";
import { DEFAULT_STATE_DIR } from "../platform/scratch.js";
import { parseStdin, readStdin } from "@tayomi/utils";
import type { RenderOptions } from "../options.js";

/** The payload meta a host may key on, parsed once by the runner. */
export interface MessageContext {
  messageId: string;
  promptId?: string;
  sessionId?: string;
  cwd?: string;
  final: boolean;
}

/**
 * A host, or a factory building one per message: a host that keys its behaviour on
 * the turn (a render marker per prompt, a note list per session) needs the payload
 * meta, and the runner is the one who parsed it.
 */
export type HostSource = DisplayHost | ((ctx: MessageContext) => DisplayHost | undefined);

/**
 * One flush in, the envelope to print out, or null when there is nothing to say
 * (the host's own delta rendering stands). Total: any malformed payload is null,
 * never a throw, because this runs on every streamed delta of every message.
 */
export async function handleMessageDisplay(
  payload: unknown,
  host?: HostSource,
  options?: RenderOptions
): Promise<string | null> {
  try {
    if (payload === null || typeof payload !== "object") return null;
    const d = payload as Record<string, unknown>;
    const id = typeof d.message_id === "string" && d.message_id !== "" ? d.message_id : "nomsg";
    const cwd = typeof d.cwd === "string" ? d.cwd : undefined;
    const delta = typeof d.delta === "string" ? d.delta : "";
    const final = d.final === true;
    const ctx: MessageContext = {
      messageId: id,
      promptId: typeof d.prompt_id === "string" ? d.prompt_id : undefined,
      sessionId: typeof d.session_id === "string" ? d.session_id : undefined,
      cwd,
      final,
    };
    const resolved = typeof host === "function" ? host(ctx) : host;
    const stateDir = options?.stateDir ?? DEFAULT_STATE_DIR;
    // The flush's position in its message, and the ONLY ordering this edge trusts.
    // A payload without it (an older protocol, or a runner handing the whole
    // message over as one delta) is treated as a message of its own: render the
    // delta alone rather than accumulate against a sequence that was never
    // numbered.
    const index =
      typeof d.index === "number" && Number.isInteger(d.index) && d.index >= 0 ? d.index : null;
    let prev = "";
    let whole = true;
    if (index !== null) {
      // Recorded BEFORE the prefix is read, and that order is the contract: a
      // successor waits on this file, so the wait it pays is one process startup
      // and not one render.
      recordDelta(id, index, delta, stateDir);
      const earlier = await awaitEarlier(id, index, undefined, stateDir);
      prev = earlier.text;
      whole = earlier.complete;
    }
    // An incomplete prefix means a predecessor never landed, so no offset into the
    // screen can be computed. Fail open to the host's own delta: raw markdown for
    // one flush is ugly, a swallowed sentence is not recoverable.
    const display = whole ? slice(prev, delta, resolved, final, cwd, options) : null;
    if (final && index !== null) {
      dropMessage(id, stateDir);
      sweepStale(undefined, stateDir);
    }
    if (display === null) return null;
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "MessageDisplay",
        displayContent: display,
      },
    });
  } catch {
    return null; // fail open: emit nothing, the host shows the original text
  }
}

/**
 * The whole edge: read stdin, reassemble, write the envelope. What a host's own
 * hook file reduces to (plus its exit), and what the zero-config bin calls with
 * no arguments at all.
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
