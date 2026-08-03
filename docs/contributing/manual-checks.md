# Manual checks: seeing your change on a real screen

For contributors only. If you are using the engine rather than changing it, you do not need this file.

`pnpm verify:pack` covers everything a machine can check. It feeds the packaged binary directly, so it never goes through Claude Code: it can never tell you whether Claude Code actually RAN the hook, nor whether the result looks right. That is what you do by hand, here, before publishing.

Two targets, in this order. A throwaway project settles what the render looks like, one `pnpm build` per cycle. Your own consumer proves the engine reaches the screen you actually work on, and costs a publish plus an install, so go there once the render is already right.

## Target 1: `sandbox/`, a throwaway Claude Code project

The folder's SOURCE is versioned (the hook wiring in `.claude/settings.json` and the views); everything it generates is not. So `git clean -xdf` is free: it takes `node_modules/` and the tarball, and the setup below rebuilds them in two commands.

### Never write code from that folder

Tooling resolves its config from the directory the session was opened in, so a session opened IN `sandbox/` escapes every gate the repo root has. The absence is silent, which is what makes it a trap: source edited from there ships unchecked. Every change to the engine belongs to a session opened at the repo root.

The gate here is TAYOMI's: Shiki reads `.tayomi/` from the directory it is handed, finds the residual one the folder acquires, holds no contract, and judges nothing.

### Setup

```bash
# from the repo root. The rm is load-bearing: the glob below would otherwise
# match a tarball from an earlier round and install that one.
rm -f sandbox/*.tgz
pnpm build && npm pack --pack-destination sandbox
cd sandbox && npm install ./tayomi-cc-views-*.tgz
```

Then open Claude Code IN THAT FOLDER (the hook is wired in its `.claude/settings.json`) and ask the agent:

> Answer me "@{view:eyetest, tone:gold}", nothing else.

Read the screen, and the box tells you the verdict itself:

| What you see | What it means |
| --- | --- |
| A gold box naming `sandbox/node_modules` | The TARBALL drew it. Good to publish. |
| The raw decorator line | No hook ran, or an engine that lacks this view won the message. Check the hook path below. |
| A literal `@tone` line, or a visible tag name | An engine too old for the tone slot drew it. |

Press `Ctrl+O` (`Cmd+O` on macOS) to see the raw transcript: the model wrote one plain line, nothing more.

### Why `eyetest` and not any view

Because **no plugin ships a file by that name**, and because the render names its own origin.

A user-scoped plugin's MessageDisplay hook fires in that folder too, and both engines draw the same message ("Two engines can draw the same message" in [caveats.md](../caveats.md)). So a coloured box from a view BOTH of them carry proves nothing about this tarball: you cannot tell which one drew it.

### When the verdict is a raw line

Check the hook's command path before anything else: it must be absolute, through `${CLAUDE_PROJECT_DIR}` (or `${CLAUDE_PLUGIN_ROOT}` in a plugin). `/hooks` lists what is registered, `claude --debug` shows a hook firing, and the symptom with the A/B that pinned it is in [display-host.md](../architecture/display-host.md).

This eye test is what caught that bug on 2026-07-31, on the wiring the root README was itself recommending, and it is the whole reason the file exists: the gate feeds the bin directly and can never see the hook.

### What lives in the folder

`views/` holds the eye tests that need a template:

- `eyetest.view`: the self-identifying box above, static, no data to improvise.
- `table.view` and `alert.view`: the tone slot spent for real, one file per view covering every kind (`@{view:table}`, `@{view:table, type:warning}`, `@{view:table tone:gold}`, and `type:` on a `view:alert` block driving its border and its badge).
- `checks.view`, `findings.view`, `plan.view`, `commit.view`, `compare.view`: prototypes of a standard library, each file's header comment says what it is for and (for `compare`) the exact block that summons it. To eye-test one, ask the agent to report something real through it, e.g. "run pnpm test and report through a `view:checks` block". `compare` rides the DECORATOR (a plain markdown table), the other four ride fenced blocks.

