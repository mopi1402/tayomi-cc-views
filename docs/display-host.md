# Integration reference

How a host wires the engine, from zero code to full behaviour. Grounded in `pipeline.ts`, `hook/runner.ts`, `options.ts`, `platform/tty-width.ts` and `style.ts`.

## Four ways in

1. **Zero-config bin**: `hooks.json` points at `cc-views-messagedisplay`. No host, default options: every block renders from its own text.
2. **Your own hook file**: call `runMessageDisplayHook(host?, options?)`. It reads stdin, reassembles the stream, writes the envelope to stdout, and never exits the process (the exit belongs to the caller).
3. **Process-free**: `handleMessageDisplay(payload, host?, options?)` takes a PARSED payload and returns the envelope string or `null`. All the reassembly logic, no stdin/stdout anywhere: this is the storey tests drive.
4. **Direct rendering**: `transform(full, host?, final?, cwd?, options?)` for a whole message, `slice(prev, delta, ...)` for one flush, `renderView(name, data, dirs, injected?, options?, dressing?)` for one view outside any hook flow.

## `DisplayHost`: behaviour, not configuration

Every member is optional; with no host at all the engine renders every block from the block's own text.

- `inject(view, body, cwd)`: extra scope merged into a view, for facts the model did not write (state the model must not be trusted to remember). Returning `undefined` means "nothing to add".
- `strict: { view, failedLine }`: the ONE view that must never fail open to its raw markdown; on failure the `failedLine` shows instead.
- `onRendered(ok, error)`: the strict view's outcome, reported ONCE per message, only on the final delta (an ungated report would fire on every recomputed flush).

### The host factory

`runMessageDisplayHook` and `handleMessageDisplay` accept a `HostSource`: either a `DisplayHost` or a factory `(ctx: MessageContext) => DisplayHost | undefined`. The factory receives the payload meta the runner parsed (`messageId`, `promptId?`, `sessionId?`, `cwd?`, `final`), for a host that keys behaviour on the turn.

## `RenderOptions`: names and sources

- `viewsPath`: ordered template directories, first hit wins (the order IS the shadowing policy). Default, in override order: the `CC_VIEWS_PATH` dirs (PATH-like, split on the platform delimiter), then the project's own `views/` (the hook runs with cwd at the project root), then the `CLAUDE_PLUGIN_ROOT/views` resolution, then UNCONDITIONALLY the views bundled inside the package (home of `welcome`, the health check, which therefore resolves wherever the engine runs). A project template naming a standard view therefore overrides it.
- `width`: a NUMBER is a forced ceiling; a FUNCTION is a width source standing in for the probe (returns columns, or `null` to fall through).
- `widthEnv`: the env var read as a forced ceiling. Default `CC_VIEWS_WIDTH`.
- `stateDir`: where per-message stream state and the probed-width cache live. Default `os.tmpdir()/cc-views`. SELF-CLEANING: a message's state is dropped on its final delta, and a stale sweep prunes what a crashed stream left behind. Two hosts that must not share stream state pass two dirs.

### Width resolution order

The terminal size is invisible to a hook process (its stdout is a pipe), so the width resolves in this order, most deliberate first:

1. `width` as a number: clamped to 40..400, wins outright.
2. The `widthEnv` env var: same clamp. This is the operator's forced ceiling.
3. `width` as a function, else a `ps`-probe of the ancestor terminal (cached in `stateDir` with a 3-second TTL). Probed or sourced columns lose a 4-column margin and clamp to 40..180 (readability, not safety).
4. No terminal found: 100.

## `extendTags`: the palette

The `{{tag}}` vocabulary is a PROCESS-GLOBAL registry, not a per-call option (the reason is in [architecture.md](architecture.md)). How a colour is spelled, and which spellings earn a chip and a cap for free, belong to [the language reference](view-language.md); what follows is what the CALL guarantees.

`extendTags` is TOTAL and never throws: a styling call must never cost the screen. An earlier version threw on redefinition, and one host's startup registration killed its whole display, silently, the day the engine claimed a name the host already used. Registration then lives under the same law as the views, the LAST one winning: shadowing an engine name is deliberate, and the screen's owner has the last word.

What did NOT apply comes back in a `TagReport` instead of an exception:

- `shadowed`: the existing definitions taken over. Surface it, a colour should not change in silence.
- `skipped`: the names the `{{tag}}` shape cannot carry (`\w+`).

Re-registering an identical pair is a no-op.

The value is raw ANSI, and `ansi256(n)` and `rgb(r, g, b)` are exported to write the two spellings the engine can measure a chip and a cap from: `extendTags({ brand: ansi256(75) })`. They are total the same way this call is, a parameter outside `0..255` clamping and a fraction rounding, so nothing a host passes emits a sequence a terminal reads as something else.

**Where a registered tag resolves: in a view.** The engine runs no tag pass over the message, so your name is spent by a template file, and by your own `strict.failedLine` (the one host-authored string the engine inserts). A `{{brand}}` typed in the model's prose stays on screen as those nine characters.

One name is spent in a third place, and only that one: `code`. It is what an inline backtick span opens on, in a view and in `renderCode` alike, so registering it recolours every code span the engine draws. Until 0.1.1 that registration was read everywhere except there. See "Only a template writes presentation" in `architecture.md` for why.

One consequence to plan for: the engine's own vocabulary GROWS over versions (the tone-slot work added `warning`, `error`, `success`, `info` and their chips). A name you registered may BECOME a built-in later: your registration keeps winning, and the report starts saying `shadowed` where it used to say nothing. Prefix your tags (`t_info`) if you never want that ambiguity, and log the report (stderr shows under `claude --debug`) rather than letting it drop.

