// The ANSI vocabulary: the tag names a view may write, and the transforms that turn
// that markup into escape sequences.
//
// The LEAF of the display chain (style <- layout <- template <- carrier <- pipeline):
// it knows nothing about geometry, data, or templates. The palette itself stays
// private, so a tag name is only ever resolved through isTag and renderTags.

import { CODE_TICK, TAG_CLOSE, TAG_OPEN } from "./data/markup.js";
import { INERT_MARK } from "./data/marks.js";

export { CODE_TICK };

const ESC = "\x1b";
export const R = `${ESC}[0m`;

// The base palette, every raw sequence written ONCE. The semantic tags below ALIAS
// these entries rather than repeat their sequences.
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
// as failure red, and `warning` is the same chip as `warn`.
const RED_CHIP = `${ESC}[1;97;41m`;
const GREEN_CHIP = `${ESC}[1;30;42m`;
const YELLOW_CHIP = `${ESC}[1;30;43m`;

// The NEUTRAL tone, aliased by `key` and by the tone slot: the slot defaulting to
// what `key` means is one decision, so it is one sequence.
const NEUTRAL = BASE.cyan;

// The tone slot's two names, and the suffix that pairs a tone with its chip. The
// table below and fillTone must agree on what the slot is called, or a view spends
// a tag that no longer resolves.
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
  // this table and nowhere else.
  warning: BASE.yellow,
  error: BASE.red,
  success: BASE.green,
  info: NEUTRAL,
  // Claude Code's native inline-code colour, pinned as truecolor. CC does NOT use an
  // ANSI palette slot for code spans (verified against the 2.1.x bundle): it emits
  // the fixed "Claude periwinkle" accent rgb(177,185,249). Pinning the exact RGB is
  // what makes a code span in a view match CC's own in every terminal, since
  // truecolor is theme-independent. Tracks CC's dark theme.
  code: `${ESC}[38;2;177;185;249m`,
  title: BASE.chip,
  // The outline is drawn in `dim`, the same grey as the gutter bar, so the frame and
  // the bars inside it read as one family. The rule under the header recedes one step
  // further: it is internal furniture rather than the block's outline.
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
  // template: a view spends the slot, a carrier names the class that fills it, and
  // that is what keeps a second colour from needing a second copy of a template.
  // Unfilled it holds the neutral, so a template may spend it with no carrier in
  // sight. A plain colour (`gold`) has no chip, hence the _bg fallback in fillTone.
  [TONE]: NEUTRAL,
  [TONE_BG]: BASE.chip,
};

/** The delimiters are regex punctuation, so a pattern quoting one must escape it. */
const BRACE_CHAR = /[{}]/g;
/** `$&` is the character that matched, handed back behind its backslash. */
const ESCAPED = String.raw`\$&`;
const brace = (s: string): string => s.replace(BRACE_CHAR, ESCAPED);

// What a tag NAME may be. Every reader of the shape derives from here: the pattern that
// FINDS a tag on a line, and the check that decides whether a host may REGISTER one. A
// second spelling would let the registry accept a name the matcher can never find.
const NAME_SOURCE = String.raw`\w+`;
/** The closing tag's name is the solidus, and it is the only one that is not a word. */
const CLOSE_SOURCE = String.raw`\/`;
const ANY_NAME = `${CLOSE_SOURCE}|${NAME_SOURCE}`;

/**
 * The tag shape as a pattern SOURCE, group-free, for a caller composing a regex of
 * its own over a line (the wrapper splits on it). One spelling, or a wrap and a
 * render disagree about what a tag is.
 */
export const TAG_SOURCE = brace(TAG_OPEN) + `(?:${ANY_NAME})` + brace(TAG_CLOSE);

/** One NAMED tag's literal shape, for the same kind of caller. */
export const tagSource = (name: string): string => brace(tagMark(name));

// Composed from module constants only: no input reaches this constructor.
const TAG_PATTERN = brace(TAG_OPEN) + `(${ANY_NAME})` + brace(TAG_CLOSE);
// eslint-disable-next-line security/detect-non-literal-regexp
const IS_NAME = new RegExp(`^${NAME_SOURCE}$`);
// One pattern per flag set, from one function: the global instance is consumed by
// replace(), the sticky one by the wrapper's scan, and they must never disagree.
// eslint-disable-next-line security/detect-non-literal-regexp
const tagRe = (flags: string): RegExp => new RegExp(TAG_PATTERN, flags);

