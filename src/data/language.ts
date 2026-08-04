// The .view language's own vocabulary: every word an AUTHOR types in a template. Shared here because each has several
// readers that must agree on its spelling (docs/architecture/architecture.md, "The layer chain"), so renaming one, a MAJOR version,
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
export const USE = keyword("use");
export const END = keyword("end");

/**
 * The token that turns @box into a container with NO outline: the body machinery, none of the chrome. A word rather
 * than a second directive, because the two draw the same body and differ only in what they put around it.
 */
export const BARE = "bare";

/**
 * What points an included view at the FIELD holding its data, `@use banner from alert`. A field rather than the
 * caller's whole scope, because `banner` and `quote` both spend `content`.
 */
export const FROM = "from";

/**
 * The tokens an @aside may carry, saying where the SHORTER column sits against the taller one. Three readers must agree
 * on their spelling: the matcher that reads the declaration, the padding that acts on it, and the type that names the
 * set, so the words live here and the other two derive.
 *
 * A bare token is invisible to `check-vocabulary`, whose matcher only sees `@words`, and that is exactly why these
 * three drifted out here in the first place.
 */
export const ALIGN_CENTER = "center";
export const ALIGN_TOP = "top";
export const ALIGN_BOTTOM = "bottom";
export const ALIGNS = [ALIGN_CENTER, ALIGN_TOP, ALIGN_BOTTOM] as const;

/** The set as a TYPE, derived rather than retyped: a fourth alignment is one edit above. */
export type Align = (typeof ALIGNS)[number];

/** Whether a token an author wrote is one of them, so a near-miss stays a near-miss. */
export const isAlign = (token: string): token is Align => (ALIGNS as readonly string[]).includes(token);

/**
 * The fields a PAYLOAD yields, spent by these names in a template. Three readers must agree on them: the carrier that
 * builds the scope, the author who writes the slot, and the catalogue that derives which payload a view expects FROM
 * the slots it spends, which is the only way `banner` and `quote` can be classified at all since neither declares
 * `@fields` (having no list to split).
 */
export const FIELD_ROWS = "rows";
export const FIELD_LABEL = "label";
export const FIELD_CONTENT = "content";
export const FIELD_TYPE = "type";

/**
 * How many columns a table payload may carry. Two is markdown's smallest real table and the shape every view here was
 * written against; four is where a terminal line stops being readable, and a wider table fails open as the markdown it
 * already is.
 */
export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 4;

/**
 * The cells BETWEEN the first and the last, which keep their own names because the two ends are anchored: the first cell
 * is always `label` and the last always `content`, whatever the arity, so a template written for two columns keeps
 * meaning what it meant. Numbered from one, `mid1` then `mid2`.
 */
const MIDDLE_STEM = "mid";
export const middleField = (n: number): string => MIDDLE_STEM + String(n);

/** Every middle name the widest table can spend, so a reader never has to count them out. */
export const MIDDLE_FIELDS: readonly string[] = Array.from(
  { length: MAX_COLUMNS - MIN_COLUMNS },
  (_, i) => middleField(i + 1)
);

/** The field a block names a tone CLASS with, outranking its kind. Read with FIELD_TYPE wherever a tone is resolved. */
export const FIELD_TONE = "tone";

/** The payload shapes a decorator claims, named so a catalogue can say which one a view wants. */
export const PAYLOAD_TABLE = "table";
export const PAYLOAD_QUOTE = "quote";

/** Which shape yields which fields. Spending one of them is what says a view expects that payload. */
export const PAYLOAD_FIELDS: Record<string, readonly string[]> = {
  [PAYLOAD_TABLE]: [FIELD_ROWS, FIELD_LABEL, ...MIDDLE_FIELDS, FIELD_CONTENT],
  [PAYLOAD_QUOTE]: [FIELD_CONTENT, FIELD_TYPE],
};

/** A directive stripped of its `@`. Its closer derives from it, and so does the name of the region an opener opens. */
export const stem = (word: string): string => word.slice(AT.length);

/** A closing keyword is its opener's name behind `@end`. */
const closes = (open: string): string => END + stem(open);
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
 * The same marker as an author TYPES it, for a catalogue that cannot hand a regex to its reader. Written out rather
 * than derived, a pattern having no readable spelling, and the sidecar feeds this form to the matcher above so the two
 * cannot part company.
 */
export const MARKER_SLOT = "TOKEN";
export const MARKER_FORM = `[!${MARKER_SLOT}]`;

/**
 * What a template writes to reach the engine's own bookkeeping (scope.ts). Punctuation rather than names, so a block's
 * own field can never shadow one.
 */
const PSEUDO = "#";
export const ITEM_REF = ".";
export const INDEX_REF = PSEUDO;
export const LABEL_REF = PSEUDO + LABEL;
export const BULLET_REF = PSEUDO + BULLET;
