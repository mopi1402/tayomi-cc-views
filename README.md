<p align="center"> <img src="docs/images/tayomi-cc-views.png" alt="@tayomi/cc-views" width="220"/> </p>

# @tayomi/cc-views

**Colour and layout for Claude Code's answers: boxes, aligned columns and coloured status chips, drawn live in your terminal.**

<img src="docs/images/tayomi-tldr-view.png" alt="A TL;DR view rendered in the terminal" width="689"/>

*A production view from TAYOMI's own turn reports, drawn by this engine. Write your own `.view` and the quickstart below gets you there.*

> The model never draws any of it. The agent writes a compact block of plain data, and a MessageDisplay hook dresses it on screen through a `.view` template you own. Presentation costs the model zero tokens, and the transcript keeps plain text.

## Features

**✓ Boxes, columns, chips.** Titled and badged boxes, aligned columns, coloured status chips, all from plain data.

**✓ Zero tokens on presentation** (minus one decorator line). The model writes markdown as usual; the hook draws.

**✓ Templates you own.** `.view` files resolved through ordered directories: name a file the same and you shadow any view, a plugin's included.

**✓ Two carriers.** A fenced `view:` block, or ONE DECORATOR LINE OVER MARKDOWN THAT STANDS ON ITS OWN: a table, or an alert quote. Where the hook does not run, each stays what it was.

**✓ One template, any tone.** `type:warning` or `tone:dim` recolours a view where it stands, like sticking a class on it. No second file.

**✓ Your palette.** `extendTags` adds your own `{{tags}}` process-wide, measured and rendered alike, and yours shadow the built-ins.

**✓ Only a template writes presentation.** A tag resolves inside a view, never in a message: the model names a template and hands it data, and can open no colour of its own.

**✓ Fail-open.** A failing view shows its original text in place, the rest of the message still renders. Never a blank.

## Use it in your project

### Minimal setup

1. **Install:**

   ```bash
   npm install -D @tayomi/cc-views
   ```

2. **Wire the hook.** In your project's `.claude/settings.json` (or your plugin's `hooks/hooks.json`, same shape), then restart Claude Code:

   ```json
   {
     "hooks": {
       "MessageDisplay": [
         {
           "hooks": [
             {
               "type": "command",
               "command": "${CLAUDE_PROJECT_DIR}/node_modules/.bin/cc-views-messagedisplay"
             }
           ]
         }
       ]
     }
   }
   ```

The `${CLAUDE_PROJECT_DIR}` placeholder is not decoration: a BARE relative path (`./node_modules/...`) is not resolved for a hook command, and the hook then never runs, silently, with nothing on screen to say so.

3. **Copy/paste this prompt:**

> Answer me "@{view:welcome}", nothing else.

A coloured, titled box on screen closes the setup: it works. The welcome text lives in the template, so there is nothing to improvise wrong.

Then press `Ctrl+O` (`Cmd+O` on macOS) to see the raw transcript: the model actually wrote a single plain line. The dressing is display-only; the conversation the model sees carries no colours, no layout, no extra tokens.

The `welcome` view ships inside the package and closes the search path, so it is always available (and yours to shadow like any view). Keep it around: after any Claude Code update, asking for `view:welcome` again tells you instantly whether the hook is still alive.

### Customize your own

1. **Write a template.** A `.view` file in your project's `views/` directory, for example `views/demo.view` (this exact demo lives in [`examples/`](examples/demo.view)). Any other location works through `CC_VIEWS_PATH` (ordered dirs, PATH-like), and an earlier dir overrides a later one's view of the same name:

   ```
   @map verdicts ok=pass warn=warn fail=fail
   @fields checks verdict name detail
   @box
   @head ${service} deploy
   @right ${env}
   @each checks label="CHECKS"
   ${#label}  ${verdict:verdicts} ${name}  ${detail}
   @end
   @endbox
   ```

2. **Teach the agent.** The engine renders nothing until the model writes its half of the contract. Put an instruction like this in your system prompt or skill:

