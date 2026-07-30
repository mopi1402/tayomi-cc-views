# @tayomi/cc-views

Template-driven terminal rendering for Claude Code's MessageDisplay hook: an agent
writes a compact data block inline, the hook dresses it as coloured, boxed, aligned
output on screen. Presentation costs the model zero tokens, and the transcript keeps
plain text, so every re-read stays clean.

> **Status**: unpublished; hosted in the TAYOMI monorepo while construction lasts.
> The dist build is real (`pnpm build` produces the bin below), and this quickstart
> is verified as written against an installed copy of the package.

## Quickstart

**1. Wire the hook.** Point `hooks.json` at the zero-config bin:

```json
{ "hooks": { "MessageDisplay": [{ "hooks": [{ "type": "command",
  "command": "./node_modules/.bin/cc-views-messagedisplay" }] }] } }
```

**2. Write a template.** A `.view` file in your project's `views/` directory, for
example `views/demo.view` (this exact demo lives in [`examples/`](examples/demo.view)).
Any other location works through `CC_VIEWS_PATH` (ordered dirs, PATH-like), and an
earlier dir overrides a later one's view of the same name:

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

**3. Teach the agent.** The engine renders nothing until the model writes its half
of the contract. Put an instruction like this in your system prompt or skill:

> When you report structured results, emit a fenced block whose language is
> `view:<name>` (for example ` ```view:demo `), carrying `key: value` lines and
> `key:` + `- item` lists. Write plain data, never colours or alignment.

The agent then writes:

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

and the screen shows a bordered box titled `payments deploy` with a `staging` badge,
one aligned row per check, each verdict as a coloured chip (`OK`, `WARN`, `FAIL`).

## The second carrier: a decorator over plain markdown

A fenced block's fallback is a code wall. The decorator flips the trade: the payload
IS a plain markdown table, so anywhere the hook does not run, the reader still gets
a native table. One line above it names the template (and optionally a semantic
type):

```
@{view:table, type:warning}
| Item | Info |
| --- | --- |
| Status | all green |
```

On screen the decorator line disappears and the table renders through
`table.warning.view` (falling back to `table.view`). In the transcript, it is
markdown. Any failure shows the original text, decorator included: the engine is
fail-open everywhere.

## Options in brief

Rendering is configured per call with `RenderOptions`: `viewsPath` (ordered template
dirs, first hit wins; defaults to the `CC_VIEWS_PATH` dirs, then the project's
`views/`, then the plugin's own), `width` (a fixed number, or a source function),
`widthEnv` (default `CC_VIEWS_WIDTH`), `stateDir` (self-cleaning stream state). The `{{tag}}`
colour vocabulary is extended process-wide with `extendTags`. Details in the
integration reference below.

## Documentation

- [The `.view` language reference](docs/view-language.md): every directive,
  substitution, tag and carrier, with the data format the agent writes.
- [Integration reference](docs/display-host.md): `DisplayHost`, `RenderOptions`,
  the hook runner's two storeys, every public export, troubleshooting.
- [Architecture (français)](docs/architecture.md): the deep dive on the layer
  chain, streaming, width, the decorator trade and the palette.
