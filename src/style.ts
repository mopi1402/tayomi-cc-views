// The ANSI vocabulary: the tag names a view may write, and what they render as.
// Why the palette is process-global, and why only a template may spend it: docs/architecture/architecture.md.

import { CODE_TICK, TAG_CLOSE, TAG_OPEN } from "./data/markup.js";
import { INERT_MARK, RESUME_MARK, SPAN_MARK, dropControl } from "./data/marks.js";

export { CODE_TICK, RESUME_MARK, SPAN_MARK };

const ESC = "\x1b";
export const R = `${ESC}[0m`;

/** The one tag name that is not a word, and the only one that CLOSES. */
const RESET_NAME = "/";
const CODE = "code";

// Above BASE, which calls the builders at module load. A base-sixteen background sits ten above its foreground; the
// extended forms differ only by their selector.
const BG_FIRST = 40;
const BG_LAST = 47;
const BG_BRIGHT_FIRST = 100;
const BG_BRIGHT_LAST = 107;
const BG_TO_FG = 10;
const EXT_BG = 48;
const EXT_FG = 38;
// Parameters an extended colour spends, selector included. A foreground is skipped by the SAME table, or a `38;5;44`
// accent would be read as a cyan chip.
const INDEX_SEL = "5";
const RGB_SEL = "2";
const EXT_SPAN: Record<string, number> = { [INDEX_SEL]: 3, [RGB_SEL]: 5 };
const SGR = /^\x1b\[([0-9;]*)m$/;
const PARAM = ";";

/** Rounded, then clamped. A NaN would spell the word into the sequence, so it takes the floor. */
const BYTE_LAST = 255;
const byte = (n: number): number =>
  Number.isNaN(n) ? 0 : Math.min(BYTE_LAST, Math.max(0, Math.round(n)));

/**
 * A colour named by its 256-palette INDEX. Exported for extendTags, and called by the palette below so no second
 * spelling can drift. `0..15` is accepted though it names a THEME slot and derives no chip.
 */
export const ansi256 = (n: number): string =>
  `${ESC}[${EXT_FG}${PARAM}${INDEX_SEL}${PARAM}${byte(n)}m`;

/** A colour named by its PIXELS. */
export const rgb = (r: number, g: number, b: number): string =>
  `${ESC}[${EXT_FG}${PARAM}${RGB_SEL}${PARAM}${byte(r)}${PARAM}${byte(g)}${PARAM}${byte(b)}m`;

// Every raw sequence written ONCE; the semantic tags below ALIAS these.
const BASE: Record<string, string> = {
  [RESET_NAME]: R,
  b: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  red: `${ESC}[1;31m`,
  green: `${ESC}[1;32m`,
  yellow: `${ESC}[1;33m`,
  blue: `${ESC}[1;34m`,
  magenta: `${ESC}[1;35m`,
  cyan: `${ESC}[1;36m`,
  // Indices, which the theme does not repaint: chip and cap both derive from them, ink included.
  orange: ansi256(208),
  gold: ansi256(220),
  purple: ansi256(141),
  violet: ansi256(135),
  pink: ansi256(211),
  teal: ansi256(37),
  aqua: ansi256(44),
  lime: ansi256(154),
  brown: ansi256(130),
  navy: ansi256(25),
  salmon: ansi256(209),
  mint: ansi256(121),
  chip: `${ESC}[1;38;5;16;48;5;231m`,
};

// EVERY colour a tone may name must have a chip: a template may spend it as a SURFACE (banner.view fills a band with
// it), and a class with no chip leaves that template drawing the edges of nothing.
const RED_CHIP = `${ESC}[1;97;41m`;
const GREEN_CHIP = `${ESC}[1;30;42m`;
const YELLOW_CHIP = `${ESC}[1;30;43m`;
const CYAN_CHIP = `${ESC}[1;30;46m`;
// The two DARK fills of the base range, hence white ink where the others take black.
const BLUE_CHIP = `${ESC}[1;97;44m`;
const MAGENTA_CHIP = `${ESC}[1;97;45m`;
// `low` and `dim` are a WEIGHT, so nothing about them is measurable and this grey is a choice.
const GREY_CHIP = `${ESC}[30;48;5;250m`;

const NEUTRAL = BASE.cyan;

const BG = "_bg";
const CAP = "_cap";
const TONE = "tone";
const TONE_BG = TONE + BG;
const TONE_CAP = TONE + CAP;

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
  // the names a CARRIER writes (`tone:warning`, `type:error`)
  warning: BASE.yellow,
  error: BASE.red,
  success: BASE.green,
  info: NEUTRAL,
  // Claude Code uses no palette slot for code spans but the fixed periwinkle rgb(177,185,249), verified against the
  // 2.1.x bundle. Truecolor, so a view's code span matches CC's own under every theme.
  [CODE]: `${ESC}[38;2;177;185;249m`,
  title: BASE.chip,
  box_rule: `${ESC}[38;5;238m`,
  box_title: `${ESC}[1;97m`,
  // semantic filled-background chips
  pass_bg: GREEN_CHIP,
  warn_bg: YELLOW_CHIP,
  fail_bg: RED_CHIP,
  high_bg: RED_CHIP,
  low_bg: GREY_CHIP,
  warning_bg: YELLOW_CHIP,
  error_bg: RED_CHIP,
  success_bg: GREEN_CHIP,
  info_bg: CYAN_CHIP,
  // The base-sixteen chips, the only ones declared by hand: the ink cannot be measured against a slot the theme owns.
  // Every other chip derives (chipOf).
  red_bg: RED_CHIP,
  green_bg: GREEN_CHIP,
  yellow_bg: YELLOW_CHIP,
  blue_bg: BLUE_CHIP,
  magenta_bg: MAGENTA_CHIP,
  cyan_bg: CYAN_CHIP,
  key_bg: CYAN_CHIP,
  dim_bg: GREY_CHIP,
  // `chip` already carries a background, so it names ITSELF as its fill. Without these lines the cap fell back to the
  // whole sequence and painted a BLACK glyph inside the white box.
  chip_bg: BASE.chip,
  title_bg: BASE.chip,
  // `tone_cap` is absent ON PURPOSE: every `_cap` derives from the `_bg` beside it.
  [TONE]: NEUTRAL,
  [TONE_BG]: BASE.chip,
};

