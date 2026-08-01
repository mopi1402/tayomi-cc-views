// The FORMS the engine recognises. Shared here because each has several readers;
// what a tag NAME means stays private to style.ts.

/**
 * The word the whole language is named on. Everything that spells it DERIVES from
 * here (the fence, the decorator token, the file extension, the directory, the env
 * vars), so renaming the language is one edit and no reader is left on the old word.
 */
export const VIEW = "view";
export const VIEWS = `${VIEW}s`;

export const TAG_OPEN = "{{";
export const TAG_CLOSE = "}}";

export const CODE_TICK = "`";

export const FENCE = "```";
/** What an opening fence starts with, and what ENGAGES the pipeline. */
export const BLOCK_HINT = `${FENCE}${VIEW}:`;

/**
 * Nothing shorter than `@{view:`: PowerShell writes `@{Name='x'}` and Perl writes
 * `@{$ref}`, so a bare `@{` would capture them.
 */
export const DECORATOR_HINT = `@{${VIEW}:`;
export const DECORATOR_CLOSE = "}";

/** A template file, and the directory a host keeps its templates in. */
export const VIEW_EXT = `.${VIEW}`;
export const VIEWS_DIR = VIEWS;

/** The operator-facing names, one prefix so they read as one family. */
const ENV_PREFIX = `CC_${VIEWS.toUpperCase()}_`;
export const VIEWS_PATH_ENV = `${ENV_PREFIX}PATH`;
export const WIDTH_ENV = `${ENV_PREFIX}WIDTH`;
export const SCRATCH_DIR = `cc-${VIEWS}`;
