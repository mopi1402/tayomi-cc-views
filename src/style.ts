// The ANSI vocabulary: the tag names a view may write, and what they render as.
// Why the palette is process-global, and why only a template may spend it: docs/architecture/architecture.md.

import { CODE_TICK, EMPHASIS_STAR, NL, TAG_CLOSE, TAG_OPEN } from "./data/markup.js";
import {
  CELL_MARK,
  INERT_MARK,
  RESUME_MARK,
  SPAN_MARK,
  STACK_MARK,
  dropControl,
} from "./data/marks.js";
import { activeTheme, counterpart, isLight, slotIsDark, type Theme } from "./platform/theme.js";

export { CODE_TICK, RESUME_MARK, SPAN_MARK };

const ESC = "\x1b";
export const R = `${ESC}[0m`;

/** The one tag name that is not a word, and the only one that CLOSES. */
const RESET_NAME = "/";
const CODE = "code";
const SPACE = " ";

// A base-sixteen background sits ten above its foreground; the extended forms differ only by their selector.
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
const BOLD = "1";
// The bright run continues the same sixteen, which is why it starts eight in.
const FG_FIRST = 30;
const FG_LAST = 37;
const FG_BRIGHT_FIRST = 90;
const FG_BRIGHT_LAST = 97;
const BRIGHT_TO_SLOT = 8;

/** Asked ONCE: a hook lives the length of one message and the answer costs disk. */
const THEME = activeTheme();
const TERMINAL_IS_LIGHT = isLight(THEME);

/** A NaN would spell the word into the sequence, so it takes the floor. */
const BYTE_LAST = 255;
const byte = (n: number): number =>
  Number.isNaN(n) ? 0 : Math.min(BYTE_LAST, Math.max(0, Math.round(n)));

/** A colour named by its 256-palette INDEX. `0..15` is accepted though it names a THEME slot and derives no chip. */
export const ansi256 = (n: number): string =>
  `${ESC}[${EXT_FG}${PARAM}${INDEX_SEL}${PARAM}${byte(n)}m`;

export const rgb = (r: number, g: number, b: number): string =>
  `${ESC}[${EXT_FG}${PARAM}${RGB_SEL}${PARAM}${byte(r)}${PARAM}${byte(g)}${PARAM}${byte(b)}m`;

// The two ends of the 256-colour cube, which the theme does not repaint.
const CUBE_BLACK = 16;
const CUBE_WHITE = 231;

/** Ink and fill in one sequence, so the pair can only ever be swapped together. */
const pill = (ink: number, fill: number): string =>
  `${ESC}[${BOLD}${PARAM}${EXT_FG}${PARAM}${INDEX_SEL}${PARAM}${byte(ink)}` +
  `${PARAM}${EXT_BG}${PARAM}${INDEX_SEL}${PARAM}${byte(fill)}m`;

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
  // The one fill in this table that TURNS OVER with the terminal: a neutral is only neutral against something, and
  // near-white reads as a band on a dark screen and as nothing on a light one. Swapping the pair keeps the contrast.
  chip: TERMINAL_IS_LIGHT ? pill(CUBE_WHITE, CUBE_BLACK) : pill(CUBE_BLACK, CUBE_WHITE),
};

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
const INK_DARK = "30";
const INK_LIGHT = "97";

function luminance(rgb: number[]): number {
  const linear = (c: number): number => {
    const s = c / CHANNEL_MAX;
    return s <= SRGB_KNEE ? s / SRGB_SLOPE : ((s + SRGB_OFFSET) / (1 + SRGB_OFFSET)) ** SRGB_GAMMA;
  };
  return LUMA.reduce((sum, w, i) => sum + w * linear(rgb[i]), 0);
}

/** WCAG, and the one ratio in this module: an ink choice and a legibility test that disagreed would be two thresholds. */
function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + CONTRAST_FLOOR) / (lo + CONTRAST_FLOOR);
}

const BLACK = [0, 0, 0];
const WHITE = [CHANNEL_MAX, CHANNEL_MAX, CHANNEL_MAX];

/** The ink that contrasts MORE against a colour, which is the only choice a chip makes. */
const inkOn = (rgb: number[]): string =>
  contrast(rgb, BLACK) > contrast(rgb, WHITE) ? INK_DARK : INK_LIGHT;

/** Asked of inkOn so no second threshold can disagree with it. */
const colourIsLight = (rgb: number[]): boolean => inkOn(rgb) === INK_DARK;