/** The delimiters are regex punctuation, so a pattern quoting one must escape it. */
const BRACE_CHAR = /[{}]/g;
/** `$&` is the character that matched, handed back behind its backslash. */
const ESCAPED = String.raw`\$&`;
const brace = (s: string): string => s.replace(BRACE_CHAR, ESCAPED);

// One spelling, or the registry accepts a name the matcher can never find.
const NAME_SOURCE = String.raw`\w+`;
/** A solidus is punctuation to a pattern. */
const CLOSE_SOURCE = `\\${RESET_NAME}`;
const ANY_NAME = `${CLOSE_SOURCE}|${NAME_SOURCE}`;

/** The tag shape as a group-free pattern SOURCE, for a caller composing a regex of its own (the wrapper splits on it). */
export const TAG_SOURCE = brace(TAG_OPEN) + `(?:${ANY_NAME})` + brace(TAG_CLOSE);

/** One NAMED tag's literal shape, for the same kind of caller. */
export const tagSource = (name: string): string => brace(tagMark(name));

// Composed from module constants only: no input reaches this constructor.
const TAG_PATTERN = brace(TAG_OPEN) + `(${ANY_NAME})` + brace(TAG_CLOSE);
// eslint-disable-next-line security/detect-non-literal-regexp
const IS_NAME = new RegExp(`^${NAME_SOURCE}$`);
// One pattern per flag set: replace() consumes the global instance and the wrapper's scan the sticky one.
// eslint-disable-next-line security/detect-non-literal-regexp
const tagRe = (flags: string): RegExp => new RegExp(TAG_PATTERN, flags);

