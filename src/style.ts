// The ANSI vocabulary: the tag names a view may write, and the transforms that turn
// that markup into escape sequences.
//
// The LEAF of the display chain (style <- layout <- template <- carrier <- pipeline):
// it knows nothing about geometry, data, or templates. The palette itself stays
// private, so a tag name is only ever resolved through isTag and renderTags.

import { CODE_TICK, TAG_CLOSE, TAG_OPEN } from "./data/markup.js";
import { INERT_MARK, RESUME_MARK, SPAN_MARK, dropControl } from "./data/marks.js";

// Re-exported the way CODE_TICK already is: a span's two marks are written by this
// module and by the decorator's bold span, and walked by the cutter and the wrapper, so
// all four take the style vocabulary from one import rather than reaching into the data
// layer apiece.
export { CODE_TICK, RESUME_MARK, SPAN_MARK };

const ESC = "\x1b";
export const R = `${ESC}[0m`;

/**
 * The one tag name that is not a word, and the only one that CLOSES instead of opening.
 * Spelled once: the palette entry, the pattern that finds it, the mark a caller writes
 * and the rule that decides what a resume re-opens all compose from here.
 */
const RESET_NAME = "/";
/** The palette name the engine's own inline-code span opens on. */
const CODE = "code";

/** A colour named by its 256-palette INDEX, the one spelling whose pixels are fixed. */
const indexed = (n: number): string => `${ESC}[38;5;${n}m`;

// The base palette, every raw sequence written ONCE. The semantic tags below ALIAS
// these entries rather than repeat their sequences.
const BASE: Record<string, string> = {
  [RESET_NAME]: R,
  b: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  red: `${ESC}[1;31m`,
  green: `${ESC}[1;32m`,
  yellow: `${ESC}[1;33m`,
  // Blue and magenta carry no semantic alias: nothing in the engine reads a severity
  // into them, which is exactly what makes them the two a VIEW can spend freely. They
  // complete the base sixteen, and like the rest of that range they follow the user's
  // theme, where `orange`, `gold` and the greys are 256-indices that do not.
  blue: `${ESC}[1;34m`,
  magenta: `${ESC}[1;35m`,
  cyan: `${ESC}[1;36m`,
  // Named INDICES, which the theme does not repaint. Each is one line and one line only:
  // its chip and its cap both derive from the index, ink included, so a colour cannot
  // ship half-declared. What that costs is the flip side of what it buys, and it is the
  // same trade `code` already makes: an index is the same pixels under every theme.
  orange: indexed(208),
  gold: indexed(220),
  purple: indexed(141),
  violet: indexed(135),
  pink: indexed(211),
  teal: indexed(37),
  aqua: indexed(44),
  lime: indexed(154),
  brown: indexed(130),
  navy: indexed(25),
  salmon: indexed(209),
  mint: indexed(121),
  chip: `${ESC}[1;38;5;16;48;5;231m`,
};

// The filled chips, written ONCE and aliased by every name that paints that colour: a
// semantic one, a carrier's, and the plain colour itself. High severity reads as failure
// red, `warning` is the same chip as `warn`, and `yellow` is the same chip as both.
//
// EVERY colour a tone may name has one, which is a requirement and not a convenience. A
// template may spend the chip as a SURFACE rather than as an accent (banner.view fills a
// band with it and draws its caps against it), and a class with no chip leaves that
// template drawing the edges of something that is not there.
const RED_CHIP = `${ESC}[1;97;41m`;
const GREEN_CHIP = `${ESC}[1;30;42m`;
const YELLOW_CHIP = `${ESC}[1;30;43m`;
const CYAN_CHIP = `${ESC}[1;30;46m`;
// Blue and magenta are the two DARK fills of the base range, so their label is white
// where every light fill above takes black. Contrast is decided per chip, here, because
// nothing can derive it: a base-sixteen slot is whatever the user's theme says it is.
const BLUE_CHIP = `${ESC}[1;97;44m`;
const MAGENTA_CHIP = `${ESC}[1;97;45m`;
// The grey a WEIGHT fills with. `low` and `dim` are the bold attribute's opposite number
// rather than a colour, so nothing about them is measurable and this one is a decision.
const GREY_CHIP = `${ESC}[30;48;5;250m`;

// The NEUTRAL tone, aliased by `key` and by the tone slot: the slot defaulting to
// what `key` means is one decision, so it is one sequence.
const NEUTRAL = BASE.cyan;