// EVERY colour a tone may name must have a chip: a template may spend it as a SURFACE (banner.view fills a band with
// it), and a class with no chip leaves that template drawing the edges of nothing.
const RED_CHIP = `${ESC}[1;97;41m`;
const GREEN_CHIP = `${ESC}[1;30;42m`;
const YELLOW_CHIP = `${ESC}[1;30;43m`;
const CYAN_CHIP = `${ESC}[1;30;46m`;
// Blue and magenta OFF the base range, the two whose ink the guess above got BACKWARDS: measured on a terminal painting
// slot 44 a light periwinkle, the band came out bright white on near-white, and the code span inside inherited that same
// verdict and landed at 1.9. An INDEX is pixels, so both derive instead. The cost is that the band stops being the
// reader's own blue, which a fill nothing can measure was never able to promise anyway.
const BLUE_FILL = 20;
const MAGENTA_FILL = 127;
/** Through the same door every derived chip goes through, so no ink here is declared where one could be measured. */
const indexChip = (n: number): string => chipOf(ansi256(n)) ?? BASE.chip;
const BLUE_CHIP = indexChip(BLUE_FILL);
const MAGENTA_CHIP = indexChip(MAGENTA_FILL);
// `low` and `dim` are a WEIGHT, so nothing about them is measurable and this grey is a choice.
const GREY_CHIP = `${ESC}[30;48;5;250m`;

const NEUTRAL = BASE.cyan;

// Claude Code has no code-span colour of its own: it spends its `permission` slot on one
// (`case"codespan":return no("permission",t)` in the 2.1.x bundle), and that slot holds a different value under each of
// its six themes. Read slot by slot from the same bundle, so a view's code span matches the host's own line beside it.
//
// The two ANSI themes name a SLOT and must not be the palette's own `blue`: that one is bold, and bold promotes a
// base-sixteen foreground to the bright slot, which would draw `light-ansi` in the colour `dark-ansi` asked for.
const ANSI_BLUE = `${ESC}[34m`;
const ANSI_BLUE_BRIGHT = `${ESC}[94m`;
const CODE_INK: Record<Theme, string> = {
  light: rgb(87, 105, 247),
  "light-ansi": ANSI_BLUE,
  "light-daltonized": rgb(51, 102, 255),
  dark: rgb(177, 185, 249),
  "dark-ansi": ANSI_BLUE_BRIGHT,
  "dark-daltonized": rgb(153, 204, 255),
};

// A span's ink is chosen against the FILL UNDER IT, never against the theme: a code span inside the neutral pill used
// to take the terminal's value and land at a contrast of 1.62. The counterpart keeps the VARIANT, or an `ansi` or
// daltonized reader would get, inside a band, the one palette they went out of their way not to be shown.
const CODE_ON_LIGHT = CODE_INK[TERMINAL_IS_LIGHT ? THEME : counterpart(THEME)];
const CODE_ON_DARK = CODE_INK[TERMINAL_IS_LIGHT ? counterpart(THEME) : THEME];

const BG = "_bg";
const CAP = "_cap";
const TONE = "tone";
/** What a class with no pixels of its own is given to draw ON. Named here because fillTone is its only reader. */
const NEUTRAL_SURFACE = "chip";
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
  // The value for a span sitting on the TERMINAL, which is the only fill this table can know about. A span inside a
  // band is resolved by renderTags, the one storey that holds the stack of what is open under it.
  [CODE]: TERMINAL_IS_LIGHT ? CODE_ON_LIGHT : CODE_ON_DARK,
  title: BASE.chip,
  box_rule: `${ESC}[38;5;238m`,
  // Bright white is a SLOT, so on a light screen it is roughly the background and the title goes with it. The
  // replacement is the WEIGHT alone: `1;30` comes out grey on white, and the cube's black would derive a chip.
  box_title: TERMINAL_IS_LIGHT ? BASE.b : `${ESC}[1;97m`,
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
 * How a span the ENGINE inserted BEGINS. The mark is the only thing separating the span's frame from what the line had
 * already opened.
 */
export function spanOpen(tag: string): string {
  return SPAN_MARK + tagMark(tag);
}

