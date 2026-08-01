// The display pipeline: one message in, the text to show on screen out.
//
// The only module that knows all the layers at once, which is what an orchestration
// is. It composes them in the one order that is safe on a stream: render the closed
// blocks, withhold what is still arriving, then render the zones a decorator names.
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

import { BLOCK_HINT, BLOCK_RE, cutUnclosedBlock } from "./carrier/scan.js";
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
 * A Windows line ending, flattened to a bare LF before any matcher reads the text.
 *
 * Done ONCE at the entry rather than in each carrier, because every matcher in this
 * engine anchors on a line boundary: a CR the entry lets through is a CR each of them
 * must spell a tolerance for, and the one that forgets fails open on a block that is
 * perfectly well formed. That is not hypothetical, it is what both carriers did.
 *
 * A LONE trailing CR is deliberately left alone: it is the front half of a CRLF still
 * arriving, which carrier/scan.ts reads as exactly that, and the flush that completes
 * it normalises the pair here. The cost is that prose keeps no CR of its own, which a
 * terminal never wanted.
 */
const CRLF = /\r\n/g;
const NL = "\n";

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
 * `host` and `final` are OPTIONAL, so a caller with no host renders every block from
 * the block's own text and nothing else: the engine never imports a host's state.
 */
export function transform(
  full: string,
  host?: DisplayHost,
  final?: boolean,
  cwd?: string,
  options?: RenderOptions
): string {
  const text = full.replace(CRLF, NL);
  const strictView = host?.strict?.view;
  let outcome: { ok: boolean; error: string | null } | null = null;
  let out = text.replace(BLOCK_RE, (m: string, name: string, bodyText: string) => {
    try {
      // The RAW block text: renderView parses it with the view's own @fields
      // directive. A total parser plus this catch means any oddity shows the raw
      // block, never a blank screen.
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
        // A host is a program, not a message: it may spend the palette.
        return renderTags(host.strict.failedLine) + "\n"; // never the raw block nor its fences
      }
      return m; // fail-open: show the raw block
    }
  });
  if (outcome !== null && final === true) {
    const { ok, error } = outcome as { ok: boolean; error: string | null };
    host?.onRendered?.(ok, error);
  }
  // Withholding is the NON-FINAL flush's business, both carriers under the one
  // convention: a cut is a promise that a later flush reveals what it holds back, and
  // on the last delta no later flush exists to keep it. So the final flush shows
  // whatever it could not render, raw (a block that never closes used to be cut away
  // here and never came back). Withheld first, rendered second: a zone still arriving
  // is gone before the carrier sees it, so a half-formed payload can never render.
  if (final !== true) {
    out = cutUnclosedBlock(out);
    out = cutStreamingDecorated(out);
  }
  // NO tag pass here, and the absence is the rule: only a template resolves a tag.
  return renderDecorated(out, options?.viewsPath ?? defaultViewsPath(), options);
}

/**
 * Does this message carry anything the engine has business touching at all?
 *
 * The two carriers, and only them. `{{` is deliberately NOT a marker: engaging on one
 * would take the delta from the host to hand back the same text, flattening the
 * markdown the host would have drawn.
 */
function engaged(full: string): boolean {
  return full.includes(BLOCK_HINT) || full.includes(DECORATOR_HINT);
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
 * rendering (Claude Code applies markdown to text it displays itself, and returning
 * the text here would flatten it).
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
  // that breaks it is a CARRIER TOKEN cut mid-way at the end of `prev` ("@{view:ta"),
  // which is prose to the cut there and an anchor once complete. Slicing at the
  // shared prefix rather than at before.length re-emits from the divergence, so the
  // corrected text always reaches the screen: the stale marker characters stay behind
  // (nothing can retract a delta already shown) and no content is dropped. The two
  // rules agree exactly whenever `before` is a prefix, which is every ordinary flush.
  return after.slice(sharedPrefix(before, after));
}