A second, complementary ask is `@{view:welcome}`: that view ships INSIDE the tarball, so it proves the packaged `views/` resolve from an installed copy. Read its verdict knowing a plugin may carry a `welcome.view` of its own.

Everything else there is disposable: `node_modules/`, the `.tgz`, any lockfile, any `*.ansi` dump.

## Target 2: your own project or plugin

The sandbox judges a tarball in a folder built for the occasion. This judges the engine inside the consumer you actually work in, installed from a registry the way a real release would be. Publish a prerelease to Verdaccio from the repo root (see [CONTRIBUTING.md](../../CONTRIBUTING.md)), then, in your consumer:

1. **Install it in the workspace that DECLARES the dependency**, pinned exactly. A prerelease does not satisfy a `^` range, and a monorepo root would take the dep on itself while the workspace that imports the engine keeps the version it had.
2. **Rebuild, if your consumer bundles the engine.** Installing is not enough: the bundle still carries the old code, and a bundling consumer must also re-copy the engine's `views/` (see the bundling caveat in [display-host.md](../architecture/display-host.md)).
3. **Bump its version, if your consumer is a Claude Code plugin**, then refresh the marketplace, update, and restart.

Step 3 is the one that wastes an afternoon. Claude Code runs a plugin's hook from a COPY in `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, never from your working tree, even when the marketplace is a local directory. `plugin update` compares versions before it copies: without a bump it answers "already at the latest version", no copy happens, and your rebuild never leaves the repo. The version it reads is the plugin manifest's (`.claude-plugin/plugin.json`), not the marketplace entry's.

Skip any step and nothing on screen says so: the old engine keeps drawing.

### There is no shortcut, and the reason is `viewsPath`

A `.view` you have just written does not reach that consumer's screen by sitting in a directory near it. A host composing its own `viewsPath` BYPASSES `defaultViewsPath()` entirely, so the project's own `views/` (which the zero-config bin reads from the cwd) is not on the path at all: TAYOMI's plugin passes `[viewsDir(), bundledViewsDir()]` and looks nowhere else. For a view that ships inside the package, the chain above is the only way in.

Do not copy the file into the plugin's cache to get around it. It is wiped by the next `plugin update`, shadowing is what `viewsPath` ORDER is for ([display-host.md](../architecture/display-host.md)), and above all it proves nothing: a render you then trigger from the ENGINE's own checkout resolves that name from the repo's `views/` and draws an identical screen, so the copy is never the thing you measured.

### Worked example: the TAYOMI plugin

It bundles the engine AND installs as a plugin, so it hits all three steps at once.

```bash
# 1. in <tayomi>/plugins/core, the workspace that declares the dep.
#    `claude plugin marketplace list` prints where a local checkout lives.
pnpm add @tayomi/cc-views@0.1.1-rc.N --registry http://localhost:4873

# 2. its build esbuilds the hook with --external:@tayomi/cc-views, so the
#    engine stays a real package and keeps finding its own views/
pnpm build

# 3. bump plugins/core/.claude-plugin/plugin.json, then
claude plugin marketplace update tayomi
claude plugin update tayomi@tayomi
# restart Claude Code
```

### Proving the copy carries what you published

The chain ends on a bump, and a bump is a claim: `plugin update` copies a directory, it never checks which engine that directory installed. So read the version INSIDE the copy rather than trusting the manifest you just edited.

```bash
grep '"version"' ~/.claude/plugins/cache/tayomi/tayomi/<version>/node_modules/@tayomi/cc-views/package.json
```

One line, and the whole chain answers at once: the prerelease reached the registry, the workspace installed it, `plugin update` copied it. The wrong version here tells you which of the three failed, and the directory's own timestamp (`ls -ldT` on it) says whether the copy happened at all.

Nothing here proves the RESTART, and no check should: a session already running keeps the engine it loaded, you are the one who restarts it, and restarting again costs three seconds against two commands. When in doubt, restart rather than measure.
