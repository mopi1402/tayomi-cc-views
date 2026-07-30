// One view, rendered: the composition of the three halves that must not know each
// other (where the template lives, how the block's data parses, how a line draws).

import { HANG_MARK } from "../layout/marks.js";
import { renderCode, renderTags } from "../style.js";
import type { Scope } from "../scope.js";
import { renderBody } from "./directives.js";
import { loadTemplate, viewsDir } from "./load.js";
import { maxBoxWidth } from "../platform/tty-width.js";
import { parseData } from "./view-data.js";
import type { RenderOptions } from "../options.js";

export function renderView(
  name: string,
  data: Scope | string,
  dir: string | string[] = viewsDir(),
  injected?: Scope,
  options?: RenderOptions,
  type?: string
): string {
  const { maps, objectLists, body, labelWidth } = loadTemplate(name, dir, type);
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
  // The width is platform policy, resolved ONCE here at the render entry and handed
  // down as a value: the layers below never import platform/.
  const out = renderBody(body, full, maps, objectLists, maxBoxWidth(options));
  // The hanging boundary is consumed here: it exists for the wrapper inside
  // frameBox and must never reach a terminal.
  return renderTags(renderCode(out.join("\n"))).split(HANG_MARK).join("");
}
