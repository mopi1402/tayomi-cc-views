// Terminal COLUMN width, which is not string length. Every frame, column and
// wrap in a rendered view is aligned on this number, and `.length` counts UTF-16
// code units, a quantity that diverges from what the terminal prints in three
// independent ways:
//   - an ideograph (你) is ONE code unit and prints TWO columns, so a line is
//     measured short, padded against the wrong total, and its border is pushed
//     past the frame;
//   - an emoji with default emoji presentation (✅, one code unit) prints two
//     columns for the same reason;
//   - a ZWJ sequence (👨‍💻, five code units; 🏳️‍🌈, six) prints two columns, so
//     here the measure OVER-counts and the border is pulled inside the frame.
// Measured on a real rendered block at a 95-column frame: +16 columns on a
// line of 16 ideographs, +1 on a line carrying one ✅, -10 on a line of three
// ZWJ emoji. A surrogate pair with no joiner (🟥) happens to come out right,
// two code units for two columns, which is why the defect looked intermittent.
//
// So the unit of measure is the GRAPHEME CLUSTER: one cluster is one thing the
// terminal draws, whatever its code-unit count. That is also the unit a wrap must
// never cut through, hence clusterMap below, used by the wrapper to atomize a
// line without splitting a surrogate pair or a joined sequence in half.
const SEGMENTER = new Intl.Segmenter("en", { granularity: "grapheme" });

// East Asian Wide and Fullwidth, the non-emoji half of the problem. Tabulated
// because JS has no \p{East_Asian_Width} property escape, unlike the emoji half:
// \p{Emoji_Presentation} is exactly the Unicode property for "renders as an emoji,
// and therefore two columns, without needing a variation selector", so the emoji
// ranges are NOT enumerated here. Enumerating them would be a denylist of forms,
// always presumed holed (ADR-0033); the property is the definition itself.
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo initial consonants
  [0x2329, 0x232a], // angle brackets
  [0x2e80, 0x303e], // CJK radicals, Kangxi, CJK symbols (includes U+3000 ideographic space)
  [0x3041, 0x33ff], // kana, Bopomofo, Hangul compat jamo, CJK compat
  [0x3400, 0x4dbf], // CJK ext A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xa000, 0xa4cf], // Yi
  [0xa960, 0xa97f], // Hangul Jamo ext A
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compat ideographs
  [0xfe10, 0xfe19], // vertical forms
  [0xfe30, 0xfe6f], // CJK compat forms, small form variants
  [0xff00, 0xff60], // fullwidth forms
  [0xffe0, 0xffe6], // fullwidth signs
  [0x17000, 0x18aff], // Tangut
  [0x1b000, 0x1b12f], // kana supplement and extended A
  [0x20000, 0x3fffd], // CJK ext B and beyond
];

const EMOJI_PRESENTATION = /^\p{Emoji_Presentation}$/u;

// A base character that prints nothing of its own: a combining mark (Mn), an
// enclosing mark (Me), or a format character such as a joiner or a variation
// selector (Cf). Counting these as one column each is what over-measures a
// composed cluster.
const ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cf}]$/u;

// The emoji variation selector. Anywhere in a cluster it is an explicit request
// for emoji presentation, which prints two columns even when the base character
// is narrow on its own (⚠ is one column, ⚠️ is two). Built from its char code, the
// same reason as HANG_MARK in marks.ts: an invisible character typed into this
// source does not survive an editing pass.
const VS16 = String.fromCharCode(0xfe0f);

export function clusterWidth(cluster: string): number {
  if (cluster.includes(VS16)) return 2;
  const cp = cluster.codePointAt(0);
  if (cp === undefined) return 0;
  if (cp >= 0x20 && cp < 0x7f) return 1; // ASCII printable, the overwhelming case
  if (cp < 0x20 || cp === 0x7f) return 0; // C0 controls print nothing (ESC included)
  const base = String.fromCodePoint(cp);
  if (ZERO_WIDTH.test(base)) return 0;
  if (EMOJI_PRESENTATION.test(base)) return 2;
  for (const [lo, hi] of WIDE_RANGES) if (cp >= lo && cp <= hi) return 2;
  return 1;
}

export function displayWidth(s: string): number {
  let w = 0;
  for (const { segment } of SEGMENTER.segment(s)) w += clusterWidth(segment);
  return w;
}

// Cluster boundaries of a string, as offset -> cluster. One segmentation pass, so
// a caller walking a line by index stays linear: Segmenter.containing() would
// re-scan from the start on every character.
export function clusterMap(s: string): Map<number, string> {
  const m = new Map<number, string>();
  for (const { segment, index } of SEGMENTER.segment(s)) m.set(index, segment);
  return m;
}
