# Contributing

The engine draws INSIDE someone's terminal session, so the bar is: prove your change works before it ships, on your own machine, without publishing anything. This file is the map of the verification ladder, from the fast inner loop to a full dress rehearsal of `npm publish`.

## Which loop to use

Take the cheapest one that answers your question.

| You changed | Use | Loop |
| --- | --- | --- |
| a `.view` template | `CC_VIEWS_PATH` | edit, send a message |
| engine code, judged by a rule | `pnpm test` | seconds |
| engine code, judged by the screen | `sandbox/` linked | `pnpm build` |
| `files`, exports, bin | `pnpm verify:pack` | one pack |
| `skills/write-view` | a marketplace on this directory, [target 3](docs/contributing/manual-checks.md) | add, install, restart |
| the real TAYOMI plugin | Verdaccio, then the 4 steps below | slow, do it once |

## Setup

```bash
pnpm install
pnpm build            # tsc -> dist/
pnpm test             # vitest, the whole suite
pnpm lint
pnpm typecheck
pnpm check:sidecars   # every module answers for itself
pnpm check:vocabulary # every word of the language comes from src/data/
pnpm verify           # all of the above, then the pack gate
```

## The inner loop: render without any hook

You do not need Claude Code to see a view. `renderView` draws from a plain node script:

```bash
pnpm build && node -e "
const { renderView } = require('./dist/template/render.js');
console.log(renderView('welcome', {}, './views', undefined, { width: 74 }));
"
```

Point it at your own template dir and data to iterate on a `.view` or on the layout code, seconds per cycle.

To iterate on a template inside a real session, with no build at all, start Claude Code with your scratch dir first on the search path:

```bash
CC_VIEWS_PATH=/path/to/scratch-views claude
```

Edit the `.view`, send a message, see it. The hook is a new process each time and re-reads the file. Set the variable on the Claude Code session itself: that is the environment the hook inherits.

The test suite drives the same storeys (`transform`, `slice`, `handleMessageDisplay`) with parsed payloads, so most behaviour is provable here too: streaming included (the tests chunk messages flush by flush exactly the way the live dispatcher does).

## Where a test goes: the sidecar, and the gate that keeps it honest

`foo.ts` is answered by `foo.test.ts` beside it. The sidecar is where that module's OWN contract is written, so the day the contract changes the failure lands on the module and not three layers away. Coverage does not stand in for it: a suite driving the whole engine from the front door executes a module's lines without ever pinning its edges.

A module with no sidecar says why IN WRITING, in the exclusion table of `scripts/check-sidecars.mjs`, which `pnpm check:sidecars` gates. The gate bites both ways, or the table rots into a list of excuses: an entry naming a module that has since gained a test, or that no longer exists, fails too. A reason there is a decision; anything reading "not yet" belongs in the suite instead.

