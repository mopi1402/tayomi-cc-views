# Integration reference

How a host wires the engine, from zero code to full behaviour. Grounded in `pipeline.ts`, `hook/runner.ts`, `options.ts`, `platform/tty-width.ts` and `style.ts`.

## Four ways in

1. **Zero-config bin**: `hooks.json` points at `cc-views-messagedisplay`. No host, default options: every block renders from its own text.
2. **Your own hook file**: call `runMessageDisplayHook(host?, options?)`. It reads stdin, reassembles the stream, writes the envelope to stdout, and never exits the process (the exit belongs to the caller).
3. **Process-free**: `handleMessageDisplay(payload, host?, options?)` takes a PARSED payload and returns the envelope string or `null`. All the reassembly logic, no stdin/stdout anywhere: this is the storey tests drive.
4. **Direct rendering**: `transform(full, host?, final?, cwd?, options?)` for a whole message, `slice(prev, delta, ...)` for one flush, `renderView(name, data, dirs, injected?, options?, dressing?)` for one view outside any hook flow.

## `DisplayHost`: behaviour, not configuration

Every member is optional; with no host at all the engine renders every zone from what the message itself carries. All three reach BOTH carriers: a view moving from a fenced block onto a decorator keeps every promise it was given.

- `inject(view, data, cwd)`: extra scope merged into a view, for facts the model did not write (state the model must not be trusted to remember). Returning `undefined` means "nothing to add".
- `strict: { view, failedLine }`: the ONE view that must never fail open to its raw markdown. A payload it refuses, a render that comes back hollow, a render that throws: each shows the `failedLine` in place of the zone, decorator line included, and says so in the outcome. (A refused payload gives up only the lines its shape can claim as its own: what a greedy run merely swallowed stays on screen and is rescanned.)
- `onRendered(ok, error)`: the strict view's outcome, decided ONCE per message whichever carrier drew the view, reported only on the final delta (an ungated report would fire on every recomputed flush). Where BOTH carriers named the strict view in one message, the zone written LAST decides, the same last-writer rule one carrier keeps within itself.

**Breaking, and it takes the package to its next MAJOR: `inject` receives the PARSED data, where it used to receive the block's raw text.** A decorated zone has no body text to hand over, and a host re-parsing a body the engine already parsed is the second reader this package exists to prevent. What arrives is the fields, in one grammar whichever carrier carried them, built from the payload as WRITTEN: the styled cells the render draws from never leave the engine, so a decorated value reads byte for byte as its fenced twin. A decorated zone also carries its carrier's own reading beside the derived fields (`rows`, and `head` where the table wrote one), which a fenced block does not have; a host comparing key SETS across carriers must expect that. Lists arrive UNSPLIT (`@fields` is the template's business and no carrier's), and the handed structure is separate from the one the render draws: an edit the host makes to it redraws nothing. A host that used to call `parseData(body)` on the way in now drops that call.

## `viewZones`: what the message carried

`viewZones(text)` returns `{ view, data }` for every view zone of a message, both carriers, in the order they were written. Nothing is rendered and no template is loaded, which is what makes it cheap enough for a gate hook: a Stop hook judging what the model put on screen reads the very zones the engine renders, instead of growing a parser of its own that diverges the day either changes.

What it does NOT answer, by construction:

- **A list arrives unsplit.** `@fields` is declared by the template, and no template is loaded here.
- **A zone is reported whether or not it would DRAW.** An unknown view name, a template that reads none of the fields: both are a render's verdict, not a reader's.
- **A payload the carrier could not read is reported carrying nothing** (`data: {}`), which is also what a decorator with no payload at all reports. Silence would be indistinguishable from a message that never named the view.
- **A decorated cell reads byte for byte as its fenced twin.** The decorator carrier neutralises and styles where message text becomes a scope value (`architecture.md`), but those treatments are the RENDER's: what the reader reports is the payload as WRITTEN, so a gate comparing a value against the words an author typed never meets a mark or an engine tag. The zone's key set still differs: a decorated table carries `rows` (and `head`) beside the derived fields, a fenced block only what it wrote.

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

