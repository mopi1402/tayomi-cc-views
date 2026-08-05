// Terminal COLUMN width, which is not string length. `.length` counts UTF-16 code units, and that diverges from what
// the terminal prints in two directions: an ideograph (你) or a default-presentation emoji (✅) is one code unit and
// prints TWO columns, so the line measures short and its border is pushed past the frame; a ZWJ sequence (👨‍💻, five code
// units) prints two, so the measure OVER-counts and the border is pulled inside.
//
// So the unit is the GRAPHEME CLUSTER: one cluster is one thing the terminal draws. It is also the unit a wrap must
// never cut through, hence clusterMap below.
const SEGMENTER = new Intl.Segmenter("en", { granularity: "grapheme" });

// East Asian Wide and Fullwidth, the non-emoji half. Tabulated because JS has no \p{East_Asian_Width} escape, unlike
// \p{Emoji_Presentation}, which is exactly the property for "renders as an emoji, and therefore two columns".
// Enumerating the emoji ranges too would be a denylist of forms, always presumed holed (ADR-0033).
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

// A base character that prints nothing of its own: a combining mark (Mn), an enclosing mark (Me), or a format character
// such as a joiner or a variation selector (Cf). Counting these as one column each is what over-measures a composed
// cluster.
const ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cf}]$/u;

// The emoji variation selector. Anywhere in a cluster it is an explicit request for emoji presentation, two columns
// even when the base is narrow on its own (⚠ is one, ⚠️ is two). Built from its char code: an invisible character typed
// into this source does not survive an editing pass.
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

// Cluster boundaries as offset -> cluster. One segmentation pass, so a caller walking a line by index stays linear:
// Segmenter.containing() would re-scan from the start each time.
export function clusterMap(s: string): Map<number, string> {
  const m = new Map<number, string>();
  for (const { segment, index } of SEGMENTER.segment(s)) m.set(index, segment);
  return m;
}
