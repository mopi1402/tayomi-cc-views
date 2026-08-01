// The .view language's own vocabulary: every word an AUTHOR types in a template.
//
// Shared here because each word has several readers that must agree on its spelling.
// A directive is matched in template/directives.ts, declared in template/parse.ts,
// referred to by the layout it drives, and typed out in the fixtures the tests write.
// Renaming one is a MAJOR version, and it should cost one edit here, not a sweep.

const AT = "@";
const keyword = (name: string): string => AT + name;

export const MAP = keyword("map");
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

/** What separates a key from its value in an @map pair or an @frame pair. */
export const PAIR_SEP = "=";

/**
 * What separates the TOKENS in a directive's tail: an @map's pairs, an @fields' names,
 * an @frame's pairs. Any run of whitespace, so a template may align its declarations
 * in columns and still parse.
 */
export const TOKEN_SEP = /\s+/;

/**
 * The declarations an @each may carry, with the value shape each accepts. One table,
 * so the matcher that READS a declaration, the scan that measures the label column and
 * the strip that decides whether anything is LEFT OVER cannot drift apart.
 */
export const LABEL = "label";
export const BULLET = "bullet";
export const CAP = "cap";
const QUOTED = String.raw`"([^"]*)"`;
const FRACTION = String.raw`"(\d+)\/([1-9]\d*)"`;
export const DECLS: Record<string, string> = {
  [LABEL]: QUOTED,
  [BULLET]: QUOTED,
  [CAP]: FRACTION,
};

/** One declaration, as it appears after an @each's field. */
export const declSource = (name: string): string => String.raw`[ \t]${name}${PAIR_SEP}${DECLS[name]}`;

/**
 * What a template writes to reach the engine's own bookkeeping (scope.ts). Punctuation
 * rather than names, so a block's own field can never shadow one.
 */
const PSEUDO = "#";
export const ITEM_REF = ".";
export const INDEX_REF = PSEUDO;
export const LABEL_REF = PSEUDO + LABEL;
export const BULLET_REF = PSEUDO + BULLET;
