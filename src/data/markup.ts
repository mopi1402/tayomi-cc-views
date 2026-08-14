// The FORMS the engine recognises. Shared here because each has several readers; what a tag NAME means stays private to
// style.ts.

/**
 * The word the whole language is named on. Everything that spells it DERIVES from here (the fence, the decorator token,
 * the file extension, the directory, the env vars), so renaming the language is one edit and no reader is left on the
 * old word.
 */
export const VIEW = "view";
export const VIEWS = `${VIEW}s`;

/**
 * What parts a NAME from what it holds, everywhere the surface has that shape: the fence's info string, a decorator's
 * attribute, and a pair of the data block. One token, so the matchers and the form a catalogue states cannot drift.
 */
export const NAME_MARK = ":";

/**
 * The rest of the data block's own shapes: what marks an item of a list, and the INDENT that makes a pair belong to the
 * key above rather than to the block. Two readers each, the parser and the catalogue that publishes the form.
 */
export const ITEM_MARK = "-";
export const NEST_INDENT = "  ";

/** What a decorator's payload is told apart by, on its FIRST line and nothing else: a table, or a blockquote. */
export const TABLE_MARK = "|";
export const QUOTE_MARK = ">";

/**
 * One line ending, and the pair every reader of a whole message flattens at its OWN entry (split CRLF, join NL): the
 * pipeline and the zone reader must read the same bytes, or a gate parts from the screen on every CRLF transcript.
 */
export const NL = "\n";
export const CRLF = `\r${NL}`;

export const TAG_OPEN = "{{";
export const TAG_CLOSE = "}}";

export const CODE_TICK = "`";

/** Markdown's emphasis character: what the decorator's bold matcher spends, and what no drawn line may carry as text. */
export const EMPHASIS_STAR = "*";

export const FENCE = "```";
/**
 * The INFO STRING marking a fence as this engine's own carrier rather than an ordinary code block. It is what tells the
 * fence scanner which fences to shield and which one to hand to the block carrier, so the two readings cannot drift.
 */
export const BLOCK_INFO = `${VIEW}${NAME_MARK}`;
/** What an opening fence starts with, and what ENGAGES the pipeline. */
export const BLOCK_HINT = `${FENCE}${BLOCK_INFO}`;

/**
 * The info string of the ONE ordinary fence a decorator may claim as its payload: a diagram source. It is the word the
 * forges already draw, and that is the point: where the hook does not run, the fallback is a diagram that renders
 * itself, which no other carrier of this language can promise.
 */
export const DIAGRAM_INFO = "mermaid";

/**
 * Nothing shorter than `@{view:`: PowerShell writes `@{Name='x'}` and Perl writes `@{$ref}`, so a bare `@{` would
 * capture them.
 */
export const DECORATOR_HINT = `@{${BLOCK_INFO}`;
export const DECORATOR_CLOSE = "}";

/** A template file, and the directory a host keeps its templates in. */
export const VIEW_EXT = `.${VIEW}`;
export const VIEWS_DIR = VIEWS;

/** The operator-facing names, one prefix so they read as one family. */
const ENV_PREFIX = `CC_${VIEWS.toUpperCase()}_`;
export const VIEWS_PATH_ENV = `${ENV_PREFIX}PATH`;
export const WIDTH_ENV = `${ENV_PREFIX}WIDTH`;
export const THEME_ENV = `${ENV_PREFIX}THEME`;
/** Names one of the diagram renderer's own themes; empty or absent draws unpainted, which stays the default. */
export const MERMAID_THEME_ENV = `${ENV_PREFIX}MERMAID_THEME`;
/** Set to anything and this engine draws whatever else is registered. Off means DRAW, so the hatch cannot cause a silence. */
export const NO_YIELD_ENV = `${ENV_PREFIX}NO_YIELD`;
/** Where the election register lives, instead of the machine-wide directory: a harness's engines elect among themselves. */
export const ENGINES_DIR_ENV = `${ENV_PREFIX}ENGINES_DIR`;
/** Set to anything and the engine journals every flush under the register; absent, the recorder stays silent. */
export const DEBUG_ENV = `${ENV_PREFIX}DEBUG`;
export const SCRATCH_DIR = `cc-${VIEWS}`;
/** Where the engines registered on this machine announce themselves, one file each. */
export const ENGINES_DIR = "engines";
/** Under the register, one roster directory per SESSION: the fleet a session elects from, torn down with it. */
export const SESSIONS_DIR = "sessions";