## Every public export

| Export | One line |
| --- | --- |
| `transform`, `slice` | The pipeline: whole message / one flush in, screen text out. |
| `DisplayHost` | The behaviour seam above. |
| `RenderOptions` | The configuration above. |
| `renderView` | One view rendered by name, outside the hook flow. |
| `Dressing` | What a carrier learned about a zone beyond its data: `type` (the kind) and `tone` (the class filling the view's tone slot). Both optional, both fail open. |
| `loadTemplate`, `viewsDir`, `bundledViewsDir`, `defaultViewsPath`, `VIEWS_PATH_ENV` | Template resolution, the plugin and bundled views dirs, and the default search path with its env var. A host composing its own `viewsPath` appends `bundledViewsDir()` to keep `welcome` resolvable. If you BUNDLE the engine, mark it external: see the next section. |
| `parseData`, `ObjectLists` | The block-data parser. Exported because a host may have a SECOND reader of the same format (a gate judging the block the engine draws): both must share this parser or they diverge. |
| `stringify`, `Scope`, `Table`, `Tables` | The scope a template resolves against, for hosts that inject, and the lookup tables it declares (`@map`, `@text`) under the one registry they share. |
| `renderTags`, `renderCode`, `isTag`, `ANSI_RE` | The markup vocabulary, for a host colouring its own lines the same way. `renderCode` hands back a self-contained span: it opens on the `code` tag (yours, if you registered one) and closes on a reset, reading nothing else on the line as markup. |
| `extendTags`, `TagReport` | The palette seam above: total, last registration wins, the report says what shadowed or skipped. |
| `ansi256`, `rgb` | The two colour spellings a chip and a cap DERIVE from, as functions, so registering a colour is not transcribing an escape sequence. Total like the registration they feed: out of range clamps, a fraction rounds. |
| `displayWidth` | Printed width in terminal columns, for aligning beside a view. |
| `runMessageDisplayHook`, `handleMessageDisplay` | The two edge storeys above. |
| `HostSource`, `MessageContext` | The factory shape above. |

## If your host BUNDLES the engine

Mark the package EXTERNAL. With esbuild:

```
--external:@tayomi/cc-views
```

The engine owns files it opens at RUNTIME (`views/`, and the art an `@aside` names). A bundler inlines a module; it cannot inline a file read later. This is the ordinary shape for a package with runtime assets, and it is the same instruction esbuild itself prints when you bundle IT.

Nothing else is needed, and in particular **do NOT copy the views into your own directory**. A copy has to be refreshed by hand at every engine update, and it silently overwrites a view of your own that happens to share a name. Earlier releases of this document recommended exactly that, and it was wrong: shadowing is what `viewsPath` ORDER is for, and it costs nothing.

An inlined engine still works, as long as the package remains installed: `bundledViewsDir()` asks Node where `@tayomi/cc-views` LIVES rather than where the calling code sits, and that question survives the move. External is the recommendation because the dependency is then honest, declared where a reader can see it, instead of a bundle that looks self-contained and is not.

What an inlined engine will NOT do is fall back on YOUR `views/`. It sits one hop above the bundle, so the upward search walks straight into it; taking it would serve your templates as the engine's own, silently, and that is precisely how a copy became necessary in the first place. The engine checks the manifest beside a candidate directory and takes it only if it names this package. With the package gone entirely, the health check therefore shows its raw block rather than a wrong box.

## Troubleshooting

The engine is fail-open EVERYWHERE: a failure never crashes and never blanks the screen, it shows the original text. The raw block on screen IS the error report. Walk the causes:

- **A fenced block shows raw, fences and all.** The view's name resolved to no file on `viewsPath` (check the name and the dirs, remembering the LAST dir is read unconditionally); or the body parsed to ZERO fields ("raw over hollow": a non-empty block the parser cannot read at all is shown, not rendered empty); or the template resolved none of the block's fields, so nothing it drew could have come from them (a field named only inside a loop over an absent list counts as unread, since the render never reached it); or the template threw mid-render.
- **A decorated zone shows raw, decorator line included.** The token is malformed (an unknown attribute, anything not `@{view:` at line start); or the payload is neither of the two shapes (a two-column table with header, delimiter and at least one data row; or a blockquote followed by a blank line); or the named template names none of the fields the payload carries, which is how a view refuses a payload shape by not reading it; or every field it does name arrived blank; or the template is unknown. The separator between the view name and its attributes is NOT a cause: a comma, whitespace, or both all parse.
- **Nothing renders at all, and the hook may never have run.** Check the hook's command path FIRST: a bare relative path (`./node_modules/.bin/...`) is not resolved for a hook command, so the hook never runs and nothing on screen says so. Use the placeholder Claude Code substitutes, `${CLAUDE_PROJECT_DIR}/...` in a project's settings, `${CLAUDE_PLUGIN_ROOT}/...` in a plugin's. `/hooks` lists what is registered, and `claude --debug` shows a hook firing and what it returned. (Confirmed here on 2026-07-31, Claude Code 2.1.220, by an A/B in a throwaway project: identical fresh sessions, the relative form rendered nothing, the placeholder form rendered.)
- **Nothing renders, but the hook did run.** The message carries none of the engagement markers (` ```view: `, `@{view:`), so the engine returns `null` and the host's own rendering stands. That is by design: returning text would flatten the host's markdown.
- **The box wraps at a surprising column.** Walk the width resolution order above: a number in options wins over the env var, which wins over any probe.
- **The strict view shows one terse line.** That is `strict.failedLine`: the host declared this view must never fail open; `onRendered` carries the error text.
