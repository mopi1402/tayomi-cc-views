// One view, rendered: the composition of the three halves that must not know each other (where the template lives, how
// the block's data parses, how a line draws).

import { WRAP_MARKS } from "../data/marks.js";
import { holdsCells, wrapLine } from "../layout/wrap.js";
import { dropInert, fillTone, markCode, renderTags, toneClass } from "../style.js";
import { nameField, type Scope } from "../scope.js";
import { FIELD_TONE, FIELD_TYPE } from "../data/language.js";
import { renderBody } from "./directives.js";
import { loadTemplate, viewsDir } from "./load.js";
import { maxBoxWidth } from "../platform/tty-width.js";
import { inertData, namedFields, parseData } from "./view-data.js";
import type { RenderOptions } from "../options.js";

/** What a CARRIER learned about one zone, beyond the view's name and its data. Both OPTIONAL, both fail open. */
export interface Dressing {
  /**
   * The KIND of content: semantic, and the word the model re-reads in the transcript. Selects a typed template FILE
   * when one exists, reaches the template as the `type` field, and fills the tone slot when the palette knows the name.
   */
  type?: string;
  /** The tone CLASS: a palette tag name, no file, no semantics. Outranks the kind. */
  tone?: string;
}

/**
 * A render and what it RECORDED: every top-level field the body actually asked the scope for. A RETURN value and not a
 * parameter, deliberately: a scope arriving with its own `__read` would count among the fields that ARRIVED and could
 * flip the third refusal below.
 */
export interface Traced {
  out: string;
  read: Set<string>;
}

/** The render, discarding what it recorded. What the runtime spends, and what every host has always called. */
export function renderView(
  name: string,
  data: Scope | string,
  dir: string | string[] = viewsDir(),
  injected?: Scope,
  options?: RenderOptions,
  dressing?: Dressing
): string {
  return traceView(name, data, dir, injected, options, dressing).out;
}

export function traceView(
  name: string,
  data: Scope | string,
  dir: string | string[] = viewsDir(),
  injected?: Scope,
  options?: RenderOptions,
  dressing?: Dressing
): Traced {
  const { tables, objectLists, body, labelWidth, tone, spendsSlots } = loadTemplate(
    name,
    dir,
    dressing?.type
  );
  // Either pre-parsed data (callers, tests) or the raw block text (the hook). Parsed here so the view's @fields
  // directive drives the split, and neutralised here because raw block text came from the MESSAGE. A caller handing
  // pre-parsed data owns its own provenance.
  const parsed: Scope =
    typeof data === "string" ? (inertData(parseData(data, objectLists)) as Scope) : data;
  // Rows read a SECOND way, HERE where the template is known: splitting a list is @fields' business, no carrier's.
  // PRE-PARSED data alone: a fenced block's `rows` were split by @fields already, and deriving would move its render.
  const scope: Scope =
    typeof data === "string" ? parsed : (namedFields(parsed, objectLists) as Scope);
  // "Raw over hollow", first two readings (.tayomi/specs/fix/carrier-guards.md). Whether DATA arrived, never whether
  // the template printed: a view drawing literal furniture always puts ink on screen. A template spending no slot is
  // STATIC and renders on empty data, which keeps `@{view:welcome}` a health check. The carrier's KIND counts as data,
  // because it becomes a field below and a template may spend it alone.
  if (Object.keys(scope).length === 0 && dressing?.type == null) {
    if (typeof data === "string" && data.trim() !== "") {
      throw new Error(`view ${name}: no fields parsed`);
    }
    if (spendsSlots) throw new Error(`view ${name}: nothing to fill its slots`);
  }
  // WHAT ARRIVED, snapshotted before the engine's own bookkeeping joins it below. Injected fields count here and not in
  // the check ABOVE, where the question is whether the author wrote anything.
  const got = Object.keys(injected == null ? scope : { ...scope, ...injected });
  // Merged AFTER the hollow check, so state the model never wrote can never make an otherwise empty block look parsed.
  const full: Scope = injected == null ? scope : { ...scope, ...injected };
  full.__labelWidth = labelWidth;
  // As an ordinary FIELD, so a template can print it or drive its border from it (@frame type warning=fail), the one
  // thing the tone slot cannot do. It OVERRIDES a field of the same name: a block cannot be of two kinds.
  if (dressing?.type != null) full[FIELD_TYPE] = dressing.type;
  const read = new Set<string>();
  full.__read = read;
  let out: string[];
  const limit = maxBoxWidth(options);
  try {
    // Width and search path resolved ONCE here and handed down as values: the layers below never import platform/ and
    // never probe for a file.
    out = renderBody(body, full, tables, objectLists, limit, dir);
    // A template declaring no container passes no wrapper, so the fold happens here or nowhere. A stacked cell has to
    // be dealt or its rows print side by side, and a line holding COLUMNS has to be folded even when nothing stacked:
    // its overflow is the tail, which is measured by nothing and therefore bounded by nothing. Left to the terminal,
    // that tail comes back at column ZERO, under the label column and past the bar. Only a line carrying neither still
    // flows at the terminal's own hand, having no column for it to land in the wrong one.
    out = out.flatMap((l) => (holdsCells(l) ? wrapLine(l, limit) : [l]));
  } finally {
    // Both are the ENGINE's and `full` may BE the caller's own object, so neither is left on it: a second render of the
    // same data would count `__read` among the fields that ARRIVED, and a stale width hands the next view its
    // predecessor's label column.
    delete full.__read;
    delete full.__labelWidth;
  }
  // Third reading: data ARRIVED and the template read none of it. Decided on what the render actually ASKED the scope
  // for, which is why it runs down here with the output already built and about to be thrown away.
  if (spendsSlots && got.length > 0 && !got.some((key) => read.has(key))) {
    throw new Error(`view ${name}: reads none of the fields it was given`);
  }
  // MOST EXPLICIT FIRST: the carrier's own tone, the block's `tone` field (the fenced form's only way in, carrying no
  // attributes), the kind under either name, then what the template declared with @tone. Named nowhere the palette
  // knows, the slot keeps its neutral.
  const cls = toneClass(
    dressing?.tone,
    nameField(full, FIELD_TONE),
    nameField(full, FIELD_TYPE),
    tone
  );
  // These marks exist for the layers above and must never reach a terminal. Inert goes LAST, after renderTags, so what
  // it protected is text by then.
  const drawn = renderTags(fillTone(markCode(out.join("\n")), cls));
  const bare = WRAP_MARKS.reduce((s, m) => s.split(m).join(""), dropInert(drawn));
  return { out: bare, read };
}