### Theme resolution order

Two things depend on the theme Claude Code is drawing in.

An inline code span: the host has no colour of its own for one, it spends its `permission` palette slot on it, and that slot holds a different value under each of its six themes. A pinned value is right in one of them, and on a light terminal the dark theme's periwinkle is barely legible.

And the neutral pill, which is a SURFACE rather than a hue. Near-white reads as a bright band on a dark screen and as nothing at all on a light one, so it is the one fill in the palette that turns over with the terminal, carrying its ink across with it.

The host answers this itself with the terminal background it read over OSC 11 at startup, and that answer never leaves its memory. Re-asking the terminal from a hook is not an option either: the query would have to go onto the tty the host is reading in raw mode, where the reply lands in whichever of the two reads first. So what resolves here is the DELIBERATE half, most deliberate first:

1. `CC_VIEWS_THEME`: one of `light`, `light-ansi`, `light-daltonized`, `dark`, `dark-ansi`, `dark-daltonized`. Any other word falls through rather than naming a guess.
2. The `theme` key of the host's `settings.json`, under `CLAUDE_CONFIG_DIR` or `~/.claude`, when it NAMES one of those six. `auto` is not a theme name, so it falls through with no case of its own.
3. `COLORFGBG`, read as the host reads it: the last field as a base-sixteen slot, `0..6` and `8` meaning a dark background. Most terminals never set it (Ghostty does not).
4. `dark`, which is what the host itself falls back to.

Resolved once per process, since the theme cannot change under a hook that lives the length of one message.

A session left on `theme: auto` in a terminal that sets no `COLORFGBG` therefore resolves to `dark` whatever the terminal looks like, because nothing is left to read. Pinning the host's theme, or setting `CC_VIEWS_THEME`, is what makes a light terminal legible.

### The theme names the terminal, and a band overrules it

The theme is not what a code span is coloured against: it is only how the engine learns what the TERMINAL looks like. A span drawn inside a filled band stands on that band, not on the terminal, and the band is the surface that decides.

So the ink is resolved where the span is written, against the innermost open tag that fills. Measured on the neutral pill, the terminal's own value scored a contrast of 1.62 against it, which is a colour no reader can find; the value for the other side scores 3.80. A band on the opposite side from the terminal therefore takes the COUNTERPART theme's value, its variant kept, so an `ansi` or daltonized reader is never handed the palette they went out of their way not to be shown.

Nothing here is a second palette. The two values are the host's own, for the two surfaces, and a host that registers `code` through `extendTags` owns the name outright and is asked nothing.

## `extendTags`: the palette

The `{{tag}}` vocabulary is a PROCESS-GLOBAL registry, not a per-call option (the reason is in [architecture.md](architecture.md)). What a template does with a tag is [the language reference](view-language.md)'s; what follows is what the CALL guarantees, and how a colour is spelled so the engine can derive from it.

`extendTags` is TOTAL and never throws: a styling call must never cost the screen, so a startup registration cannot kill a host's whole display the day the engine claims a name that host already used. Registration lives under the same law as the views, the LAST one winning: shadowing an engine name is deliberate, and the screen's owner has the last word.

What did NOT apply comes back in a `TagReport` instead of an exception:

- `shadowed`: the existing definitions taken over. Surface it, a colour should not change in silence.
- `skipped`: the names the `{{tag}}` shape cannot carry (`\w+`).

Re-registering an identical pair is a no-op.

The value is raw ANSI, and `ansi256(n)` and `rgb(r, g, b)` are exported to write the two spellings the engine can measure a chip and a cap from: `extendTags({ brand: ansi256(75) })`. They are total the same way this call is, a parameter outside `0..255` clamping and a fraction rounding, so nothing a host passes emits a sequence a terminal reads as something else.

**Where a registered tag resolves: in a view.** The engine runs no tag pass over the message, so your name is spent by a template file, and by your own `strict.failedLine` (the one host-authored string the engine inserts). A `{{brand}}` typed in the model's prose stays on screen as those nine characters.

