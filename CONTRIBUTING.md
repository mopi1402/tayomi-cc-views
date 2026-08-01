# Contributing

The engine draws INSIDE someone's terminal session, so the bar is: prove your
change works before it ships, on your own machine, without publishing anything.
This file is the map of the verification ladder, from the fast inner loop to a
full dress rehearsal of `npm publish`.

## Setup

```bash
pnpm install
pnpm build        # tsc -> dist/
pnpm test         # vitest, the whole suite
pnpm lint
pnpm typecheck
```

## The inner loop: render without any hook

You do not need Claude Code to see a view. `renderView` draws from a plain
node script:

```bash
pnpm build && node -e "
const { renderView } = require('./dist/template/render.js');
console.log(renderView('welcome', {}, './views', undefined, { width: 74 }));
"
```

Point it at your own template dir and data to iterate on a `.view` or on the
layout code, seconds per cycle. The test suite drives the same storeys
(`transform`, `slice`, `handleMessageDisplay`) with parsed payloads, so most
behaviour is provable here too: streaming included (the tests chunk messages
flush by flush exactly the way the live dispatcher does).

## The pack gate: `pnpm verify:pack`

Unit tests cannot catch a broken `files` whitelist, a mis-wired bin, or a
resolution that only fails in an INSTALLED copy. The gate replays the README's
minimal setup end to end, locally:

1. `npm pack`: the exact tarball `npm publish` would upload.
2. Asserts the files contract: `views/welcome.view` ships; `docs/`,
   `examples/`, `src/` do not.
3. Installs the tarball in a throwaway project.
4. Feeds the INSTALLED bin one real MessageDisplay payload carrying the
   welcome decorator.
5. Requires the dressed box on the other side: frame, title, no raw line.

`prepublishOnly` chains `lint + typecheck + test + verify:pack`, so a real
`npm publish` physically refuses to ship a red state.

## The eye test: `sandbox/`

The one thing no script can judge is the screen itself. `sandbox/` is a
pre-wired Claude Code project:

```bash
pnpm build && npm pack --pack-destination sandbox
cd sandbox && npm install ./tayomi-cc-views-*.tgz
```

Open Claude Code in `sandbox/` and paste the prompt from
[sandbox/README.md](sandbox/README.md). The `eyetest` view it asks for is static
and NAMES ITS OWN ORIGIN on screen, which is what makes the verdict readable: a
user-scoped plugin's MessageDisplay hook fires in that folder too, so a box drawn
from a view both engines carry would prove nothing. `Ctrl+O` (`Cmd+O` on macOS)
shows the raw transcript, one plain line, which is the whole zero-pollution
contract made visible.

This storey is the only one that exercises the WIRING, and it earns its keep:
`verify:pack` feeds the bin directly, so it can never catch a hook that Claude
Code declines to run. On 2026-07-31 this folder caught exactly that, on the
wiring the README recommended: a bare relative command path is not resolved, the
hook never fires, and nothing on screen says so. Hook commands take
`${CLAUDE_PROJECT_DIR}/...` (or `${CLAUDE_PLUGIN_ROOT}/...` in a plugin). If the
box does not appear, check the path before suspecting the engine, and use
`/hooks` and `claude --debug` to see what actually fired.

## The dress rehearsal: a local registry (Verdaccio)

When the change must be proven inside a REAL consumer (a plugin that installs
the package from a registry), rehearse the entire publish/install chain
locally:

```bash
npm install -g verdaccio
verdaccio &                                  # http://localhost:4873
npm adduser --registry http://localhost:4873 # first time only
```

Then, from this repo:

```bash
# 1. bump to a prerelease so nothing real is ever shadowed
#    (package.json: "version": "X.Y.Z-rc.N")
# 2. publish with PNPM, not npm: pnpm is what applies publishConfig
#    (npm publish would ship the dev exports pointing at src/, which the
#    tarball does not carry)
pnpm publish --registry http://localhost:4873 --access public --no-git-checks
```

And from the consumer:

```bash
pnpm add @tayomi/cc-views@X.Y.Z-rc.N --registry http://localhost:4873
```

Two traps, learned the hard way:

- A prerelease (`-rc.N`) does not satisfy a `^X.Y.Z` range: pin it exactly in
  the consumer while testing.
- The consumer's lockfile now points at `localhost:4873`. Revert the dep and
  the lockfile to the public registry before committing the consumer.
- A consumer that BUNDLES the engine (esbuild) must re-copy the engine's
  `views/` after every install: see the bundling caveat in
  [docs/display-host.md](docs/display-host.md).

## House rules

- **Fail-open is the contract.** A failure shows the original text, never a
  blank, never a crash. Any change to a carrier or the pipeline must keep
  every fail-open test green, and a new failure mode ships with its fallback.
- **Evidence over claims.** A behaviour is what a test or a rendered output
  shows, not what the diff suggests. The two dated entries in
  [docs/caveats.md](docs/caveats.md) were confirmed by execution before being
  written down; keep that standard.
- **Docs move with the code.** A behaviour change lands with its update to
  [docs/view-language.md](docs/view-language.md),
  [docs/display-host.md](docs/display-host.md) and, if a guarantee moved,
  [docs/caveats.md](docs/caveats.md).
- **The transcript stays plain.** Nothing a template does may require the
  model to write colours, alignment, or anything but data.