export const TAG_RE = tagRe("g");

export function tagMark(name: string): string {
  return TAG_OPEN + name + TAG_CLOSE;
}
export const RESET_MARK = tagMark("/");

/**
 * The blank a filled chip puts on each side of its label, so the colour never
 * touches the text. The column measurer has to RESERVE what this spends, which is
 * why the width is derived here rather than counted at both ends.
 */
const CHIP_PAD = " ";
export const CHIP_CHROME = 2 * CHIP_PAD.length;

/** A filled chip around a label the caller has already padded to its column. */
export function chip(tag: string, label: string): string {
  return `${tagMark(tag)}${CHIP_PAD}${label}${CHIP_PAD}${RESET_MARK}`;
}

// Every brace in message data is followed by the inert mark, so the tag shape can no
// longer match while the value still measures as the text it prints. Every brace and
// not the pair, so an overlap (`{{{warn}}`) has no unmarked shape left in it.
export function inert(s: string): string {
  const b = TAG_OPEN[0];
  return s.includes(b) ? s.split(b).join(b + INERT_MARK) : s;
}

export function dropInert(s: string): string {
  return s.split(INERT_MARK).join("");
}

// Sticky, for a caller that walks a line atom by atom and owns its own index. A
// SEPARATE instance from TAG_RE: sharing one would mean sharing lastIndex.
export const TAG_AT = tagRe("y");

// An escape sequence already on the line (a rendered tag, or output the host
// coloured itself). Zero columns wide, so every measurement strips it.
export const ANSI_RE = /\x1b\[[0-9;]*m/g;

// Inline `code` spans, rendered in the pinned `code` tag above: inside a view the
// terminal does not re-apply markdown to the ANSI displayContent.
// eslint-disable-next-line security/detect-non-literal-regexp
export const CODE_RE = new RegExp(String.raw`${CODE_TICK}([^${CODE_TICK}\n]+)${CODE_TICK}`, "g");

// The host's OWN tags, registered once at startup. Process-global on purpose, not a
// per-render option: the vocabulary is consumed by the layout leaves inside every
// width measurement, so the renderer and the measurer must resolve the SAME set, and
// a per-call set would thread through the whole layout layer to guarantee what one
// registry guarantees by construction.
// Consulted BEFORE the built-ins: a host's registration SHADOWS an engine name, under
// the same law as the views (the earlier dir shadows the bundled view).
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
 * startup: a throw here once killed a whole host's display, silently, when the
 * engine later claimed a name the host already used.
 *
 * Shadowing is allowed and the LAST registration wins, the same law the views live
 * under: the screen's owner has the last word. What was not applied is RETURNED
 * rather than thrown, so a colour never changes in silence. Re-registering an
 * identical pair is a no-op, so every entry point of one host may call this without
 * coordinating.
 */
export function extendTags(extra: Record<string, string>): TagReport {
  const report: TagReport = { shadowed: [], skipped: [] };
  for (const [name, seq] of Object.entries(extra)) {
    if (!IS_NAME.test(name)) {
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

// An UNKNOWN tag name is left on screen verbatim, so it is text, not markup. Every
// width measurement has to agree with that, or a line mentioning a literal {{tag}} in
// its prose is measured shorter than it prints.
export function isTag(name: string): boolean {
  return resolveTag(name) !== undefined;
}

export function renderTags(s: string): string {
  return s.replace(TAG_RE, (m: string, name: string) => resolveTag(name) ?? m);
}

/**
 * The class a render spends: the first name of the chain the palette knows, or
 * undefined for the neutral. An unknown name falls THROUGH to the next candidate
 * instead of blanking the slot, which is why a typo in a carrier costs a colour
 * rather than the whole render.
 */
export function toneClass(...names: (string | undefined)[]): string | undefined {
  for (const name of names) {
    if (name != null && name !== "" && isTag(name)) return name;
  }
  return undefined;
}

/**
 * Fill the tone slot: {{tone}} and {{tone_bg}} become `cls` and its chip. Both stay
 * TAGS whatever happens, so a width measured before this ran still holds.
 *
 * A class with no filled variant (`{{tone_bg}}` under `tone:gold`) spends its
 * foreground instead: dimmer than the author asked for, never a hole on screen.
 * Rewritten by split/join rather than by a regex built from `cls`, which reaches this
 * from a message.
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