/**
 * How a span the ENGINE inserted TERMINATES. A resume closes exactly the tag its span opened, so it is right only where
 * that opener is a name the palette answers for: an unknown `@map` word leaves the opener as TEXT, and a resume would
 * then close the style the span sits IN. That span clears instead.
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

// What a span may not CROSS. A span is looked for on the line the layout already DREW, so a cell is still bracketed
// here: markdown splits a row into cells before it looks for one, and without these a run opened in one column closed
// in the next, eating both delimiters and the text between. A stacked row is a screen row of its own, same rule.
const SPAN_STOP = `${NL}${CELL_MARK}${STACK_MARK}`;

// A code span the way CommonMark reads one: a RUN of backticks opens it, and only a run of the SAME length closes it,
// which is what lets a span carry backticks of its own. A class forbidding the backtick inside read a quoted fence as
// two spans and dropped the run between them, so the syntax a cell was quoting never reached the screen.
// eslint-disable-next-line security/detect-non-literal-regexp
const CODE_RE = new RegExp(
  String.raw`(?<!${CODE_TICK})(${CODE_TICK}+)(?!${CODE_TICK})([^${SPAN_STOP}]+?)(?<!${CODE_TICK})\1(?!${CODE_TICK})`,
  "g"
);

/** Where a span sits: the delimiter runs at either end, and the TEXT between them with its padding already spent. */
export type CodeSpan = { at: number; textAt: number; textEnd: number; end: number; run: string };

// CommonMark's padding rule: one space off each end, and only where BOTH are there and the span is not all spaces. It
// is what lets a span open or close on a backtick of its own.
function padded(text: string): boolean {
  return text.startsWith(SPACE) && text.endsWith(SPACE) && text.trim() !== "";
}

/** The spans of `s`, in order and never overlapping: the one reading of the line every reader below shares. */
export function codeSpans(s: string): CodeSpan[] {
  const out: CodeSpan[] = [];
  for (const m of s.matchAll(CODE_RE)) {
    const at = m.index ?? 0;
    const run = m[1];
    const end = at + m[0].length;
    const pad = padded(m[2]) ? SPACE.length : 0;
    out.push({ at, textAt: at + run.length + pad, textEnd: end - run.length - pad, end, run });
  }
  return out;
}

/**
 * Every span of `s`, its own TEXT handed to `f` and the delimiters gone. The one place that knows where a span begins
 * and ends, so the measurer, the wrapper and the two renderers cannot grow four opinions about it.
 */
export function overCode(s: string, f: (text: string) => string): string {
  let out = "";
  let i = 0;
  for (const sp of codeSpans(s)) {
    out += s.slice(i, sp.at) + f(s.slice(sp.textAt, sp.textEnd));
    i = sp.end;
  }
  return out + s.slice(i);
}

// Consulted BEFORE the built-ins: a host SHADOWS an engine name.
const EXTENDED: Record<string, string> = {};

/**
 * The foreground painting a chip's BACKGROUND colour, derived so a cap cannot drift from its chip. `1;36` and `46` name
 * one palette entry and still disagree on screen: bold promotes a base-sixteen foreground, nothing promotes a fill.
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

// AA for body text. A code span inside a band is read, never glanced at, so the large-text 3:1 does not apply.
const CODE_TARGET = 4.5;
// Toward the endpoint the fill's own ink points at, which is the direction that gains contrast. Small enough that the
// first step clearing the target is close to it, bounded so an unreachable target ends rather than loops.
const CODE_STEP = 0.85;
const CODE_STEPS = 16;

/**
 * The host's code colour, pushed until it is legible ON a given fill.
 *
 * The hue is what makes a span read as code, so it is the one thing kept: every channel moves by the SAME factor
 * toward black or toward white. Only inside a fill, and that is the whole justification for touching a value read from
 * the host's own theme: on the terminal a view's span sits beside the host's own line and must match it exactly, where
 * on a band the host has nothing to match.
 */
function legibleOn(ink: number[], fill: number[]): number[] {
  const toward = colourIsLight(fill) ? 0 : CHANNEL_MAX;
  let out = ink;
  for (let n = 0; n < CODE_STEPS && contrast(out, fill) < CODE_TARGET; n++) {
    out = out.map((c) => Math.round(toward + (c - toward) * CODE_STEP));
  }
  return out;
}

/**
 * Which side the fill of a chip sits on. Read off the INK, not the fill: half the chips fill with a base-sixteen slot
 * whose pixels belong to the theme, and the ink beside it is the verdict already reached about that fill.
 */
