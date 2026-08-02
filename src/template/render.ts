// One view, rendered: the composition of the three halves that must not know each
// other (where the template lives, how the block's data parses, how a line draws).

import { HANG_MARK } from "../layout/marks.js";
import { dropInert, fillTone, markCode, renderTags, toneClass } from "../style.js";
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
  const { tables, objectLists, body, labelWidth, tone, spendsSlots } = loadTemplate(
    name,
    dir,
    dressing?.type
  );
  // Either pre-parsed data (callers, tests) or the raw block text (the hook). Parsed
  // here so the view's @fields directive drives the split, and neutralised here because
  // raw block text came from the MESSAGE. A caller handing pre-parsed data owns its own
  // provenance (the decorator does its cells).
  const scope: Scope =
    typeof data === "string" ? (inertData(parseData(data, objectLists)) as Scope) : data;
  // "Raw over hollow", and the question is whether DATA arrived, never whether the
  // template printed. Asking the output was the bug: a view drawing literal furniture
  // (banner.view fills a band and draws two caps against it) always puts ink on screen,
  // so an ink test read a pill around nothing as a successful render.
  //
  // Two ways to be hollow, one throw, so the caller fails open to the raw text. The
  // author WROTE a body that parsed to no field, whatever the template wanted; or the
  // template spends a slot and nothing came to fill it. A template spending none is
  // STATIC and renders on empty data, which is what keeps `@{view:welcome}` a health
  // check summoned by its line alone.
  //
  // The carrier's KIND counts as data arriving, because it becomes a field below and a
  // template may spend it alone. What that leaves standing is narrow and deliberate: a
  // slot-spending view named with a `type:` and no payload still draws its furniture,
  // since a field it never reads did reach it.
  if (Object.keys(scope).length === 0 && dressing?.type == null) {
    if (typeof data === "string" && data.trim() !== "") {
      throw new Error(`view ${name}: no fields parsed`);
    }
    if (spendsSlots) throw new Error(`view ${name}: nothing to fill its slots`);
  }
  // WHAT ARRIVED, snapshotted before the engine's own bookkeeping joins it below.
  //
  // The injected fields count as data the template got: they are not the message's, but
  // a host supplies them precisely so a view can read them. They stay out of the check
  // ABOVE, where the question is whether the author wrote anything at all.
  const got = Object.keys(injected == null ? scope : { ...scope, ...injected });
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
  // Opened before the render and read after it, by the guard below.
  const read = new Set<string>();
  full.__read = read;
  let out: string[];
  try {
    // Width and search path are both resolved ONCE here and handed down as values: the
    // layers below never import platform/ and never probe for a file.
    out = renderBody(body, full, tables, objectLists, maxBoxWidth(options), dir);
  } finally {
    // The set is the engine's, and `full` may BE the caller's own object. Left on it, a
    // second render of the same data would count it among the fields that ARRIVED, and
    // the throwing path is the one that leaves it there: a template failing mid-render
    // is exactly when a caller retries.
    delete full.__read;
  }
  // The SECOND reading of "raw over hollow", and the one an ink test could never
  // deliver: data ARRIVED and the template read none of it. banner.view fills a band and
  // draws two caps against it, so handed a table's `rows` it printed a pill around
  // nothing and the carrier's `rendered.trim() === ""` saw ink and shipped it,
  // swallowing the table whole.
  //
  // Decided on what the render ACTUALLY asked the scope for, recorded by the accessor
  // itself (scope.ts), which is why it runs down HERE with the output already built and
  // about to be thrown away. Reading the template's source instead gathered an
  // approximation of the same answer, and every naming form it failed to recognise
  // blanked a render nothing was wrong with. There is no list of forms to keep in step
  // now: a field a template resolves is a field this set holds.
  //
  // A STATIC template asks for nothing and is exempt, which is what keeps
  // `@{view:welcome}` a health check summoned by its line alone.
  if (spendsSlots && got.length > 0 && !got.some((key) => read.has(key))) {
    throw new Error(`view ${name}: reads none of the fields it was given`);
  }
  // MOST EXPLICIT FIRST: the carrier's own tone, the block's `tone` field (the fenced
  // form's only way in, since it carries no attributes), the kind under either name,
  // then what the template declared with @tone. Named nowhere the palette knows, the
  // slot keeps its neutral.
  const cls = toneClass(dressing?.tone, nameField(full, "tone"), nameField(full, "type"), tone);
  // Both marks exist for the layers above and must never reach a terminal. Inert goes
  // LAST, after renderTags, so what it protected is text by then.
  const drawn = renderTags(fillTone(markCode(out.join("\n")), cls));
  return dropInert(drawn).split(HANG_MARK).join("");
}
