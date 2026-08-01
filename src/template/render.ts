// One view, rendered: the composition of the three halves that must not know each
// other (where the template lives, how the block's data parses, how a line draws).

import { HANG_MARK } from "../layout/marks.js";
import { fillTone, renderCode, renderTags, toneClass } from "../style.js";
import type { Scope } from "../scope.js";
import { renderBody } from "./directives.js";
import { loadTemplate, viewsDir } from "./load.js";
import { maxBoxWidth } from "../platform/tty-width.js";
import { parseData } from "./view-data.js";
import type { RenderOptions } from "../options.js";

/**
 * What a CARRIER learned about one zone, beyond the view's name and its data: the two
 * words that dress the same template differently. Both are OPTIONAL and both fail
 * open, so a name the engine does not know costs a colour, never the render.
 */
export interface Dressing {
  /**
   * The KIND of content (`warning`, `error`, `success`): semantic, and the word the
   * model re-reads in the transcript. It selects a typed template FILE when one
   * exists (load.ts), it reaches the template as the `type` field, and it fills the
   * tone slot when the palette knows the name.
   */
  type?: string;
  /**
   * The tone CLASS stuck on this render: a palette tag name, no file, no semantics.
   * It fills the tone slot and outranks the kind, which is how one template renders
   * in any colour without a second copy of itself existing.
   */
  tone?: string;
}

// A scope field read as a class NAME. Only a string can name one: a block that wrote
// a list under that key holds data the slot has no business reading.
function nameField(scope: Scope, key: string): string | undefined {
  const val = scope[key];
  return typeof val === "string" ? val.trim() : undefined;
}

export function renderView(
  name: string,
  data: Scope | string,
  dir: string | string[] = viewsDir(),
  injected?: Scope,
  options?: RenderOptions,
  dressing?: Dressing
): string {
  const { maps, objectLists, body, labelWidth, tone } = loadTemplate(name, dir, dressing?.type);
  // Accept either pre-parsed data (callers/tests) or the raw block text (the
  // hook). Parsing happens here so the view's @fields directive drives the split.
  const scope: Scope =
    typeof data === "string" ? parseData(data, objectLists) : data;
  // "Raw over hollow": if a non-empty block parsed to zero fields, it is not a
  // data block we understand. Throw so the caller fails open to the raw text
  // rather than rendering an empty skeleton that silently drops the content.
  if (typeof data === "string" && data.trim() !== "" && Object.keys(scope).length === 0) {
    throw new Error(`view ${name}: no fields parsed`);
  }
  // Injected fields come from the DISPLAY layer, not from the model: state the
  // model never wrote and must not be trusted to remember.
  // Merged after the hollow check, so injected data can never make an otherwise
  // empty block look parsed.
  const full: Scope = injected == null ? scope : { ...scope, ...injected };
  full.__labelWidth = labelWidth;
  // The carrier's kind, exposed as an ordinary FIELD so a template can print it (a
  // badge, through an @map) or drive its border from it (@frame type warning=fail),
  // which is the one thing the tone slot cannot do. It OVERRIDES a field of the same
  // name: a block cannot be of two kinds, and the carrier's word is the one the
  // reader sees. Set after the hollow check, like the injected fields and for the
  // same reason: a dressing must never make an empty block look parsed.
  if (dressing?.type != null) full.type = dressing.type;
  // The width is platform policy, resolved ONCE here at the render entry and handed
  // down as a value: the layers below never import platform/. The search path travels
  // the same way and for the same reason: an @aside names a view, and the dirs it
  // resolves against are the caller's policy, not something the directive layer probes.
  const out = renderBody(body, full, maps, objectLists, maxBoxWidth(options), dir);
  // The class filling the tone slot, MOST EXPLICIT FIRST: the carrier's own tone, the
  // block's `tone` field (the fenced form's only way in, since it carries no
  // attributes), then the kind under either of those two names, then what the template
  // declared with @tone. Named nowhere the palette knows: the slot keeps its neutral.
  const cls = toneClass(
    dressing?.tone,
    nameField(full, "tone"),
    nameField(full, "type"),
    tone
  );
  // The hanging boundary is consumed here: it exists for the wrapper inside
  // frameBox and must never reach a terminal.
  return renderTags(fillTone(renderCode(out.join("\n")), cls)).split(HANG_MARK).join("");
}
