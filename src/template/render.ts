// One view, rendered: the composition of the three halves that must not know each
// other (where the template lives, how the block's data parses, how a line draws).

import { HANG_MARK } from "../layout/marks.js";
import { dropInert, fillTone, renderCode, renderTags, toneClass } from "../style.js";
import type { Scope } from "../scope.js";
import { renderBody } from "./directives.js";
import { loadTemplate, viewsDir } from "./load.js";
import { maxBoxWidth } from "../platform/tty-width.js";
import { inertData, parseData } from "./view-data.js";
import type { RenderOptions } from "../options.js";

/**
 * What a CARRIER learned about one zone, beyond the view's name and its data: the two
 * words that dress the same template differently. Both OPTIONAL, both fail open, so a
 * name the engine does not know costs a colour, never the render.
 */
export interface Dressing {
  /**
   * The KIND of content (`warning`, `error`, `success`): semantic, and the word the
   * model re-reads in the transcript. Selects a typed template FILE when one exists,
   * reaches the template as the `type` field, and fills the tone slot when the palette
   * knows the name.
   */
  type?: string;
  /**
   * The tone CLASS stuck on this render: a palette tag name, no file, no semantics.
   * Outranks the kind, which is how one template renders in any colour without a
   * second copy of itself existing.
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
  // Either pre-parsed data (callers, tests) or the raw block text (the hook). Parsed
  // here so the view's @fields directive drives the split, and neutralised here because
  // raw block text came from the MESSAGE. A caller handing pre-parsed data owns its own
  // provenance (the decorator does its cells).
  const scope: Scope =
    typeof data === "string" ? (inertData(parseData(data, objectLists)) as Scope) : data;
  // "Raw over hollow": a non-empty block that parsed to zero fields is not a data block
  // we understand. Throw, so the caller fails open to the raw text rather than
  // rendering an empty skeleton that silently drops the content.
  if (typeof data === "string" && data.trim() !== "" && Object.keys(scope).length === 0) {
    throw new Error(`view ${name}: no fields parsed`);
  }
  // Injected fields come from the DISPLAY layer: state the model never wrote and must
  // not be trusted to remember. Merged AFTER the hollow check, so they can never make
  // an otherwise empty block look parsed.
  const full: Scope = injected == null ? scope : { ...scope, ...injected };
  full.__labelWidth = labelWidth;
  // The carrier's kind, exposed as an ordinary FIELD so a template can print it (a
  // badge, through an @map) or drive its border from it (@frame type warning=fail),
  // the one thing the tone slot cannot do. It OVERRIDES a field of the same name: a
  // block cannot be of two kinds, and the carrier's word is the one the reader sees.
  if (dressing?.type != null) full.type = dressing.type;
  // Width and search path are both resolved ONCE here and handed down as values: the
  // layers below never import platform/ and never probe for a file.
  const out = renderBody(body, full, maps, objectLists, maxBoxWidth(options), dir);
  // MOST EXPLICIT FIRST: the carrier's own tone, the block's `tone` field (the fenced
  // form's only way in, since it carries no attributes), the kind under either name,
  // then what the template declared with @tone. Named nowhere the palette knows, the
  // slot keeps its neutral.
  const cls = toneClass(dressing?.tone, nameField(full, "tone"), nameField(full, "type"), tone);
  // Both marks exist for the layers above and must never reach a terminal. Inert goes
  // LAST, after renderTags, so what it protected is text by then.
  const drawn = renderTags(fillTone(renderCode(out.join("\n")), cls));
  return dropInert(drawn).split(HANG_MARK).join("");
}