export const TAG_RE = tagRe("g");

export function tagMark(name: string): string {
  return TAG_OPEN + name + TAG_CLOSE;
}
export const RESET_MARK = tagMark(RESET_NAME);

/** The blank a chip puts on each side of its label, derived here because the measurer has to RESERVE it. */
const CHIP_PAD = " ";
export const CHIP_CHROME = 2 * CHIP_PAD.length;

/** A filled chip around a label the caller has already padded to its column. */
export function chip(tag: string, label: string): string {
  return `${spanOpen(tag)}${CHIP_PAD}${label}${CHIP_PAD}${spanClose(tag)}`;
}

/**
 * How a span the ENGINE inserted BEGINS. The mark is not decoration on the tag: it is the only thing separating the
 * span's frame from what the line had already opened. Written even where spanClose answers with a reset, which costs
 * nothing since a reset clears the whole stack.
 */
export function spanOpen(tag: string): string {
  return SPAN_MARK + tagMark(tag);
}

/**
 * How a span the ENGINE inserted TERMINATES, decided in one place.
 *
 * A resume closes exactly the tag its span opened, so it is only right where that opener is a name the palette answers
 * for. A `@map` may hand a chip a word nobody knows: the opener is then TEXT, it opened nothing, and a resume would
 * close the style the span sits IN. That span clears instead.
 */
export function spanClose(tag: string): string {
  return isTag(tag) ? RESUME_MARK : RESET_MARK;
}

// Every brace and not the pair, so an overlap (`{{{warn}}`) has no unmarked shape left in it. The reserved codes come
// OFF first: a brace is broken because it must still print, a code prints nothing and is dropped.
export function inert(s: string): string {
  const b = TAG_OPEN[0];
  const text = dropControl(s);
  return text.includes(b) ? text.split(b).join(b + INERT_MARK) : text;
}

export function dropInert(s: string): string {
  return s.split(INERT_MARK).join("");
}

// Sticky, for a caller that walks a line atom by atom. A SEPARATE instance from TAG_RE: sharing one shares lastIndex.
export const TAG_AT = tagRe("y");

/** An escape sequence already on the line. Zero columns wide, so every measurement strips it. */
export const ANSI_RE = /\x1b\[[0-9;]*m/g;

// eslint-disable-next-line security/detect-non-literal-regexp
export const CODE_RE = new RegExp(String.raw`${CODE_TICK}([^${CODE_TICK}\n]+)${CODE_TICK}`, "g");

// Consulted BEFORE the built-ins: a host SHADOWS an engine name.
const EXTENDED: Record<string, string> = {};

/**
 * The foreground painting a chip's BACKGROUND colour, or undefined for a sequence that fills nothing. The first
 * background wins.
 *
 * A cap must never be a second constant free to drift from its chip. `1;36` and `46` name the same palette entry and
 * still do not agree on screen: bold promotes a base-sixteen FOREGROUND to the bright slot and nothing promotes the
 * background.
 */
function capOf(seq: string): string | undefined {
  const m = SGR.exec(seq);
  if (m == null) return undefined;
  const p = m[1].split(PARAM);
  for (let i = 0; i < p.length; ) {
    const n = Number(p[i]);
    if (n === EXT_BG || n === EXT_FG) {
      const span = EXT_SPAN[p[i + 1]] ?? 0;
      // Malformed, or truncated: a guess here paints a cap no one asked for.
      if (span === 0 || i + span > p.length) return undefined;
      if (n === EXT_BG) return `${ESC}[${EXT_FG}${PARAM}${p.slice(i + 1, i + span).join(PARAM)}m`;
      i += span;
      continue;
    }
    const base = n >= BG_FIRST && n <= BG_LAST;
    const bright = n >= BG_BRIGHT_FIRST && n <= BG_BRIGHT_LAST;
    if (base || bright) return `${ESC}[${n - BG_TO_FG}m`;
    i += 1;
  }
  return undefined;
}

// The xterm-256 geometry, which is what makes an INDEX measurable: a 6x6x6 cube of fixed levels, then a 24-step grey
// ramp. The first sixteen are the theme's own and no arithmetic reaches them.
const CUBE_FIRST = 16;
const CUBE_SIDE = 6;
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255];
const RAMP_FIRST = CUBE_FIRST + CUBE_SIDE ** 3;
const RAMP_BASE = 8;
const RAMP_STEP = 10;
const INDEX_LAST = 255;

