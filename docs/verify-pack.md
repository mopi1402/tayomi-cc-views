# Eye-test the packed package before publishing

The automated gate is `pnpm verify:pack`, run from the repo root. This is its human
twin: the README's minimal setup played for real inside Claude Code, against the
tarball rather than against the source tree.

It lives in `sandbox/`, a folder that is gitignored in full. The recipe lives HERE, in
the repo, because the folder is disposable and this is not: one `git clean` and the
setup goes, which is fine, but the knowledge below must not go with it.

## Never write code from that folder

A session opened IN `sandbox/` gets no TAYOMI gate. Shiki resolves `.tayomi/` from the
directory it is handed, finds the residual one the folder acquires, and holds no
contract, so nothing is judged and nothing says so. The absence is silent, which is
what makes it a trap: source edited from there ships ungated. Every change to the
engine belongs to a session opened at the repo root.

## Setup

```bash
# from the repo root
pnpm build && npm pack --pack-destination sandbox
cd sandbox && npm install ./tayomi-cc-views-*.tgz
```

Then open Claude Code IN THAT FOLDER (the hook is wired in its
`.claude/settings.json`) and ask the agent:

> Answer me "@{view:eyetest, tone:gold}", nothing else.

Read the screen, and the box tells you the verdict itself:

| What you see | What it means |
| --- | --- |
| A gold box naming `sandbox/node_modules` | The TARBALL drew it. Good to publish. |
| The raw decorator line | No hook ran, or an engine that lacks this view won the message. Check the hook path below. |
| A literal `@tone` line, or a visible tag name | An engine too old for the tone slot drew it. |

Press `Ctrl+O` (`Cmd+O` on macOS) to see the raw transcript: the model wrote one plain
line, nothing more.

## Why `eyetest` and not any view

Because **no plugin ships a file by that name**, and because the render names its own
origin. A MessageDisplay hook from a USER-scoped plugin fires in that folder too, and
both hooks take effect on the same message (observed 2026-07-31: a decorated table came
from the tarball's engine while a `view:tldr` block on the same screen was drawn by the
plugin's). A coloured box from a view BOTH of them carry proves nothing about this
tarball.

The hooks CHAIN (the second receives the first's output), and for one zone the FIRST to
run wins: it consumes the decorator or the fence, so the second finds nothing left to
render there. Since the order is not yours to choose, a view both engines carry can
legitimately come out looking two different ways from one identical message. Measured
2026-07-31, both orders, streaming included: no duplication, no truncation.

One crossover used to matter and no longer does: an engine once resolved the tags it
knew ANYWHERE in a message, so chained, the second picked up markers the first left
behind. Since 2026-08-01 a tag resolves only inside a view its own engine rendered, and
the zone is consumed by whichever ran first, so there is nothing left to pick up.

## When the verdict is a raw line

Check the hook's command path before anything else: it must be an ABSOLUTE path through
`${CLAUDE_PROJECT_DIR}`. A bare relative path is not resolved, and the hook then never
runs, with nothing on screen to say so. That is what this eye test caught on
2026-07-31, on the wiring the root README itself was recommending, and it is the whole
reason the human twin of `verify:pack` exists: the gate feeds the bin directly and can
never see the hook.

## What lives in the folder

`views/` holds the eye tests that need a template:

- `eyetest.view`: the self-identifying box above, static, no data to improvise.
- `table.view` and `alert.view`: the tone slot spent for real, one file per view
  covering every kind (`@{view:table}`, `@{view:table, type:warning}`,
  `@{view:table tone:gold}`, and `type:` on a `view:alert` block driving its border and
  its badge).
- `banner.view`: ONE line, full-colour background, rounded Powerline caps
  (U+E0B6/U+E0B4, font-dependent). Decorator-carried, one table row per band:
  `@{view:banner, type:warning}` + `| ⚠ WARNING | the message |`.
- `checks.view`, `findings.view`, `plan.view`, `commit.view`, `compare.view`:
  prototypes of a standard library, each file's header comment says what it is for and
  (for `compare`) the exact block that summons it. To eye-test one, ask the agent to
  report something real through it, e.g. "run pnpm test and report through a
  ```view:checks block". `compare` rides the DECORATOR (a plain markdown table), the
  other four ride fenced blocks.

A second, complementary ask is `@{view:welcome}`: that view ships INSIDE the tarball, so
it proves the packaged `views/` resolve from an installed copy. Read its verdict knowing
a plugin may carry a `welcome.view` of its own.

Everything else there is disposable: `node_modules/`, the `.tgz`, any lockfile, any
`*.ansi` dump.
