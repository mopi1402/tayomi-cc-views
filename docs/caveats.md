# Caveats

What changes your experience as a reader comes first; the rest is side effects.
Every entry ends with one quoted line naming the boundary: is this a missing
hook on Claude Code's side, a deliberate trade of this engine, or a bug that
will be fixed here? That line is how you know what to expect, and from whom.

## Main caveats

### 1. A view announces its start; its end is found, not declared

The engine never guesses from shape (an early POC captured ordinary tables by
their shape, and was withdrawn for it). So a view must announce itself: the
fence names its start and its end, the decorator line names only its start, and
the engine finds the end at the first line that is no longer part of the table.

While the message is still streaming, the end is unknown by nature, so an open
zone is withheld and revealed on the final flush, rendered or raw.

Known failure mode of that hunt, confirmed by execution on 2026-07-31: a
` ```view: ` fence the model never closes currently swallows everything from
the fence to the end of the message. The fix is to fail open on the final
flush, as the decorator carrier already does.

> **Boundary:** the start marker is a deliberate choice and will not move;
> the tail-swallowing on an unclosed fence is an engine bug, fix planned here.

### 2. Code can be mistaken for a view and break the display

Only two shapes can intercept code today, and both are narrow:

- A tight Objective-C dictionary literal `@{view:x}`, alone on its line,
  while a template of that name resolves AND renders content with no data (a
  data-driven template renders hollow and falls back to the raw line). Every
  other `@` syntax is rejected (see the collision catalogue below).
- A code fence QUOTING a working example of the carrier, which is what
  documentation about this package looks like. Confirmed by execution on
  2026-07-31: the example renders inside its own fence.

In both cases fail-open bounds the damage: a mis-rendered zone, never lost
text.

> **Boundary:** the token's collision surface is a deliberate, tested trade;
> the fence-quoting case is an engine bug, fence tracking planned here.

### 3. Resize the terminal and the print is broken

Width is measured at print time, and boxes wrap at that width forever: nothing
reflows when the terminal resizes. This is not specific to the views: Claude
Code's own native output does not reflow either (a markdown table printed in a
narrow terminal keeps its narrow, stacked form after you widen it).

> **Boundary:** Claude Code side, twice over: no resize event reaches a hook,
> and no channel exists to rewrite lines already printed. The day the hook
> payload carries the terminal size, it becomes one more width source here
> with zero API change.

### 4. Leave and come back: you see the data, not the views

`MessageDisplay` fires when a message reaches the screen, and nothing fires
when a transcript is displayed again. Reopen the session, or read the
transcript in any other viewer, and the dressing is gone: you are back to the
plain data.

Nothing restores the views, but the two carriers do not age the same, and that
is the one lever you have:

- The fenced block's payload is `key: value` data. Claude Code never
  interprets it, so a reread shows a wall of fenced code.
- The decorator's payload is ordinary markdown. A reread shows a NATIVE table
  under one extra line: the fallback rendering is Claude Code's own, intact.

So when the content must stay readable after the session, carry it with the
decorator, not the fence.

> **Boundary:** Claude Code has no re-display hook; and half of it is by
> design, the transcript staying plain text is the feature (zero presentation
> tokens, a history any tool can read).

## Other side effects

### Markdown around a view shows as plain text

The hook contract is per-message and all-or-nothing: returning content
replaces Claude Code's own markdown pass for the whole message. The engine
returns nothing for any message without a view, so this touches only the
messages that actually engage.

> **Boundary:** Claude Code's hook contract; mitigated here by staying out of
> every message that carries no view.

### Streaming can leak a token's first characters

A delta already shown cannot be retracted. A token cut mid-flush (`@{view:ta`)
can reach the screen raw before it completes; only its leading characters can
leak, never the zone below an anchored decorator. Markup cut mid-marker
re-emits from the divergence once complete, so no content is dropped.

> **Boundary:** deliberate trade; retracting shown text is impossible on a
> stream, so the residual is bounded instead of eliminated.

### An interrupted message never reveals what was withheld

A message abandoned mid-stream (an interruption) receives no final flush, so a
zone withheld at that moment stays unrevealed. Bounded to the message that was
interrupted.

> **Boundary:** Claude Code's dispatcher; that path sends no final flush, and
> nothing in this package can run without one.

### Headless runs show plain data

`MessageDisplay` does not run under `claude -p`, so end-to-end checks against
the live dispatcher are manual by nature. Everything below that line is
unit-testable: `handleMessageDisplay` takes parsed payloads.

> **Boundary:** Claude Code; headless invocations have no display to hook.

## Reference: the `@` collision catalogue

Why caveat 2's surface is that narrow. The decorator token requires the exact
prefix `@{view:`, alone on its line:

- **Python, TypeScript, Java, C#, Ruby** (`@app.route`, `@Component({...})`,
  `@Override`, `@ivar`): never match the prefix.
- **SCSS and CSS at-rules** (`@media`, `@mixin`, `@use`, nested or not): same.
- **PowerShell** `@{Name='x'}` and **Perl** `@{$ref}`: the reason the prefix
  is `@{view:` and nothing shorter; guarded and tested.
- **LESS interpolation** `@{view}`: one character away, rejected by the
  mandatory colon.
- **Objective-C dictionary literals**: the idiomatic `@{view: x}` is rejected
  (the space fails the name pattern); only the tight `@{view:x}` parses, and
  it still needs the table and the template (caveat 2).

Parsing the token is not engaging: the line must be alone, the named template
must resolve, and the payload must be the supported two-column table, or
absent entirely (the payload-less form summons a static view; a data-driven
view summoned bare renders hollow and falls back to the raw line). Any layer
failing leaves the zone exactly as written. The fenced carrier has no
collision surface with language syntax at all: it requires a markdown fence
of its own.