// The tone slot's names, and the two suffixes that pair a tone with its chip and with
// the cap that matches it. The table below, resolveTag and fillTone must agree on what
// the slot is called, or a view spends a tag that no longer resolves.
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
  [CODE]: `${ESC}[38;2;177;185;249m`,
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
  low_bg: GREY_CHIP,
  // the carrier's names again, chip side
  warning_bg: YELLOW_CHIP,
  error_bg: RED_CHIP,
  success_bg: GREEN_CHIP,
  info_bg: CYAN_CHIP,
  // The BASE-SIXTEEN chips, the only ones a human still has to decide. A slot names a
  // slot, and what the terminal paints there is the user's theme, so the ink cannot be
  // measured the way an index's can. Every other colour's chip derives (chipOf), which
  // is why this list stops at the base range instead of covering the palette.
  red_bg: RED_CHIP,
  green_bg: GREEN_CHIP,
  yellow_bg: YELLOW_CHIP,
  blue_bg: BLUE_CHIP,
  magenta_bg: MAGENTA_CHIP,
  cyan_bg: CYAN_CHIP,
  key_bg: CYAN_CHIP,
  dim_bg: GREY_CHIP,
  // The white chip names ITSELF as its own fill. `chip` already carries a background,
  // so a band drawn with it filled before this line existed, but its cap fell back to
  // the whole sequence and painted a BLACK glyph inside the white box. Naming the chip
  // here is what lets the cap derive to the white the band actually shows.
  chip_bg: BASE.chip,
  title_bg: BASE.chip,
  // The TONE SLOT, the one set of tags whose colour a RENDER decides instead of the
  // template: a view spends the slot, a carrier names the class that fills it, and
  // that is what keeps a second colour from needing a second copy of a template.
  // Unfilled it holds the neutral, so a template may spend it with no carrier in
  // sight. What is left with no chip is FURNITURE (`code`, `box_rule`, a weight) and a
  // host's own foreground, hence the _bg fallback in fillTone.
  // The third name, `tone_cap`, is absent ON PURPOSE: every `_cap` is derived from the
  // `_bg` beside it (see capTag), including this one, and a copy written here is a copy
  // free to drift from the chip it exists to match.
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
/** The closing tag's name, escaped: a solidus is punctuation to a pattern. */
const CLOSE_SOURCE = `\\${RESET_NAME}`;
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
export const RESET_MARK = tagMark(RESET_NAME);

/**
 * The blank a filled chip puts on each side of its label, so the colour never
 * touches the text. The column measurer has to RESERVE what this spends, which is
 * why the width is derived here rather than counted at both ends.
 */
const CHIP_PAD = " ";
export const CHIP_CHROME = 2 * CHIP_PAD.length;

/**
 * A filled chip around a label the caller has already padded to its column.
 *
 * It closes on the RESUME mark: a chip is a span the engine inserted into a line whose
 * style it did not choose, so clearing at its right edge takes the rest of the line down
 * with it. The template author cannot compensate, having no idea where a `@map` will put
 * one.
 *
 * Its two ends come from spanOpen and spanClose, which is where that rule lives.
 */
export function chip(tag: string, label: string): string {
  return `${spanOpen(tag)}${CHIP_PAD}${label}${CHIP_PAD}${spanClose(tag)}`;
}

/**
 * How a span the ENGINE inserted BEGINS. The mark is what a resume unwinds back TO, so
 * it is not decoration on the opening tag: it is the only thing separating the span's
 * own frame from whatever the line had already opened around it.
 *
 * It is written even where spanClose answers with a reset, and that costs nothing: a
 * reset clears the whole stack, boundary included, so no frame is left standing.
 */
export function spanOpen(tag: string): string {
  return SPAN_MARK + tagMark(tag);
}

/**
 * How a span the ENGINE inserted TERMINATES, and the one place that decides it. Every
 * site writing one asks here, or the rule becomes three copies free to disagree, on a
 * question whose wrong answer is a colour and never an error.
 *
 * A resume closes exactly the tag its own span opened, so it is only right where that
 * opener is a name the palette answers for. A `@map` is free to hand a chip a word
 * nobody knows: the opener is then TEXT, it opened nothing, and a resume would close the
 * style the span is sitting IN. That span clears instead, which is what it did before
 * any of this existed.
 */
export function spanClose(tag: string): string {
  return isTag(tag) ? RESUME_MARK : RESET_MARK;
}

