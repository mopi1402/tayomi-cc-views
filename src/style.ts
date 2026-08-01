// The ANSI vocabulary: the tag names a view may write, and the two transforms that
// turn that markup into escape sequences.
//
// This is the LEAF of the display dependency chain (style <- layout <- template <-
// carrier <- pipeline): it knows nothing about geometry, data, or templates. The
// palette itself stays private, so a tag name is only ever resolved through isTag
// and renderTags, and no other module can grow its own opinion about a colour.

const ESC = "\x1b";
export const R = `${ESC}[0m`;

// The base palette, every raw sequence written ONCE. The semantic tags below
// ALIAS these entries: "pass renders as green" is a decision this table records
// in one place, not two literals that happen to agree today.
const BASE: Record<string, string> = {
  "/": R,
  b: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  red: `${ESC}[1;31m`,
  green: `${ESC}[1;32m`,
  yellow: `${ESC}[1;33m`,
  cyan: `${ESC}[1;36m`,
  orange: `${ESC}[38;5;208m`,
  gold: `${ESC}[38;5;220m`,
  chip: `${ESC}[1;38;5;16;48;5;231m`,
};

// The filled chips a semantic name and a carrier's name SHARE: high severity reads
// as failure red, and `warning` is the same chip as `warn`. Named consts for the
// same reason the palette above is one, an alias must not be a second literal.
const RED_CHIP = `${ESC}[1;97;41m`;
const GREEN_CHIP = `${ESC}[1;30;42m`;
const YELLOW_CHIP = `${ESC}[1;30;43m`;

// The NEUTRAL tone, aliased by `key` and by the tone slot below. One sequence for
// both, because "the slot defaults to what key means" is a decision this module
// records once: two literals that agree today are exactly the drift the BASE table
// above exists to prevent.
const NEUTRAL = BASE.cyan;

// The tone slot's two names, and the suffix that pairs a tone with its chip. Spelled
// ONCE, here, for the palette entries below and for fillTone: the table and the
// rewriter must agree on what the slot is called, or a view spends a tag that no
// longer resolves.
const BG = "_bg";
const TONE = "tone";
const TONE_BG = TONE + BG;

const TAGS: Record<string, string> = {
  ...BASE,
  // semantic foreground
  pass: BASE.green,
  warn: BASE.yellow,
  fail: BASE.red,
  high: `${ESC}[91m`,
  med: BASE.orange,
  low: BASE.dim,
  key: NEUTRAL,
  // The names a CARRIER writes (`tone:warning`, `type:error`), aliased onto the
  // tones above: a carrier names a KIND, and what a kind looks like is decided in
  // this table and nowhere else. They exist so a dressed view needs no template of
  // its own to change colour, which is the whole point of the tone slot below.
  warning: BASE.yellow,
  error: BASE.red,
  success: BASE.green,
  info: NEUTRAL,
  // Claude Code's native inline-code colour, pinned as truecolor. CC does NOT
  // use an ANSI palette slot for code spans (verified against the 2.1.x bundle):
  // it emits the fixed "Claude periwinkle" accent rgb(177,185,249) = #b1b9f9
  // (same value as the theme's permission/suggestion/remember keys). Pinning the
  // exact RGB makes a code span in a rendered view match CC's own code spans in
  // every terminal, since truecolor is theme-independent. Tracks CC's dark theme.
  code: `${ESC}[38;2;177;185;249m`,
  title: BASE.chip,
  // @box frame. The outline itself is drawn in `dim`, the same grey as the
  // gutter bar, so the frame and the bars inside it read as one family. The only
  // exception is the rule under the header: it is internal furniture rather than
  // the block's outline, so it recedes one step further.
  box_rule: `${ESC}[38;5;238m`,
  box_title: `${ESC}[1;97m`,
  // semantic filled-background chips
  pass_bg: GREEN_CHIP,
  warn_bg: YELLOW_CHIP,
  fail_bg: RED_CHIP,
  high_bg: RED_CHIP,
  med_bg: `${ESC}[1;30;48;5;208m`,
  low_bg: `${ESC}[30;48;5;250m`,
  // the carrier's names again, chip side
  warning_bg: YELLOW_CHIP,
  error_bg: RED_CHIP,
  success_bg: GREEN_CHIP,
  info_bg: `${ESC}[1;30;46m`,
  // The TONE SLOT, the one pair of tags whose colour a RENDER decides instead of the
  // template. A view spends the slot, a carrier names the class that fills it, and
  // nothing else about the template changes: that is what keeps a second colour from
  // needing a second copy of a template. Filled by fillTone below; unfilled, the slot
  // holds the neutral, so a template may spend it with no carrier in sight.
  // A plain colour (`gold`, `dim`) has no chip, which is what the _bg fallback in
  // fillTone is for.
  [TONE]: NEUTRAL,
  [TONE_BG]: BASE.chip,
};

// The ONE source for the {{tag}} shape, instantiated once per flag set. Composed
// from a module-level literal and from nothing else: no input of any kind reaches
// this constructor, so the injection the rule guards against has no path here. It
// is built through a function rather than written as two literals because two
// copies of the same pattern are exactly the drift this module must not carry: the
// global one is consumed by replace(), the sticky one by the wrapper's scan, and
// they must never disagree about what a tag looks like.
// eslint-disable-next-line security/detect-non-literal-regexp
const tagRe = (flags: string): RegExp => new RegExp(String.raw`\{\{(\/|\w+)\}\}`, flags);