function fillIsLight(seq: string): boolean | undefined {
  const m = SGR.exec(seq);
  if (m == null) return undefined;
  const p = m[1].split(PARAM);
  for (let i = 0; i < p.length; ) {
    const n = Number(p[i]);
    if (n === EXT_FG || n === EXT_BG) {
      const span = EXT_SPAN[p[i + 1]] ?? 0;
      if (span === 0 || i + span > p.length) return undefined;
      if (n === EXT_FG) {
        const body = p.slice(i + 1, i + span);
        const ink = body[0] === INDEX_SEL ? indexRgb(Number(body[1])) : body.slice(1).map(Number);
        if (ink == null || ink.some((c) => !Number.isInteger(c))) return undefined;
        // The INK's side, so the fill under it is the other one.
        return !colourIsLight(ink);
      }
      i += span;
      continue;
    }
    const base = n >= FG_FIRST && n <= FG_LAST;
    const bright = n >= FG_BRIGHT_FIRST && n <= FG_BRIGHT_LAST;
    if (base || bright) {
      return slotIsDark(bright ? n - FG_BRIGHT_FIRST + BRIGHT_TO_SLOT : n - FG_FIRST);
    }
    i += 1;
  }
  return undefined;
}

/**
 * The PIXELS an extended colour names, ink or fill, undefined where the sequence names a base-sixteen slot instead:
 * those belong to the theme, and a colour nothing can read is a colour nothing can be measured against.
 */
function extRgb(seq: string, which: number): number[] | undefined {
  const m = SGR.exec(seq);
  if (m == null) return undefined;
  const p = m[1].split(PARAM);
  for (let i = 0; i < p.length; ) {
    const n = Number(p[i]);
    if (n !== EXT_FG && n !== EXT_BG) {
      i += 1;
      continue;
    }
    const span = EXT_SPAN[p[i + 1]] ?? 0;
    if (span === 0 || i + span > p.length) return undefined;
    if (n === which) {
      const body = p.slice(i + 1, i + span);
      const c = body[0] === INDEX_SEL ? indexRgb(Number(body[1])) : body.slice(1).map(Number);
      return c != null && c.every((v) => Number.isInteger(v)) ? c : undefined;
    }
    i += span;
  }
  return undefined;
}

/**
 * The chip filling with a foreground's own colour, undefined where the sequence does not name its pixels (a
 * base-sixteen slot is whatever the THEME paints). One that already fills derives nothing: reading `chip`'s foreground
 * would hand back a BLACK band.
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
 * Every tag NAME the palette answers to. Names and never sequences: the values staying unexported is what stops a
 * second module growing its own opinion about a colour. The `cap` and `bg` forms are a RULE (`TAG_SUFFIXES`), not
 * entries, so a reader gets the rule rather than a list that could never be complete.
 */
export function tagNames(): string[] {
  return [...new Set([...Object.keys(TAGS), ...Object.keys(EXTENDED)])].sort();
}

/**
 * The names THIS VERSION defines, whatever a host later registered. What a GENERATED file may state, where `tagNames`
 * answers for one install and can only be read where that install is running.
 */