Two other kinds sit outside the rule. A suite answering for a PATH rather than a module lives in `tests/`, exempt by LOCATION so there is no allowlist to keep in step (`tests/integration/examples.test.ts` drives `examples/` through the real engine, so the front door's demo cannot rot). End to end is `scripts/verify-pack.mjs` alone, the only thing here that crosses a process.

## The other gate: a word of the language lives in one place

`pnpm check:vocabulary` refuses an `@word` spelled anywhere in `src/` outside `src/data/`, in a string, a template literal or a regex alike. Declare it in `language.ts` and compose the matcher from it (a scoped package specifier is the one `@` this rule lets through, told apart by its slash). Tests are exempt, deliberately: a fixture sharing its constant with the matcher it drives cannot catch a drift in it, so the words there are typed by hand.

It reads as a style rule and it is a correctness one. "Raw over hollow" refuses a render whose template resolved none of the data it was handed, decided on the reads `lookup` RECORDED, so a directive reading the scope without going through it is counted by nobody and its render is refused. What stops that is the sweep in `render.test.ts` driving every directive of the language, and that sweep reads the vocabulary to know what "every" means. A word typed straight into a matcher is invisible to that sweep and gets no case.

Two habits go with it. Tests typecheck like the rest of the code, so a fixture that no longer matches the shape it drives proves nothing (`tsconfig.json` includes them; `tsconfig.build.json` declares its own scope so none of them reach `dist`). And write the NEAR-MISS as well as the hit: every matcher here is built so a malformed line falls through to the body, where an author sees it printed, and a test fed only valid input cannot tell that apart from a matcher that swallows.

## The pack gate: `pnpm verify:pack`

Unit tests cannot catch a broken `files` whitelist, a mis-wired bin, or a resolution that only fails in an INSTALLED copy. The gate replays the README's minimal setup end to end, locally:

1. `npm pack`: the exact tarball `npm publish` would upload.
2. Asserts the files contract: `views/welcome.view` and the art its `@aside` names both ship; `docs/`, `examples/`, `src/` do not.
3. Installs the tarball in a throwaway project.
4. Feeds the INSTALLED bin one real MessageDisplay payload carrying a fenced `view:welcome` block, at TWO widths.
5. Requires the dressed box on the other side: frame, title, every section, no raw fence. Wide, one line must carry both an art cell and a section label (the two columns compose); narrow, the art must be dropped whole rather than shredded.

`prepublishOnly` chains `lint + typecheck + test + verify:pack`, so a real `npm publish` physically refuses to ship a red state.

## The eye test: `sandbox/`

`sandbox/` is a pre-wired Claude Code project, and the only storey that exercises the WIRING: `verify:pack` feeds the bin directly, so it can never catch a hook Claude Code declines to run. The whole recipe (setup, the prompt to type, how to read the verdict, what to check when nothing appears) lives in [docs/contributing/manual-checks.md](docs/contributing/manual-checks.md).

### Link the checkout instead of packing it every time

Do this once:

```bash
cd sandbox && npm install ..
```

npm symlinks a local path, so the sandbox now runs THIS working tree. The loop becomes `pnpm build` at the repo root, and the next message uses it. Only a change to `sandbox/.claude/settings.json` needs a restart.

A link does not prove the `files` whitelist or the `publishConfig` exports (it resolves the dev ones, pointing at `src/`). **Pack again before publishing.**

## The dress rehearsal: a local registry (Verdaccio)

When the change must be proven inside a REAL consumer (a plugin that installs the package from a registry), rehearse the entire publish/install chain locally:

```bash
npm install -g verdaccio
verdaccio &                                  # http://localhost:4873
npm adduser --registry http://localhost:4873 # first time only
```

Then, from this repo:

```bash
# 1. bump to a prerelease so nothing real is ever shadowed. The registry
#    REFUSES a version it already holds, so this is once per ITERATION:
#    `prerelease` walks rc.N to rc.N+1 on its own. The `version` hook writes
#    the number into the three files that cannot import it: the two
#    .claude-plugin/ manifests and the welcome box's badge.
#    A bare `pnpm version` commits and tags, which is what carries them;
#    --no-git-tag-version leaves them staged for you to commit.
pnpm version prerelease
# 2. publish with PNPM, not npm: pnpm is what applies publishConfig (npm
#    publish would ship the dev exports pointing at src/, which the tarball
#    does not carry). prepublishOnly runs `pnpm verify` on the way, so a red
#    state cannot reach the registry and dist/ is rebuilt before it is packed.
pnpm publish --registry http://localhost:4873 --access public --no-git-checks
```

And from the consumer, IN the workspace that declares the dependency. A monorepo root would take the dep on itself, leaving the workspace that actually imports the engine on the version it already had:

```bash
pnpm add @tayomi/cc-views@X.Y.Z-rc.N --registry http://localhost:4873
pnpm build   # installing is not enough: see the third trap
```

Three traps, learned the hard way:

- A prerelease (`-rc.N`) does not satisfy a `^X.Y.Z` range: pin it exactly in the consumer while testing.
- The consumer's lockfile now points at `localhost:4873`. Revert the dep and the lockfile to the public registry before committing the consumer.
- A consumer that BUNDLES the engine (esbuild) sees NOTHING of the new version until it rebuilds: the bundle still carries the old engine, and its `views/` still holds the old templates. Its build must re-copy the engine's `views/` after every install, which is what TAYOMI's `plugins/core` build ends on. See the bundling caveat in [docs/architecture/display-host.md](docs/architecture/display-host.md).

Getting a prerelease all the way onto the TAYOMI plugin's screen has its own four-step chain, in [docs/contributing/manual-checks.md](docs/contributing/manual-checks.md).

## House rules

- **Fail-open is the contract.** A failure shows the original text, never a blank, never a crash. Any change to a carrier or the pipeline must keep every fail-open test green, and a new failure mode ships with its fallback.
- **Evidence over claims.** A behaviour is what a test or a rendered output shows, not what the diff suggests. The two dated entries in [docs/caveats.md](docs/caveats.md) were confirmed by execution before being written down; keep that standard.
- **Docs move with the code.** A behaviour change lands with its update to [docs/architecture/view-language.md](docs/architecture/view-language.md), [docs/architecture/display-host.md](docs/architecture/display-host.md) and, if a guarantee moved, [docs/caveats.md](docs/caveats.md).
- **The transcript stays plain.** Nothing a template does may require the model to write colours, alignment, or anything but data.
