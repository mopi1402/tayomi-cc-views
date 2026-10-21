// The .view language's own vocabulary: every word an AUTHOR types in a template. Shared here because each has several
// readers that must agree on its spelling, so renaming one, a MAJOR version, costs one edit.

const AT = "@";
const keyword = (name: string): string => AT + name;

export const MAP = keyword("map");
export const TEXT = keyword("text");
export const FIELDS = keyword("fields");
export const TONE = keyword("tone");
export const BOX = keyword("box");
// The ONE word: `@head` is the directive, `head` is the field it draws from inside a loop. Deriving both is what stops
// one being renamed without the other.
const HEAD_WORD = "head";
export const HEAD = keyword(HEAD_WORD);
export const RIGHT = keyword("right");
export const FOOT = keyword("foot");
export const FRAME = keyword("frame");
export const RULE = keyword("rule");
export const EACH = keyword("each");
export const ASIDE = keyword("aside");
export const USE = keyword("use");
export const END = keyword("end");
/**
 * The one word that changes what a BLOCK'S BODY IS. Every other view reads its body as the flat data format
 * (view-data.ts); a template declaring this one says "my body is a diagram source", and the body reaches it drawn, in
 * `content`, having been parsed by nobody here.
 */
export const DIAGRAM = keyword("diagram");
/** The same change for markdown: the body reaches the template DRAWN to its width, in `content` (src/markdown.ts). */
export const MARKDOWN = keyword("markdown");

/** The token that turns @box into a container with NO outline: the body machinery, none of the chrome. */
export const BARE = "bare";

/**
 * What points an included view at the FIELD holding its data, `@use banner from alert`. A field rather than the
 * caller's whole scope, because `banner` and `quote` both spend `content`.
 */
export const FROM = "from";

/**
 * Where the SHORTER column of an @aside sits against the taller one. Here rather than beside the matcher because a bare
 * token is invisible to `check-vocabulary`, whose matcher only sees `@words`, and that is why these three drifted.
 */
export const ALIGN_CENTER = "center";
export const ALIGN_TOP = "top";
export const ALIGN_BOTTOM = "bottom";
export const ALIGNS = [ALIGN_CENTER, ALIGN_TOP, ALIGN_BOTTOM] as const;

export type Align = (typeof ALIGNS)[number];

/** Whether a token an author wrote is one of them, so a near-miss stays a near-miss. */
export const isAlign = (token: string): token is Align => (ALIGNS as readonly string[]).includes(token);

/**
 * The fields a PAYLOAD yields. The catalogue derives which payload a view expects FROM the slots it spends, which is
 * the only way `banner` and `quote` can be classified at all since neither declares `@fields`.
 */
export const FIELD_ROWS = "rows";
export const FIELD_LABEL = "label";
export const FIELD_CONTENT = "content";
export const FIELD_TYPE = "type";

/** The same quote body with its line breaks spent as spaces: what a view drawing ONE band asks for instead. */
export const FIELD_FLOW = "flow";

/**
 * The row a table payload HEADS its list with. Absent when the header's cells are all blank, the form markdown forces
 * on a table that wants no header (`| | |`), and a template's `@head` line then draws nothing.
 */
export const FIELD_HEAD = HEAD_WORD;

/**
 * Two is markdown's smallest real table. Past four a table draws side by side only while it FITS and its view declares
 * every column, and otherwise folds each row into an entry, one `Header: value` line per cell (carrier/decorator.ts).
 */
export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 4;
/** The widest row a bundled template declares, side by side when it fits; any wider one always folds. */
export const WIDEST_COLUMNS = 8;

/**
 * The cells BETWEEN the first and the last, which keep their own names because the two ends are anchored: the first
 * cell is always `label` and the last always `content`, so a template written for two columns keeps meaning what it
 * meant. Numbered from one, `mid1` then `mid2`.
 */
const MIDDLE_STEM = "mid";
export const middleField = (n: number): string => MIDDLE_STEM + String(n);

export const MIDDLE_FIELDS: readonly string[] = Array.from(
  { length: WIDEST_COLUMNS - MIN_COLUMNS },
  (_, i) => middleField(i + 1)
);

/** The field a block names a tone CLASS with, outranking its kind. Read with FIELD_TYPE wherever a tone is resolved. */
export const FIELD_TONE = "tone";

export const PAYLOAD_TABLE = "table";
export const PAYLOAD_QUOTE = "quote";
/**
 * The third shape, and the one NEVER derived: a fence is claimed by a template declaring @diagram, nothing else, so it
 * stays out of PAYLOAD_FIELDS below and no view can score its way into one.
 */
export const PAYLOAD_FENCE = "fence";
/** A ```markdown fence: claimed by a template declaring @markdown, and like the diagram's never derived. */
export const PAYLOAD_MARKDOWN = "markdown";

/**
 * The view that draws no payload of its own: the two zones written under its decorator, side by side. The CARRIER reads
 * it by name, before any template loads, so the word lives here and nowhere else.
 */
export const SPLIT_VIEW = "split";
/**
 * The view that floats ONE zone and flows what the message writes after it into the column at its right, while it fits
 * under the zone's height. Read by name in the carrier, as the split is.
 */
export const ASIDE_VIEW = "aside";
/** How many zones a split lays side by side. */
export const SPLIT_SIDES = 2;
/** The view a split side takes when it carries no decorator of its own, by the shape it was written in. */
export const BARE_SIDE_VIEWS: Readonly<Record<string, string>> = {
  [PAYLOAD_FENCE]: "mermaid",
  [PAYLOAD_QUOTE]: "quote",
  [PAYLOAD_MARKDOWN]: "markdown",
};

/** Which shape yields which fields. Spending one of them is what says a view expects that payload. */
export const PAYLOAD_FIELDS: Record<string, readonly string[]> = {
  [PAYLOAD_TABLE]: [FIELD_ROWS, FIELD_HEAD, FIELD_LABEL, ...MIDDLE_FIELDS, FIELD_CONTENT],
  [PAYLOAD_QUOTE]: [FIELD_CONTENT, FIELD_FLOW, FIELD_TYPE],
};

/** A directive stripped of its `@`. Its closer derives from it, and so does the name of the region an opener opens. */
export const stem = (word: string): string => word.slice(AT.length);

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
 * The declarations an @each may carry. One table, so the matcher that READS a declaration, the scan that measures the
 * label column and the strip that decides whether anything is LEFT OVER cannot drift apart.
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
 * The same marker as an author TYPES it, for a catalogue that cannot hand a regex to its reader. The sidecar feeds this
 * form to the matcher above so the two cannot part company.
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

/** The hanging boundary, WRITTEN: for the line with no @each to carry one on a `bullet=`. */
const HANG = "hang";
export const HANG_REF = PSEUDO + HANG;

/** Where the fold starts painting. Before it the prefix is voided rather than blanked: spaces, and no style at all. */
const FOLD = "fold";
export const FOLD_REF = PSEUDO + FOLD;

/** The closing furniture. Drawn while the line fits; a line that FOLDS drops it and squares every row to the width. */
const TAIL = "tail";
export const TAIL_REF = PSEUDO + TAIL;

/** The running engine's badge. A view is READ, so a number typed into one names the file, never the code that drew it. */
const ENGINE = "engine";
export const ENGINE_REF = PSEUDO + ENGINE;