function indexRgb(n: number): number[] | undefined {
  if (!Number.isInteger(n) || n < CUBE_FIRST || n > INDEX_LAST) return undefined;
  if (n >= RAMP_FIRST) {
    const v = RAMP_BASE + (n - RAMP_FIRST) * RAMP_STEP;
    return [v, v, v];
  }
  const i = n - CUBE_FIRST;
  return [2, 1, 0].map((p) => CUBE_LEVELS[Math.floor(i / CUBE_SIDE ** p) % CUBE_SIDE]);
}

// WCAG relative luminance, spelled out rather than approximated by "is the sum of the channels high", which calls a
// saturated blue light.
const CHANNEL_MAX = 255;
const SRGB_KNEE = 0.03928;
const SRGB_SLOPE = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_GAMMA = 2.4;
const LUMA = [0.2126, 0.7152, 0.0722];
const CONTRAST_FLOOR = 0.05;
const WHITE_LUMINANCE = 1;
const INK_DARK = "30";
const INK_LIGHT = "97";
const BOLD = "1";

/** The ink that contrasts MORE against a colour, which is the only choice a chip makes. */
function inkOn(rgb: number[]): string {
  const linear = (c: number): number => {
    const s = c / CHANNEL_MAX;
    return s <= SRGB_KNEE ? s / SRGB_SLOPE : ((s + SRGB_OFFSET) / (1 + SRGB_OFFSET)) ** SRGB_GAMMA;
  };
  const l = LUMA.reduce((sum, w, i) => sum + w * linear(rgb[i]), 0);
  const onDark = (l + CONTRAST_FLOOR) / CONTRAST_FLOOR;
  const onLight = (WHITE_LUMINANCE + CONTRAST_FLOOR) / (l + CONTRAST_FLOOR);
  return onDark > onLight ? INK_DARK : INK_LIGHT;
}

/**
 * The chip filling with a foreground's own colour, or undefined when the colour cannot be MEASURED, which means the
 * sequence does not name its pixels: a base-sixteen slot is whatever the THEME paints.
 *
 * A sequence that already fills derives nothing: `chip` writes black on white, and reading its foreground would hand
 * back a BLACK band.
 */
function chipOf(seq: string): string | undefined {
  if (capOf(seq) !== undefined) return undefined;
  const m = SGR.exec(seq);
  if (m == null) return undefined;
  const p = m[1].split(PARAM);
  for (let i = 0; i < p.length; ) {
    if (Number(p[i]) !== EXT_FG) {
      i += 1;
      continue;
    }
    const span = EXT_SPAN[p[i + 1]] ?? 0;
    if (span === 0 || i + span > p.length) return undefined;
    const body = p.slice(i + 1, i + span);
    const rgb = body[0] === INDEX_SEL ? indexRgb(Number(body[1])) : body.slice(1).map(Number);
    if (rgb == null || rgb.some((c) => !Number.isInteger(c))) return undefined;
    return `${ESC}[${BOLD}${PARAM}${inkOn(rgb)}${PARAM}${EXT_BG}${PARAM}${body.join(PARAM)}m`;
  }
  return undefined;
}

/**
 * `<class>_bg` and `<class>_cap`, derived on demand so no pair can drift and a host registering ONE colour gets all
 * three names. The table still wins where it declares a chip, which is how the base-sixteen colours keep their ink.
 */
