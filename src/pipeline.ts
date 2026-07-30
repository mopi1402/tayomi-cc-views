// The display pipeline: one message in, the text to show on screen out.
//
// This is the only module that knows all the layers at once, which is exactly what
// an orchestration is. It composes them in the one order that is safe on a stream:
// render the closed blocks, withhold what is still arriving, then render the markup.
//
// MessageDisplay streams a message flush by flush, so slice() recomputes the target
// transform of the WHOLE message so far and emits only the newly-revealed slice.
// Concatenated slices equal the target, which masks a raw block while it streams and
// reveals the render when its fence closes. Fail-open throughout: any error shows the
// original text, never a crash or a blank screen.
//
// slice() is a PURE function of the text before the flush and the flush's own delta.
// It holds no offset from the flush before it, which is what lets the concurrent
// flushes of one message compute their slices without agreeing on anything (see
// platform/stream-state.ts for the lost update that carrying an offset produced).

import { BLOCK_RE, cutUnclosedBlock } from "./carrier/scan.js";
import {
  DECORATOR_HINT,
  cutStreamingDecorated,
  renderDecorated,
} from "./carrier/decorator.js";
import { renderTags } from "./style.js";
import { defaultViewsPath } from "./template/load.js";
import { renderView } from "./template/render.js";
import type { RenderOptions } from "./options.js";
import type { Scope } from "./scope.js";

/**
 * What the HOST supplies to the engine, and the only channel by which anything
 * outside this subsystem reaches a render. Every member is optional: with no host
 * at all the engine still renders every block from the block's own text, which is
 * what keeps it free of any notion of its host (see the three members below).
 */
export interface DisplayHost {
  /**
   * Extra scope the host decides to merge into a view, for facts the model did not
   * write. Returning undefined means "nothing to add", and the view renders exactly
   * as it would if this member did not exist.
   */
  inject?(view: string, body: string, cwd?: string): Scope | undefined;
  /**
   * The ONE view that must never fail open to its raw markdown, and the line shown
   * in its place. Without it, a failing view shows its raw block like any other.
   */
  strict?: { view: string; failedLine: string };
  /**
   * The strict view's render outcome, reported ONCE per message and only on the
   * final delta. Gated here rather than by the host because transform() recomputes
   * over the WHOLE message on every delta: an ungated report would fire again and
   * again and make the outcome a function of how the host chunked the stream.
   */
  onRendered?(ok: boolean, error: string | null): void;
}

/**
 * Render the view blocks of a message.
 *
 * `host` and `final` are OPTIONAL, so a caller with no host renders every block
 * from the block's own text and nothing else. That is the property that makes this
 * subsystem free-standing: it never imports the host's state, the host hands it in.
 */
export function transform(
  full: string,
  host?: DisplayHost,
  final?: boolean,
  cwd?: string,
  options?: RenderOptions
): string {
  const strictView = host?.strict?.view;
  let outcome: { ok: boolean; error: string | null } | null = null;
  let out = full.replace(BLOCK_RE, (m: string, name: string, bodyText: string) => {
    try {
      // Pass the raw block text: renderView parses it with the view's own
      // @fields directive. A total parser plus this catch means any oddity
      // shows the raw block, never a blank screen.
      const rendered =
        renderView(
          name,
          bodyText,
          options?.viewsPath ?? defaultViewsPath(),
          host?.inject?.(name, bodyText, cwd),
          options
        ) + "\n";
      if (name === strictView) outcome = { ok: true, error: null };
      return rendered;
    } catch (e) {
      if (name === strictView && host?.strict !== undefined) {
        outcome = { ok: false, error: e instanceof Error ? e.message : String(e) };
        return host.strict.failedLine + "\n"; // discreet, never the raw block nor its fences
      }
      return m; // fail-open: show the raw block
    }
  });
  if (outcome !== null && final === true) {
    const { ok, error } = outcome as { ok: boolean; error: string | null };
    host?.onRendered?.(ok, error);
  }
  out = cutUnclosedBlock(out);
  // Withheld first, rendered second: a zone still arriving is gone before the
  // carrier ever sees it, so a half-formed payload can never render.
  if (final !== true) out = cutStreamingDecorated(out);
  out = renderDecorated(out, options?.viewsPath ?? defaultViewsPath(), options);
  return renderTags(out);
}

/** Does this message carry anything the engine has business touching at all? */
function engaged(full: string): boolean {
  return full.includes("```view:") || full.includes("{{") || full.includes(DECORATOR_HINT);
}

/** How many leading characters two strings share. */
function sharedPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

/**
 * What ONE flush puts on screen, or null when the host should show its own delta.
 *
 * `prev` is the text of every earlier flush of this message. The offset is DERIVED
 * from it (transform it again and measure) rather than remembered from the process
 * that ran before, and paying for a second transform per flush is the point: a
 * remembered offset is shared mutable state, and three flushes in flight at once lost
 * updates on it.
 *
 * `null` on a message the engine has no business in, so the host keeps its own
 * rendering of the delta (Claude Code applies markdown to text it displays itself,
 * and returning the text here would flatten it).
 */
export function slice(
  prev: string,
  delta: unknown,
  host?: DisplayHost,
  final?: boolean,
  cwd?: string,
  options?: RenderOptions
): string | null {
  const full = prev + (typeof delta === "string" ? delta : "");
  if (!engaged(full)) return null;
  const before = transform(prev, host, false, cwd, options);
  const after = transform(full, host, final, cwd, options);
  // `before` is normally a prefix of `after`: prose is untouched, and a block still
  // arriving is withheld at the very position its render later occupies. The one shape
  // that breaks it is markup CUT MID-MARKER at the end of `prev` ("{{sta"), which
  // renders as itself there and as an escape sequence once complete. Slicing at the
  // shared prefix rather than at before.length re-emits from the divergence, so the
  // corrected text always reaches the screen: the stale marker characters stay behind
  // (nothing can retract a delta already shown) and no content is dropped. The two
  // rules agree exactly whenever `before` is a prefix, which is every ordinary flush.
  return after.slice(sharedPrefix(before, after));
}