> When you report structured results, emit a fenced block whose language is `view:<name>` (for example ` ```view:demo `), carrying `key: value` lines and `key:` + `- item` lists. Write plain data, never colours or alignment. Asked for the welcome or health check view, reply with the single line `@{view:welcome}`.

3. **Ask for a report.** The agent then writes:

   ````
   ```view:demo
   service: payments
   env: staging
   checks:
   - ok build the bundle compiles
   - warn tests 2 flaky suites skipped
   - fail lint 3 errors in api.ts
   ```
   ````

and the screen shows a bordered box titled `payments deploy` with a `staging` badge, one aligned row per check, each verdict as a coloured chip (`OK`, `WARN`, `FAIL`).

To learn the language by example, read [`views/welcome.view`](views/welcome.view): it is commented line by line, and your agent can read it too before writing a view of its own.

## Prefer plain markdown? Use the decorator

A fenced block's fallback is a code wall. The decorator flips the trade: **the payload is markdown that stands on its own**, so anywhere the hook does not run, the reader still gets a real block. One line above it names the template (and optionally a semantic type).

A **table**, for rows:

```
@{view:table, type:warning}
| Item | Info |
| --- | --- |
| Status | all green |
```

An **alert quote**, for one band:

```
@{view:banner}
> [!WARNING]
> two flaky suites, publication is blocked
```

On screen the decorator line disappears: the table renders through `table.view` dressed in the kind's colour, and the quote renders as a full-width coloured band whose word (`⚠ WARNING`) comes from the packaged template's own table, so nothing has to be created to use it. The marker is one uppercase token and there is no other way to name a kind in a quote, which is what keeps it from becoming a label the model writes prose into.

What each degrades to, where the hook is absent:

| Payload | Re-rendered as markdown | Read raw in a transcript |
| --- | --- | --- |
| Fenced `view:` block | a code wall | a code wall |
| Table under a decorator | a native table, one stray line above it | a table, one stray line above it |
| Alert quote under a decorator | a native alert box for `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`; an ordinary quote otherwise | a quote whose first line names its kind |

A starting point for a table lives in [`examples/table.view`](examples/table.view); the marker, `@text`, `type:`, `tone:` and the typed forms are specified in [the language reference](docs/view-language.md).

## Use it in your plugin or framework

The bin is only the zero-config storey: everything it does is public API, so a plugin ships its own hook file, its own views and its own palette:

```ts
import { runMessageDisplayHook, extendTags } from "@tayomi/cc-views";

extendTags({ brand: "\x1b[38;5;75m" }); // {{brand}}, and {{brand_bg}}/{{brand_cap}} derived from it

await runMessageDisplayHook(undefined, {
  viewsPath: ["./views", "/path/to/my-plugin/views"], // first hit wins
});
```

`viewsPath` order is your policy: list the consumer's directory first and your users can shadow any of your views by simply naming a file the same. Append `bundledViewsDir()` last to keep `view:welcome` (the health check) resolvable through your hook too. For tests, `handleMessageDisplay(payload, host?, options?)` takes a parsed payload and returns the output string (or `null`) with no stdin/stdout anywhere. Width, state dir and the rest of `RenderOptions` are covered in the integration reference below.

## Documentation

- [The `.view` language reference](docs/view-language.md): every directive, substitution, tag and carrier, with the data format the agent writes.
- [Integration reference](docs/display-host.md): `DisplayHost`, `RenderOptions`, the hook runner's two storeys, every public export, troubleshooting.
- [Architecture](docs/architecture.md): the deep dive on the layer chain, streaming, width, the decorator trade and the palette.
- [Caveats](docs/caveats.md): the five main caveats and the other side effects, each ending on the one line that names its boundary (Claude Code, deliberate trade, or bug to fix here), plus the `@` collision catalogue.
- [Contributing](CONTRIBUTING.md): the verification ladder, from the render one-liner to the pack gate, the sandbox eye test and the local-registry dress rehearsal.
- [Manual checks](docs/contributing/manual-checks.md): for contributors, the pre-publish checks no script can run, judged on a real screen.

## Caveats

- **A view announces its start; its end is found.** One decoration line (or the fence) marks where a view begins, and the engine hunts for where it ends.
- **Code can be mistaken for a view.** Two narrow shapes can intercept code and break its display; fail-open bounds the damage to a mis-rendered zone.
- **Resize the terminal and the print is broken.** Everything wraps at the width measured at print time and never reflows (Claude Code's native output included).
- **Leave and come back: plain data, not views.** Reopen the session or read the transcript anywhere else and the dressing is gone.
- **Two engines can draw the same message.** Register a second MessageDisplay hook and both run, chained; for one zone the first to run wins, and the order is not yours to choose.

Each entry of [docs/caveats.md](docs/caveats.md) explains the problem and ends with one line naming the boundary: a missing hook on Claude Code's side, a deliberate trade, or a bug that will be fixed here.

---

*This engine is a carved-out open-source piece of TAYOMI, my own AI SDLC framework, which draws every one of its views through it.*