function derivedTag(name: string): string | undefined {
  if (name.endsWith(CAP)) {
    const filled = resolveTag(name.slice(0, -CAP.length) + BG);
    return filled == null ? undefined : capOf(filled);
  }
  if (name.endsWith(BG)) {
    const colour = resolveTag(name.slice(0, -BG.length));
    return colour == null ? undefined : chipOf(colour);
  }
  return undefined;
}

function baseOf(name: string): string | undefined {
  if (name.endsWith(CAP)) return name.slice(0, -CAP.length);
  if (name.endsWith(BG)) return name.slice(0, -BG.length);
  return undefined;
}

function resolveTag(name: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(EXTENDED, name)) return EXTENDED[name];
  // A chip BELONGS to its colour: a host shadowing the colour shadows the pair, or a host's own `info` renders its band
  // in the engine's cyan. The table stays the fallback, so a host colour the engine cannot measure keeps its old chip.
  const base = baseOf(name);
  if (base != null && Object.prototype.hasOwnProperty.call(EXTENDED, base)) {
    const derived = derivedTag(name);
    if (derived !== undefined) return derived;
  }
  if (Object.prototype.hasOwnProperty.call(TAGS, name)) return TAGS[name];
  return derivedTag(name);
}

/**
 * Every tag NAME the palette answers to: the engine's own, and whatever a host registered here.
 *
 * NAMES and never sequences. The palette's values stay unexported on purpose, since that is what stops a second module
 * growing its own opinion about a colour, and a catalogue needs the vocabulary, never the ink.
 *
 * The `cap` and `bg` forms are deliberately absent: they are a RULE rather than entries, any colour above suffixing
 * into one, so a reader is told the rule (`TAG_SUFFIXES`) instead of a list that could never be complete.
 */
export function tagNames(): string[] {
  return [...new Set([...Object.keys(TAGS), ...Object.keys(EXTENDED)])].sort();
}

/** The suffixes a colour name derives into, so a reader can state the rule rather than enumerate its results. */
export const TAG_SUFFIXES: readonly string[] = [CAP, BG];

/** What one extendTags call did not apply SILENTLY: names that took over a definition, and names the shape rejected. */
export interface TagReport {
  shadowed: string[];
  skipped: string[];
}

/**
 * Extend the palette with a host's tags. TOTAL: a throw here once killed a whole host's display, silently, when the
 * engine later claimed a name the host already used. What was not applied is RETURNED rather than thrown, so a colour
 * never changes in silence. The LAST registration wins, and re-registering an identical pair is a no-op.
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

// An UNKNOWN name is left on screen verbatim, so it is text. Every width measurement has to agree, or a line mentioning
// a literal {{tag}} in its prose measures shorter than it prints.
export function isTag(name: string): boolean {
  return resolveTag(name) !== undefined;
}

/**
 * What a walk has stepped over and not yet closed, innermost LAST: tag names, and the span boundaries between them. ONE
 * notion, read by renderTags and by fitCell and copied by neither, because a boolean says WHETHER a style is open and
 * never WHICH. A boundary rides the same stack because the two interleave: what a resume unwinds is a RANGE of it.
 */
export function trackTag(open: string[], name: string): void {
  if (name === RESET_NAME) open.length = 0;
  else open.push(name);
}

/**
 * What a resume ends: the FRAME its span opened, never one entry. With no boundary on the stack the frame is the whole
 * stack, which is a resume reaching a line no span of the engine's had opened.
 */
export function popSpan(open: string[]): void {
  while (open.length > 0) {
    if (open.pop() === SPAN_MARK) return;
  }
}

/**
 * What a resume becomes: its frame closed, and everything still open under it re-opened. The reset is not a formality:
 * `dim` is an ATTRIBUTE, so re-emitting it over the foreground a code span set would leave the code colour underneath.
 *
 * Nothing open resolves to a PLAIN RESET, which is what makes a span outside any styled region render as it did before
 * these marks existed.
 */
