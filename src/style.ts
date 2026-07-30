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

// The white-on-red filled chip, shared by two meanings: high severity reads as
// failure red.
const RED_CHIP = `${ESC}[1;97;41m`;

const TAGS: Record<string, string> = {
  ...BASE,
  // semantic foreground
  pass: BASE.green,
  warn: BASE.yellow,
  fail: BASE.red,
  high: `${ESC}[91m`,
  med: BASE.orange,
  low: BASE.dim,
  key: BASE.cyan,
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
  pass_bg: `${ESC}[1;30;42m`,
  warn_bg: `${ESC}[1;30;43m`,
  fail_bg: RED_CHIP,
  high_bg: RED_CHIP,
  med_bg: `${ESC}[1;30;48;5;208m`,
  low_bg: `${ESC}[30;48;5;250m`,
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
const EXTENDED: Record<string, string> = {};

function resolveTag(name: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(TAGS, name)) return TAGS[name];
  if (Object.prototype.hasOwnProperty.call(EXTENDED, name)) return EXTENDED[name];
  return undefined;
}

/**
 * Extend the palette with a host's tags. Additive only: redefining any existing tag
 * throws, because a shadow would change the language under every template's feet.
 * Re-registering an identical pair is a no-op, so every entry point of one host may
 * call this without coordinating.
 */
export function extendTags(extra: Record<string, string>): void {
  for (const [name, seq] of Object.entries(extra)) {
    if (!/^\w+$/.test(name)) {
      throw new Error(`tag name "${name}" does not fit the {{tag}} shape (\\w+ only)`);
    }
    const current = resolveTag(name);
    if (current === seq) continue;
    if (current !== undefined) {
      throw new Error(`tag "${name}" is already defined: a host extends the palette, never redefines it`);
    }
    EXTENDED[name] = seq;
  }
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

export function renderCode(s: string): string {
  return s.replace(CODE_RE, (_m: string, x: string) => `${TAGS.code}${x}${R}`);
}
