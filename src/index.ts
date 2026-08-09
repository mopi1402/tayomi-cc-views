// The public surface of @tayomi/cc-views.
//
// The engine renders view blocks a model writes inline into coloured terminal output, behind Claude Code's
// MessageDisplay hook. Everything host-specific reaches a render through ONE seam, the DisplayHost a caller hands to
// slice()/transform().
//
// What is exported here and nothing else is the API: a consumer that needs more than this file offers is a design
// conversation, not a deep import.

// The pipeline: one message in, the text to show on screen out.
export { transform, slice, type DisplayHost } from "./pipeline.js";

// What a host configures: names and sources, all defaulted.
export type { RenderOptions } from "./options.js";

// One view rendered by name, for a host that draws outside the hook flow. Dressing is what a carrier learned about the
// zone, so such a host can dress a view exactly like the decorator does.
export { renderView, type Dressing } from "./template/render.js";
export {
  loadTemplate,
  viewsDir,
  bundledViewsDir,
  defaultViewsPath,
  VIEWS_PATH_ENV,
} from "./template/load.js";

// The block-data format. Exported because a host may have a second reader of the SAME format (a gate judging the block
// the engine draws): both must share this parser.
export { parseData, type ObjectLists } from "./template/view-data.js";

// The view zones of a message, both carriers, name and data per zone: what that gate JUDGES with, without drawing a
// thing. No template is loaded, so a list arrives unsplit (`@fields` belongs to the template).
export { viewZones, type ViewZone } from "./carrier/zones.js";

// The scope a template resolves against, for a host that injects fields, and the lookup tables a template declares
// (@map, @text) under the one name they share.
export { stringify, type Scope, type Table, type Tables } from "./scope.js";

// The {{tag}} markup, for a host that colours its own lines with the same vocabulary, and the one seam by which a host
// adds tags of its own (process-global, additive).
export {
  renderTags,
  renderCode,
  isTag,
  extendTags,
  ansi256,
  rgb,
  tagMark,
  ANSI_RE,
  tagNames,
  TAG_SUFFIXES,
} from "./style.js";
export type { TagReport } from "./style.js";

// What the engine says about itself, for an agent writing a view and for the generator that freezes the stable half
// into agent/catalogue.json.
export {
  stableCatalogue,
  liveCatalogue,
  type Catalogue,
  type LiveCatalogue,
  type DirectiveDoc,
  type ViewDoc,
} from "./catalogue.js";

// Printed width, for a host that aligns text beside a rendered view.
export { displayWidth } from "./layout/width.js";

// The MessageDisplay edge itself: the whole stdin-to-stdout dance for a host with behaviour (runMessageDisplayHook),
// and the process-free storey under it for a host that owns its own edge or a test (handleMessageDisplay).
export {
  runMessageDisplayHook,
  handleMessageDisplay,
  type HostSource,
  type MessageContext,
} from "./hook/runner.js";
