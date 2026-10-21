// Which client shows what this hook answers. Only a terminal reads ANSI: Claude Desktop renders the answer as markdown,
// where every escape the engine writes shows as text (seen 2026-10-21), so there the engine draws nothing at all.

/** Claude Code's own name for the client that launched it, set in every child it spawns. */
export const ENTRYPOINT_ENV = "CLAUDE_CODE_ENTRYPOINT";

/** The entrypoints Claude Code itself groups as the desktop app, read off the 2.1.306 binary. */
const DESKTOP_ENTRYPOINTS: ReadonlySet<string> = new Set(["claude-desktop", "claude-desktop-3p", "local-agent"]);

/** False only for a client known to render markup: an absent or unknown entrypoint draws, as it always has. */
export function drawsAnsi(env: NodeJS.ProcessEnv = process.env): boolean {
  return !DESKTOP_ENTRYPOINTS.has(env[ENTRYPOINT_ENV] ?? "");
}