export function builtinTagNames(): string[] {
  return Object.keys(TAGS).sort();
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
 * engine later claimed a name the host already used. The LAST registration wins.
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
 * What a walk has stepped over and not yet closed, innermost LAST: tag names, and the span boundaries between them. A
 * boundary rides the same stack because the two interleave: what a resume unwinds is a RANGE of it.
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
 * The surface a span is drawn ON: the innermost open tag that FILLS, or undefined where the line stands on the terminal
 * itself. Innermost first, because a band inside a band is the one the reader actually sees.
 */
function surface(open: readonly string[]): string | undefined {
  for (let i = open.length - 1; i >= 0; i--) {
    const name = open[i];
    if (name === SPAN_MARK) continue;
    const seq = resolveTag(name);
    // capOf is what "this sequence fills" MEANS here, and asking it is what keeps a foreground from being read as one.
    if (seq === undefined || capOf(seq) === undefined) continue;
    return seq;
  }
  return undefined;
}

/**
 * A tag resolved WHERE it is written. `code` is the only name that needs it: it is the host's own value for the surface
 * underneath, and the surface is only knowable from the stack. A host that shadowed the name owns it outright.
 *
 * Two questions of the surface, not one. Its SIDE picks which of the host's two code colours to start from, and that
 * alone left every saturated band under 2:1 (violet at 1.24) because neither value was ever measured against the fill
 * it landed on. Its PIXELS then push that colour until it is legible, where they are knowable at all.
 */
function resolveOpen(name: string, open: readonly string[]): string | undefined {
  if (name !== CODE || Object.prototype.hasOwnProperty.call(EXTENDED, CODE)) return resolveTag(name);
  const seq = surface(open);
  const side = seq === undefined ? undefined : fillIsLight(seq);
  const base = (side ?? TERMINAL_IS_LIGHT) ? CODE_ON_LIGHT : CODE_ON_DARK;
  const fill = seq === undefined ? undefined : extRgb(seq, EXT_BG);
  const ink = fill === undefined ? undefined : extRgb(base, EXT_FG);
  // Unreadable pixels on either side leave the value alone: an `ansi` theme names a slot for its code colour, and half
  // the chips fill with one. Nothing to measure is nothing to correct, and a guess here would be the defect above.
  if (ink === undefined || fill === undefined) return base;
  const [r, g, b] = legibleOn(ink, fill);
  return rgb(r, g, b);
}

/**
 * The reset is not a formality: `dim` is an ATTRIBUTE, so re-emitting it over the foreground a code span set would
 * leave the code colour underneath.
 */
function resumeTags(open: string[]): string {
  popSpan(open);
  return open.reduce((seq, name) => seq + (resolveOpen(name, open) ?? ""), R);
}

/**
 * A CUT sealed so the row gets its style back: one resume ends a FRAME, so what is written is the number of frames left
 * half-open, never of entries. The cut opens one of its own, or the bare tags a value wrote would find no boundary and
 * unwind the ROW's tags with the cell's.
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
      return "";
    }
    // The alternation's discriminator: only the tag branch captures a name.
    if (name === undefined) return resumeTags(open);
    const seq = resolveOpen(name, open);
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
 * Fill the tone slot. All three stay TAGS, so a width measured before this ran still holds. Rewritten by split/join
 * rather than by a regex built from `cls`, which reaches this from a message.
 *
 * The SURFACE slots fall back to the neutral pill, and the foreground slot alone keeps the class. A chip is asked for
 * where a template needs pixels to draw on, and a class naming none (`b` is a weight, `box_title` a base-sixteen slot)
 * cannot supply them: sent to its own foreground, as they were, a band came out as two white half-circles around
 * nothing, which is the "edges of nothing" the palette warns about, drawn. The neutral is the palette's own answer for
 * a surface with no colour opinion, and it turns over with the terminal, so the band is a band on either screen.
 */
export function fillTone(s: string, cls: string | undefined): string {
  if (cls == null) return s;
  const bg = isTag(cls + BG) ? cls + BG : NEUTRAL_SURFACE + BG;
  const cap = isTag(cls + CAP) ? cls + CAP : NEUTRAL_SURFACE + CAP;
  return s
    .split(tagMark(TONE_CAP))
    .join(tagMark(cap))
    .split(tagMark(TONE_BG))
    .join(tagMark(bg))
    .split(tagMark(TONE))
    .join(tagMark(cls));
}

// The host shows the drawn message through its OWN markdown pass, so a literal backtick or star surviving the
// resolution is a delimiter there: the host eats the pair and restyles the text between, columns off the very rows the
// layout had squared, and it pairs stars ACROSS LINES, slanting whole stretches of a table (both measured 2026-08-11,
// Claude Code). Each lookalike keeps the glyph and says nothing to markdown, one column either way, so a width measured
// before the swap still holds. Only what survives as TEXT is swapped: a span's or a bold run's own delimiters are
// consumed before this runs, and the body a block falls through to never passes here.
export const INERT_TICK = "ˋ"; // MODIFIER LETTER GRAVE ACCENT
export const INERT_STAR = "∗"; // ASTERISK OPERATOR

const inertMarkdown = (s: string): string =>
  s.split(CODE_TICK).join(INERT_TICK).split(EMPHASIS_STAR).join(INERT_STAR);

/**
 * Code spans as MARKS. It runs BEFORE fillTone and renderTags, so the style a span interrupts is still an unresolved
 * mark here and, where it is the tone slot, not yet even a colour: the terminator cannot be a sequence.
 */
export function markCode(s: string): string {
  return inertMarkdown(overCode(s, (x) => `${spanOpen(CODE)}${x}${spanClose(CODE)}`));
}

/**
 * Code spans as SEQUENCES, for a host colouring its own line. Not `renderTags(markCode(s))`: that would make this a
 * second place where a `{{tag}}` in someone else's text turns into a colour.
 */
export function renderCode(s: string): string {
  const open = resolveTag(CODE) ?? "";
  return inertMarkdown(overCode(s, (x) => `${open}${x}${R}`));
}