function resumeTags(open: string[]): string {
  popSpan(open);
  return open.reduce((seq, name) => seq + (resolveTag(name) ?? ""), R);
}

/**
 * A CUT sealed so the row gets its style back: one resume ends a frame, so what is written is the number of frames the
 * cut left half-open and never the number of entries.
 *
 * The cut opens a frame of its OWN. The bare tags a value wrote belong to no span, so a resume closing them would find
 * no boundary and unwind the ROW's tags with the cell's.
 */
export function closeCut(cut: string, open: readonly string[]): string {
  if (open.length === 0) return cut;
  const rest = [SPAN_MARK, ...open];
  let frames = 0;
  while (rest.length > 0) {
    popSpan(rest);
    frames += 1;
  }
  return SPAN_MARK + cut + RESUME_MARK.repeat(frames);
}

// One matcher over all three shapes: separate passes would disagree about which of a tag and a span mark came first.
// eslint-disable-next-line security/detect-non-literal-regexp
const MARKUP_RE = new RegExp(`${TAG_PATTERN}|${RESUME_MARK}|${SPAN_MARK}`, "g");

export function renderTags(s: string): string {
  const open: string[] = [];
  return s.replace(MARKUP_RE, (m: string, name?: string) => {
    if (m === SPAN_MARK) {
      trackTag(open, m);
      return ""; // a boundary prints nothing, and this is the last pass before the screen
    }
    // The alternation's discriminator: only the tag branch captures a name.
    if (name === undefined) return resumeTags(open);
    const seq = resolveTag(name);
    if (seq === undefined) return m; // unknown, so it reaches the screen as text and opens nothing
    trackTag(open, name);
    return seq;
  });
}

/**
 * The class a render spends: the first name of the chain the palette knows, or undefined for the neutral. An unknown
 * name falls THROUGH instead of blanking the slot, so a typo in a carrier costs a colour and not the render.
 */
export function toneClass(...names: (string | undefined)[]): string | undefined {
  for (const name of names) {
    if (name != null && name !== "" && isTag(name)) return name;
  }
  return undefined;
}

/**
 * Fill the tone slot: {{tone}}, {{tone_bg}} and {{tone_cap}} become `cls`, its chip and the foreground matching that
 * chip. All three stay TAGS whatever happens, so a width measured before this ran still holds. A class with no filled
 * variant spends its foreground instead: dimmer than the author asked for, never a hole on screen.
 *
 * Rewritten by split/join rather than by a regex built from `cls`, which reaches this from a message.
 */
export function fillTone(s: string, cls: string | undefined): string {
  if (cls == null) return s;
  const bg = isTag(cls + BG) ? cls + BG : cls;
  const cap = isTag(cls + CAP) ? cls + CAP : cls;
  return s
    .split(tagMark(TONE_CAP))
    .join(tagMark(cap))
    .split(tagMark(TONE_BG))
    .join(tagMark(bg))
    .split(tagMark(TONE))
    .join(tagMark(cls));
}

/**
 * Code spans as MARKS. It runs BEFORE fillTone and renderTags, so the style a span interrupts is still an unresolved
 * mark here and, where it is the tone slot, not yet even a colour: the terminator cannot be a sequence.
 */
export function markCode(s: string): string {
  return s.replace(CODE_RE, (_m: string, x: string) => `${spanOpen(CODE)}${x}${spanClose(CODE)}`);
}

/**
 * Code spans as SEQUENCES, for a host colouring a line of its own. SELF-CONTAINED, and deliberately not
 * `renderTags(markCode(s))`: a host's line carries no marks for a resume to land on, and resolving one would make this
 * a second place where a `{{tag}}` in someone else's text turns into a colour.
 */
export function renderCode(s: string): string {
  const open = resolveTag(CODE) ?? "";
  return s.replace(CODE_RE, (_m: string, x: string) => `${open}${x}${R}`);
}
