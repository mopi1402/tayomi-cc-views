// The display pipeline: one message in, the text to show on screen out. The only module that knows all the layers, and
// it composes them in the one order that is safe on a stream: render the closed blocks, withhold what is still
// arriving, then render the zones a decorator names.
//
// Why slice() is pure and holds no offset between flushes: docs/architecture/architecture.md, "Streaming as a pure slice".

import { fenceAt, fenceSpans } from "./carrier/fences.js";
import { BLOCK_HINT, BLOCK_RE, cutUnclosedBlock } from "./carrier/scan.js";
import {
  DECORATOR_HINT,
  cutStreamingDecorated,
  decoratedZones,
  renderDecorated,
} from "./carrier/decorator.js";
import { CRLF, NL } from "./data/markup.js";
import { defaultViewsPath } from "./template/load.js";
import { renderView } from "./template/render.js";
import { parseData } from "./template/view-data.js";
import {
  failedOutcome,
  okOutcome,
  strictLine,
  type DisplayHost,
  type Outcome,
} from "./host.js";
import type { RenderOptions } from "./options.js";

// The behaviour seam itself lives at the root (host.ts), because both carriers answer to it and the chain has no
// cycles. Re-exported here, where every caller has always reached for it.
export type { DisplayHost };

/** Render the view blocks of a message. With no `host`, every block renders from its own text and nothing else. */
export function transform(
  full: string,
  host?: DisplayHost,
  final?: boolean,
  cwd?: string,
  options?: RenderOptions
): string {
  // Flattened ONCE at the entry: every matcher anchors on a line boundary, and both carriers failed open on a CR left
  // through. A LONE trailing CR stays, the front half of a CRLF still arriving. viewZones flattens the same at ITS entry.
  const text = full.split(CRLF).join(NL);
  const dirs = options?.viewsPath ?? defaultViewsPath();
  const strictView = host?.strict?.view;
  let outcome: Outcome | null = null;
  // Measured on THIS text, before the pass that rewrites it. The decorator measures again on its own input: these
  // offsets no longer name the same characters once the blocks below have been replaced by their renders.
  const fences = fenceSpans(text);
  let out = text.replace(BLOCK_RE, (m: string, name: string, bodyText: string, at: number) => {
    // A block quoted inside an ordinary fence is an EXAMPLE. Its own fence is the one span it may be inside.
    const fence = fenceAt(fences, at);
    if (fence !== undefined && !fence.carrier) return m;
    try {
      // The host is handed the block PARSED, never its text: the same shape a decorated zone hands over, with lists
      // unsplit since @fields is the template's business.
      const rendered =
        renderView(name, bodyText, dirs, host?.inject?.(name, parseData(bodyText), cwd), options) +
        "\n";
      if (name === strictView) outcome = okOutcome();
      return rendered;
    } catch (e) {
      if (name === strictView && host?.strict !== undefined) {
        outcome = failedOutcome(e);
        return strictLine(host.strict) + "\n"; // never the raw block nor its fences
      }
      return m; // fail-open: show the raw block
    }
  });
  // Withholding is the NON-FINAL flush's business: a cut promises that a later flush reveals what it holds back, and on
  // the last delta no later flush exists (a block that never closes used to be cut away here and never came back).
  // Withheld first, rendered second, so a half-formed payload can never render.
  if (final !== true) {
    out = cutUnclosedBlock(out);
    out = cutStreamingDecorated(out);
  }
  // NO tag pass here, and the absence is the rule: only a template resolves a tag.
  const decorated = renderDecorated(out, dirs, options, host, cwd);
  // ONE outcome per message, reported after BOTH passes: the strict view may arrive on either carrier. The cast is
  // TypeScript's, an assignment made inside the callback above is not tracked here.
  const fenced = outcome as Outcome | null;
  // Where BOTH carriers decided, the zone written LAST wins. Pass order must not decide it: the decorator pass merely
  // RUNS second, and letting it win would mask a fenced failure behind a decorated success.
  const verdict =
    fenced !== null && decorated.outcome !== null && strictView !== undefined
      ? lastStrictIsDecorated(text, strictView)
        ? decorated.outcome
        : fenced
      : (decorated.outcome ?? fenced);
  if (verdict !== null && final === true) host?.onRendered?.(verdict.ok, verdict.error);
  return decorated.out;
}

/**
 * Which carrier wrote the LAST zone naming the strict view, both measured over the message as WRITTEN: the render
 * passes each measure their own rewritten text, so their offsets never share a ruler.
 */
function lastStrictIsDecorated(text: string, strictView: string): boolean {
  const fences = fenceSpans(text);
  let fencedAt = -1;
  for (const m of text.matchAll(BLOCK_RE)) {
    if (m[1] !== strictView) continue;
    const fence = fenceAt(fences, m.index);
    if (fence !== undefined && !fence.carrier) continue;
    fencedAt = m.index;
  }
  let decoratedAt = -1;
  for (const zone of decoratedZones(text)) if (zone.view === strictView) decoratedAt = zone.at;
  return decoratedAt > fencedAt;
}

/**
 * The two carriers, and only them. `{{` is deliberately NOT a marker: engaging on one would take the delta from the
 * host to hand back the same text, flattening the markdown the host would have drawn.
 */
function engaged(full: string): boolean {
  return full.includes(BLOCK_HINT) || full.includes(DECORATOR_HINT);
}

function sharedPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

/**
 * What ONE flush puts on screen, or null when the host should show its own delta.
 *
 * `prev` is the text of every earlier flush of this message. The offset is DERIVED from it rather than remembered, and
 * the second transform per flush is the price: a remembered offset is shared mutable state, and three flushes in flight
 * at once lost updates on it.
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
  // `before` is normally a prefix of `after`. The one shape that breaks it is a CARRIER TOKEN cut mid-way at the end of
  // `prev` ("@{view:ta"), prose to the cut there and an anchor once complete. Slicing at the shared prefix re-emits
  // from the divergence, so the corrected text always reaches the screen and no content is dropped.
  return after.slice(sharedPrefix(before, after));
}
