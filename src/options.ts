// What a HOST configures about the engine, per call: everything here has a generic default, so a caller passing nothing
// gets a working engine. Distinct from DisplayHost (pipeline.ts), which carries host BEHAVIOUR; options carry host
// NAMES and sources. The palette is deliberately not here, see style.extendTags.

export interface RenderOptions {
  /**
   * Ordered template dirs, first hit wins. The ORDER is the caller's policy: a consumer whose own templates must shadow
   * the built-ins lists its dir first. Default: defaultViewsPath() of template/load.ts.
   */
  viewsPath?: string[];
  /**
   * The box width ceiling, or where to get it. A NUMBER is a forced ceiling (what an oracle sets so a verdict never
   * depends on the window it ran in). A FUNCTION is a width source standing in for the ps-probe: it returns terminal
   * columns, or null to fall through to the probe. See platform/tty-width.ts for the resolution order.
   */
  width?: number | (() => number | null);
  /** Env var read as a forced ceiling before any width source. Default CC_VIEWS_WIDTH. */
  widthEnv?: string;
  /**
   * Where the engine's scratch lives (per-message stream state, the probed width cache). Default os.tmpdir()/cc-views.
   * Two hosts on one machine that must not share stream state pass two dirs.
   */
  stateDir?: string;
}