// Every brace in message data is followed by the inert mark, so the tag shape can no
// longer match while the value still measures as the text it prints. Every brace and
// not the pair, so an overlap (`{{{warn}}`) has no unmarked shape left in it.
//
// The reserved codes come OFF first, and both halves are the same rule: a message may
// not reach the control channel. A brace is broken because it must still print; a code
// prints nothing, so it is dropped.
export function inert(s: string): string {
  const b = TAG_OPEN[0];
  const text = dropControl(s);
  return text.includes(b) ? text.split(b).join(b + INERT_MARK) : text;
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

// The three spellings a background takes, and the arithmetic that turns each into the
// foreground painting the SAME colour: the base sixteen sit exactly ten above their
// foreground, and the extended forms differ only by their leading selector.
const BG_FIRST = 40;
const BG_LAST = 47;
const BG_BRIGHT_FIRST = 100;
const BG_BRIGHT_LAST = 107;
const BG_TO_FG = 10;
const EXT_BG = 48;
const EXT_FG = 38;
// How many parameters an extended colour spends, keyed by its selector and counting the
// selector itself: an index (`5;N`) or a truecolor triplet (`2;R;G;B`). A foreground is
// skipped over by the SAME table, or a `38;5;44` accent would be read as a cyan chip.
const INDEX_SEL = "5";
const RGB_SEL = "2";
const EXT_SPAN: Record<string, number> = { [INDEX_SEL]: 3, [RGB_SEL]: 5 };
const SGR = /^\x1b\[([0-9;]*)m$/;
const PARAM = ";";

/**
 * The foreground painting a chip's BACKGROUND colour, or undefined for a sequence that
 * fills nothing. The first background wins; every other parameter is skipped.
 *
 * This exists so a cap is never a second constant free to drift from the chip it is
 * supposed to match. `1;36` and `46` name the same palette entry and still do not agree
 * on screen: bold promotes a base-sixteen FOREGROUND to the bright slot, while nothing
 * promotes the background, so a bold tone against its own chip is off by one shade in
 * every theme that separates the two.
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

// The xterm-256 palette's own geometry, which is what makes an INDEX measurable: a
// 6x6x6 cube of fixed levels, then a 24-step grey ramp. The first sixteen are absent on
// purpose, they are the theme's own and no arithmetic reaches them.
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

// WCAG relative luminance, and the contrast ratio it feeds. Spelled out rather than
// approximated by "is the sum of the channels high", which calls a saturated blue light.
const CHANNEL_MAX = 255;
const SRGB_KNEE = 0.03928;
const SRGB_SLOPE = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_GAMMA = 2.4;
const LUMA = [0.2126, 0.7152, 0.0722];
const CONTRAST_FLOOR = 0.05;
const WHITE_LUMINANCE = 1;
/** The two inks a chip may write in: bold black, or bold white. */
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
 * The chip filling with a foreground's own colour, or undefined when the colour cannot
 * be MEASURED. This is the other half of capOf, and it closes the chain: a palette
 * declares one colour, and its chip and its cap both follow from it.
 *
 * Measurable means the sequence names its pixels: a 256 index (whose RGB the cube above
 * fixes) or truecolor. A base-sixteen slot names a slot, and what the terminal paints
 * there is the user's THEME, which this process cannot read, so the ink cannot be chosen
 * and the palette declares those chips by hand instead.
 *
 * A sequence that already fills is already a chip and derives nothing: `chip` writes
 * black on white, and reading its foreground would hand back a BLACK band.
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
 * `<class>_bg` and `<class>_cap`, derived on demand rather than held in the table, so no
 * pair can drift and a host that registers ONE colour gets all three names. The table
 * still wins where it declares a chip, which is how the base-sixteen colours keep the
 * ink a human chose for them.
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

/** The colour a `_bg` or a `_cap` belongs to, or undefined for a name that is neither. */
function baseOf(name: string): string | undefined {
  if (name.endsWith(CAP)) return name.slice(0, -CAP.length);
  if (name.endsWith(BG)) return name.slice(0, -BG.length);
  return undefined;
}

function resolveTag(name: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(EXTENDED, name)) return EXTENDED[name];
  // A chip BELONGS to its colour. A host that shadows the colour shadows the pair with
  // it, or a band renders in the very colour the host replaced: TAYOMI registers its own
  // `info` and the built-in `info_bg` would still paint the engine's cyan. The table
  // stays the fallback, so a host colour the engine cannot measure keeps its old chip
  // rather than losing the band.
  const base = baseOf(name);
  if (base != null && Object.prototype.hasOwnProperty.call(EXTENDED, base)) {
    const derived = derivedTag(name);
    if (derived !== undefined) return derived;
  }
  if (Object.prototype.hasOwnProperty.call(TAGS, name)) return TAGS[name];
  return derivedTag(name);
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

/**
 * What a walk has stepped over and not yet closed, innermost LAST: tag names, and the
 * span boundaries between them. ONE notion, read by the two walkers that need it and
 * copied by neither: renderTags, which replays it where an engine-inserted span ends,
 * and fitCell, which asks what its cut left open. The cutter kept a boolean of its own,
 * which could say WHETHER a style was open and never WHICH, and a resume needs the second.
 *
 * A boundary rides the same stack rather than a second one, because the two interleave:
 * what a resume must unwind is a RANGE of this stack, not a count of either kind.
 *
 * A stack in the RESOLVER, never in the language. `{{/}}` closes every one of them, so
 * an author writing `{{a}}{{b}}x{{/}}` gains no nesting and renders the bytes it always
 * did. Depth passes one only where the ENGINE opened a span inside an author's tag,
 * which is the whole subject of the two span marks.
 */
export function trackTag(open: string[], name: string): void {
  if (name === RESET_NAME) open.length = 0;
  else open.push(name);
}

/**
 * What a resume ends: the FRAME its span opened, never one entry. Everything pushed
 * since the boundary comes off, the span's own tag and whatever its BODY opened on top
 * of it, so what is left is exactly what stood OUTSIDE the span.
 *
 * With no boundary on the stack the frame is the whole stack, which is a resume reaching
 * a line no span of the engine's had opened.
 */
export function popSpan(open: string[]): void {
  while (open.length > 0) {
    if (open.pop() === SPAN_MARK) return;
  }
}

/**
 * What a resume becomes: its frame closed, and everything still open under it re-opened.
 * The reset is not a formality: `dim` is an ATTRIBUTE, so re-emitting it over the
 * foreground a code span set would leave the code colour standing underneath.
 *
 * A boundary left under the frame belongs to a span still open (they nest: a chip's
 * label can carry a code span), and it replays as nothing, since no palette entry is
 * reachable under a name the tag shape cannot spell.
 *
 * Nothing open resolves to a PLAIN RESET, which is what makes a span outside any styled
 * region render exactly as it did before these marks existed, and that is the case the
 * whole existing corpus is made of.
 */
function resumeTags(open: string[]): string {
  popSpan(open);
  return open.reduce((seq, name) => seq + (resolveTag(name) ?? ""), R);
}

/**
 * A CUT sealed so the row gets its style back, derived from the pop rule above rather
 * than counting the stack: one resume ends a frame, so the number to write is the number
 * of frames the cut left half-open and never the number of entries.
 *
 * The cut opens a frame of its OWN, and that is the whole point. The bare tags a value
 * wrote belong to no span, so the resume closing them would find no boundary and unwind
 * the ROW's tags along with the cell's, which is the colour the template opened around
 * the cell. A value that opened nothing is handed back untouched, marks and all absent.
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

// One matcher over all three shapes, composed from the tag pattern: separate passes
// would disagree about which of a tag and a span mark came first on the line.
// eslint-disable-next-line security/detect-non-literal-regexp
const MARKUP_RE = new RegExp(`${TAG_PATTERN}|${RESUME_MARK}|${SPAN_MARK}`, "g");

export function renderTags(s: string): string {
  const open: string[] = [];
  return s.replace(MARKUP_RE, (m: string, name?: string) => {
    // A boundary prints nothing and is CONSUMED here, the last pass before the screen.
    if (m === SPAN_MARK) {
      trackTag(open, m);
      return "";
    }
    // The alternation's discriminator: only the tag branch captures a name.
    if (name === undefined) return resumeTags(open);
    const seq = resolveTag(name);
    // An unknown name reaches the screen as text, so it opens nothing either.
    if (seq === undefined) return m;
    trackTag(open, name);
    return seq;
  });
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
 * Fill the tone slot: {{tone}}, {{tone_bg}} and {{tone_cap}} become `cls`, its chip and
 * the foreground matching that chip. All three stay TAGS whatever happens, so a width
 * measured before this ran still holds.
 *
 * A class with no filled variant spends its foreground instead: dimmer than the author
 * asked for, never a hole on screen. Its cap takes the same road and lands on the same
 * colour, so the two still agree. Every colour a tone may name now HAS a chip, which
 * leaves this path to furniture (`code`, `box_rule`) and to a host's own tag: a template
 * spending the chip as a surface degenerates there, and only there.
 * Rewritten by split/join rather than by a regex built from `cls`, which reaches this
 * from a message.
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
 * Code spans as MARKS, which is what the render chain spends. It runs BEFORE fillTone
 * and renderTags (template/render.ts), so the style a span interrupts is still an
 * unresolved mark here and, where it is the tone slot, not yet even a colour: the
 * terminator cannot be a sequence and has to be resolved at the end, with the rest.
 */
export function markCode(s: string): string {
  return s.replace(CODE_RE, (_m: string, x: string) => `${spanOpen(CODE)}${x}${spanClose(CODE)}`);
}

/**
 * Code spans as SEQUENCES, for a host colouring a line of its own. SELF-CONTAINED, and
 * deliberately not `renderTags(markCode(s))`: a host's line carries no marks for a
 * resume to land on, and resolving one would make this a second place where a `{{tag}}`
 * in someone else's text turns into a colour. It opens on the palette's `code`, so a
 * host that registered its own now gets it here too, and closes on a plain reset, which
 * is what a resume outside any styled region resolves to anyway.
 */
export function renderCode(s: string): string {
  const open = resolveTag(CODE) ?? "";
  return s.replace(CODE_RE, (_m: string, x: string) => `${open}${x}${R}`);
}
