// WHO is drawing: the running engine's own name and number, the pair every reader of a version must agree on.
//
// Spelled here rather than read from package.json at runtime, because a consumer that BUNDLES this package resolves a
// runtime read relative to its own bundle and would answer with somebody else's version, silently.
// scripts/sync-version.mjs writes the number and scripts/check-skill.mjs gates it.

export const ENGINE_NAME = "@tayomi/cc-views";
export const ENGINE_VERSION = "2.3.3";

/** The one form a version is shown in, so a badge on screen and a `--version` on the command line compare by eye. */
export const engineBadge = (): string => `${ENGINE_NAME} v${ENGINE_VERSION}`;

/** Asked of BOTH binaries, and the hook edge answers it before it ever reaches for stdin. */
export const VERSION_FLAG = "--version";
