// The .view language's own vocabulary: every word an AUTHOR types in a template. Shared here because each has several
// readers that must agree on its spelling (docs/architecture.md, "The layer chain"), so renaming one, a MAJOR version,
// costs one edit.

const AT = "@";
const keyword = (name: string): string => AT + name;

export const MAP = keyword("map");
export const TEXT = keyword("text");
export const FIELDS = keyword("fields");
export const TONE = keyword("tone");
export const BOX = keyword("box");
export const HEAD = keyword("head");
export const RIGHT = keyword("right");
export const FOOT = keyword("foot");
export const FRAME = keyword("frame");
export const RULE = keyword("rule");
export const EACH = keyword("each");
export const ASIDE = keyword("aside");
export const END = keyword("end");

/** A closing keyword is its opener's name behind `@end`. */
const closes = (open: string): string => END + open.slice(AT.length);
export const ENDBOX = closes(BOX);
export const ENDASIDE = closes(ASIDE);

/** What separates a key from its value in an @map pair, an @frame pair or an @text pair. */
export const PAIR_SEP = "=";

/** The entry a lookup table reserves for a value that never arrived. Punctuation: `default` is a plausible enum value. */
export const DEFAULT_KEY = "*";

/** Any run of whitespace, so a template may align its declarations in columns and still parse. */
export const TOKEN_SEP = /\s+/;

/**
 * The declarations an @each may carry, with the value shape each accepts. One table, so the matcher that READS a
 * declaration, the scan that measures the label column and the strip that decides whether anything is LEFT OVER cannot
 * drift apart.
 */
export const LABEL = "label";
export const BULLET = "bullet";
export const CAP = "cap";
export const QUOTED = String.raw`"([^"]*)"`;
const FRACTION = String.raw`"(\d+)\/([1-9]\d*)"`;
export const DECLS: Record<string, string> = {
  [LABEL]: QUOTED,
  [BULLET]: QUOTED,
  [CAP]: FRACTION,
};

/** One declaration, as it appears after an @each's field. */
export const declSource = (name: string): string => String.raw`[ \t]${name}${PAIR_SEP}${DECLS[name]}`;

/**
 * One `<key>="<value>"` pair of an @text table. QUOTED where @map's pairs are not: a tag name has no space in it, so
 * @map splits its tail on whitespace, while reusing that splitter here would cut `"⚠ WARNING"` at its first space.
 */
export const TEXT_PAIR = String.raw`([^\s${PAIR_SEP}]+)${PAIR_SEP}${QUOTED}`;

/**
 * The KIND marker a decorated blockquote may open with, `[!WARNING]`. ONE uppercase run, and the narrowness is the
 * point: the moment a space is legal, `[!THE BUILD FAILED ON NODE 20]` is the same shape and the marker has become the
 * label slot a template's table exists to remove. Anything wider stays the first line of the content.
 */
export const MARKER_TOKEN = String.raw`[A-Z][A-Z0-9_-]*`;
export const MARKER_SOURCE = String.raw`\[!(${MARKER_TOKEN})\]`;

/**
 * What a template writes to reach the engine's own bookkeeping (scope.ts). Punctuation rather than names, so a block's
 * own field can never shadow one.
 */
const PSEUDO = "#";
export const ITEM_REF = ".";
export const INDEX_REF = PSEUDO;
export const LABEL_REF = PSEUDO + LABEL;
export const BULLET_REF = PSEUDO + BULLET;
