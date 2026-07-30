// The public surface of @tayomi/cc-views.
//
// The engine renders view blocks a model writes inline into coloured terminal output,
// behind Claude Code's MessageDisplay hook. Everything host-specific reaches a render
// through ONE seam, the DisplayHost a caller hands to slice()/transform(): the engine
// itself never imports a host's state.
//
// What is exported here and nothing else is the API: a consumer that needs more than
// this file offers is a design conversation, not a deep import.

// The pipeline: one message in, the text to show on screen out.
export { transform, slice, type DisplayHost } from "./pipeline.js";

// What a host configures: names and sources, all defaulted. Behaviour stays on
// DisplayHost; the palette stays on extendTags (see options.ts for why).
export type { RenderOptions } from "./options.js";

// One view rendered by name, for a host that draws outside the hook flow.
export { renderView } from "./template/render.js";
export { loadTemplate, viewsDir, defaultViewsPath, VIEWS_PATH_ENV } from "./template/load.js";

// The block-data format. Exported because a host may have a second reader of the
// SAME format (a gate judging the block the engine draws): both must share this
// parser, or they diverge.
export { parseData, type ObjectLists } from "./template/view-data.js";

// The scope a template resolves against, for a host that injects fields.
export { stringify, type Scope, type Maps } from "./scope.js";

// The {{tag}} markup, for a host that colours its own lines with the same vocabulary,
// and the one seam by which a host adds tags of its own (process-global, additive).
export { renderTags, renderCode, isTag, extendTags, ANSI_RE } from "./style.js";

// Printed width, for a host that aligns text beside a rendered view.
export { displayWidth } from "./layout/width.js";

// The MessageDisplay edge itself: the whole stdin-to-stdout dance for a host with
// behaviour (runMessageDisplayHook), and the process-free storey under it for a
// host that owns its own edge or a test (handleMessageDisplay). The per-message
// delta log is INTERNAL to it: its only caller now lives in this package.
export {
  runMessageDisplayHook,
  handleMessageDisplay,
  type HostSource,
  type MessageContext,
} from "./hook/runner.js";