One name is spent in a third place, and only that one: `code`. It is what an inline backtick span opens on, in a view and in `renderCode` alike, so registering it recolours every code span the engine draws. See "Only a template writes presentation" in `architecture.md` for why.

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
| `viewZones`, `ViewZone` | Every view zone a message carries, both carriers, name and data per zone, in the order written. No render, no template: the section above states its limits. |
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

Nothing else is needed, and in particular **do NOT copy the views into your own directory**. A copy has to be refreshed by hand at every engine update, and it silently overwrites a view of your own that happens to share a name. Shadowing is what `viewsPath` ORDER is for, and it costs nothing.

An inlined engine still works, as long as the package remains installed: `bundledViewsDir()` asks Node where `@tayomi/cc-views` LIVES rather than where the calling code sits, and that question survives the move. External is the recommendation because the dependency is then honest, declared where a reader can see it, instead of a bundle that looks self-contained and is not.

What an inlined engine will NOT do is fall back on YOUR `views/`. It sits one hop above the bundle, so the upward search walks straight into it; taking it would serve your templates as the engine's own, silently. The engine checks the manifest beside a candidate directory and takes it only if it names this package. With the package gone entirely, the health check therefore shows its raw block rather than a wrong box.

## Troubleshooting

The engine is fail-open EVERYWHERE: a failure never crashes and never blanks the screen, it shows the original text. The raw block on screen IS the error report. Walk the causes:

- **A fenced block shows raw, fences and all.** The view's name resolved to no file on `viewsPath` (check the name and the dirs, remembering the LAST dir is read unconditionally); or the body parsed to ZERO fields ("raw over hollow": a non-empty block the parser cannot read at all is shown, not rendered empty); or the template resolved none of the block's fields, so nothing it drew could have come from them (a field named only inside a loop over an absent list counts as unread, since the render never reached it); or the template threw mid-render.
- **A decorated zone shows raw, decorator line included.** The token is malformed (an unknown attribute, anything not `@{view:` at line start); or the payload is neither of the two shapes (a table of two to four columns with header, delimiter and at least one data row, every row the width the header set; or a blockquote followed by a blank line); or the named template names none of the fields the payload carries, which is how a view refuses a payload shape by not reading it; or every field it does name arrived blank; or the template is unknown. The separator between the view name and its attributes is NOT a cause: a comma, whitespace, or both all parse.
- **Nothing renders at all, and the hook may never have run.** Check the hook's command path FIRST: a bare relative path (`./node_modules/.bin/...`) is not resolved for a hook command, so the hook never runs and nothing on screen says so. Use the placeholder Claude Code substitutes, `${CLAUDE_PROJECT_DIR}/...` in a project's settings, `${CLAUDE_PLUGIN_ROOT}/...` in a plugin's. `/hooks` lists what is registered, and `claude --debug` shows a hook firing and what it returned. (Confirmed here on 2026-07-31, Claude Code 2.1.220, by an A/B in a throwaway project: identical fresh sessions, the relative form rendered nothing, the placeholder form rendered.)
- **Nothing renders, but the hook did run.** The message carries none of the engagement markers (` ```view: `, `@{view:`), so the engine returns `null` and the host's own rendering stands. That is by design: returning text would flatten the host's markdown.
- **The box wraps at a surprising column.** Walk the width resolution order above: a number in options wins over the env var, which wins over any probe.
- **The strict view shows one terse line.** That is `strict.failedLine`: the host declared this view must never fail open; `onRendered` carries the error text. It holds on both carriers, and on a decorated zone it replaces the decorator line and its payload together.
- **A decorated table draws, but a field the template names is empty.** A two-column table also reads as NAMED FIELDS: the first cell names, the second fills, an empty first cell continues the field above, and a value opening `- ` appends an item to that field's list. So the name has to be a legal field name (a word, never opening on a digit), lowercased for you; a row whose first cell is anything else is skipped in silence, and a table of three or four columns carries `rows` alone.