export const TAG_RE = tagRe("g");

// The same shape WRITTEN, for the modules that emit markup rather than parse it:
// a producer spelling {{...}} itself would be a second copy of the shape.
export function tagMark(name: string): string {
  return `{{${name}}}`;
}
export const RESET_MARK = tagMark("/");

// Sticky, for a caller that walks a line atom by atom and owns its own index.
// Deliberately a SEPARATE instance from TAG_RE: sharing one would mean sharing
// lastIndex with the replace() calls elsewhere.
export const TAG_AT = tagRe("y");

// An escape sequence already on the line (a rendered tag, or output the host
// coloured itself). Zero columns wide, so every measurement strips it.
export const ANSI_RE = /\x1b\[[0-9;]*m/g;

// Inline `code` spans render in Claude Code's native inline-code colour (the
// pinned `code` tag above). Applied inside rendered views, where the terminal
// does not re-apply markdown to the ANSI displayContent. The delimiter is
// exported for the same reason tagMark is: a walker that meets a backtick must
// agree with this pattern about what one means.
export const CODE_TICK = "`";
// eslint-disable-next-line security/detect-non-literal-regexp
export const CODE_RE = new RegExp(String.raw`${CODE_TICK}([^${CODE_TICK}\n]+)${CODE_TICK}`, "g");

// The host's OWN tags, registered once at startup. Process-global on purpose, not a
// per-render option: the vocabulary is consumed by the layout leaves inside every
// width measurement (wrap.ts, measure.ts), so the renderer and the measurer must
// resolve the SAME set, and a per-call set would thread through the whole layout
// layer to guarantee what one registry guarantees by construction.
// Consulted BEFORE the built-ins: a host's registration SHADOWS an engine name,
// under the same law as the views (the earlier dir shadows the bundled view).
const EXTENDED: Record<string, string> = {};

function resolveTag(name: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(EXTENDED, name)) return EXTENDED[name];
  if (Object.prototype.hasOwnProperty.call(TAGS, name)) return TAGS[name];
  return undefined;
}

/** What one extendTags call did not apply SILENTLY: the names that took over an
 * existing definition, and the names skipped for not fitting the {{tag}} shape. */
export interface TagReport {
  shadowed: string[];
  skipped: string[];
}

/**
 * Extend the palette with a host's tags. TOTAL, like everything a hook runs at
 * startup: it never throws, because the one thing a styling call must never cost
 * is the screen (a throw here once killed a whole host's display, silently, when
 * the engine later claimed a name the host already used).
 *
 * Shadowing is allowed and the LAST registration wins, the same law the views
 * live under: the screen's owner has the last word, and the engine's built-ins
 * keep their meaning only until a host deliberately takes a name over. What was
 * not applied silently is RETURNED rather than thrown: `shadowed` names an
 * existing definition taken over (report it rather than let a colour change in
 * silence), `skipped` a name the {{tag}} shape cannot carry. Re-registering an
 * identical pair is a no-op, so every entry point of one host may call this
 * without coordinating.
 */
export function extendTags(extra: Record<string, string>): TagReport {
  const report: TagReport = { shadowed: [], skipped: [] };
  for (const [name, seq] of Object.entries(extra)) {
    if (!/^\w+$/.test(name)) {
      report.skipped.push(name);
      continue;
    }
    const current = resolveTag(name);
    if (current === seq) continue;
    if (current !== undefined) report.shadowed.push(name);
    EXTENDED[name] = seq;
  }
  return report;
}

// An UNKNOWN tag name is left on screen verbatim, so it is text, not markup.
// Every width measurement has to agree with that, or a line mentioning a literal
// {{tag}} in its prose is measured shorter than it prints.
export function isTag(name: string): boolean {
  return resolveTag(name) !== undefined;
}

export function renderTags(s: string): string {
  return s.replace(TAG_RE, (m: string, name: string) => resolveTag(name) ?? m);
}

/**
 * The class a render spends: the first name of the chain the palette knows, or
 * undefined for the neutral. Every candidate is checked against the palette, so an
 * unknown name falls THROUGH to the next one instead of blanking the slot: the same
 * fail-open the rest of the engine applies to a name it does not know, and the reason
 * a typo in a carrier costs a colour rather than the whole render.
 */
export function toneClass(...names: (string | undefined)[]): string | undefined {
  for (const name of names) {
    if (name != null && name !== "" && isTag(name)) return name;
  }
  return undefined;
}

/**
 * Fill the tone slot: {{tone}} and {{tone_bg}} become `cls` and its chip, and nothing
 * else in the string is touched. Both slots are TAGS whatever happens, so a width
 * measured before this ran still holds (a tag costs no column) and an unfilled slot
 * renders the neutral rather than printing its own name.
 *
 * A class with no filled variant (`{{tone_bg}}` under `tone:gold`) spends its
 * foreground instead: dimmer than the author asked for, never a hole on screen.
 * Rewritten by split/join rather than by a regex built from `cls`: the name reaches
 * this from a message, and the ONE pattern for a tag lives in tagMark.
 */
export function fillTone(s: string, cls: string | undefined): string {
  if (cls == null) return s;
  const bg = isTag(cls + BG) ? cls + BG : cls;
  return s
    .split(tagMark(TONE_BG))
    .join(tagMark(bg))
    .split(tagMark(TONE))
    .join(tagMark(cls));
}

export function renderCode(s: string): string {
  return s.replace(CODE_RE, (_m: string, x: string) => `${TAGS.code}${x}${R}`);
}
