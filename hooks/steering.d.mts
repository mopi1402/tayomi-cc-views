// The types for the hook beside this file, which is plain JavaScript on purpose (see its header: a plugin
// copy holds no dist/ and no node_modules/). Written by hand rather than emitted, because nothing compiles
// that file: this is what lets the suite in tests/ drive it under the same typecheck as the rest.

/**
 * The hook's answer for a plugin rooted at `root`, as the JSON Claude Code reads, or null when there is
 * nothing to say. `env` is the opt-out's only input, defaulted to the process's own so a real run needs it
 * as little as the suite needs the process.
 */
export function steeringPayload(root: string, env?: NodeJS.ProcessEnv): string | null;

/** This file's own plugin root: it lives in `hooks/`, one hop under it. */
export function pluginRoot(): string;
