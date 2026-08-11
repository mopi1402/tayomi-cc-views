// The publisher guard: this package publishes with pnpm or not at all. npm and pnpm build DIFFERENT
// tarballs from this tree: publishConfig swaps `exports` from the dev entry (./src/index.ts, kept out
// of the tarball) to the built one, and pnpm alone applies it, npm at no step (measured 2026-08-11:
// an npm-published 2.1.2 shipped the dev exports, importable by nobody, unpublished within the hour).
// verify-pack proves the PNPM tarball, so any other publisher ships an artefact nothing has gated.
//
// Wired FIRST in prepublishOnly, which every publisher honours before packing.

/** Set by the running tool's lifecycle to "<tool>/<version> ...". */
const AGENT_VAR = "npm_config_user_agent";
/** The one tool whose tarball is the gated one. */
const PUBLISHER = "pnpm/";

const agent = process.env[AGENT_VAR] ?? "";
if (!agent.startsWith(PUBLISHER)) {
  console.error(
    [
      `check-publisher: FAIL, this package publishes with pnpm alone (agent: ${JSON.stringify(agent)})`,
      "pnpm is what applies publishConfig.exports: a tarball published by anything else ships the",
      "dev exports, whose entry the tarball does not carry, and cannot be imported. Run: pnpm publish",
    ].join("\n")
  );
  process.exit(1);
}
console.log(`check-publisher: PASS (${agent.split(" ")[0]})`);
