# Caveats

What you will see, whose side it comes from, and why when the answer is a deliberate trade. An entry confirmed by execution carries the date it was measured.

## Main caveats

### A view appears all at once, not as it streams

The engine never guesses a zone from its shape. A fence names both ends; a decorator names only its start, and the end is the first line that leaves the payload. While that end is unknown the zone is withheld, then revealed on the final flush, rendered if it can be and raw otherwise. Up to eight characters of an opening token can reach the screen before the engine can tell it is one, and stay there.

> **Boundary:** deliberate. A delta already shown cannot be retracted, and widening what engages would cost more than eight characters.

### Code can be mistaken for a view

One shape, and it is narrow: a tight `@{view:x}` alone on its line, while a template of that name resolves *and* spends no substitution at all. A fenced code block shields its contents, so a quoted example is text (["The carriers"](architecture/view-language.md)); an indented four-space block does not.

> **Boundary:** deliberate. The token demands the exact prefix `@{view:` alone on a line, which is what keeps the surface this narrow (catalogue below). Fail-open bounds the rest to a mis-rendered zone, never lost text.

### A long line outside a container is broken by the terminal

Wrapping belongs to a CONTAINER, so a template drawing a bare body line is emitted unmeasured: the terminal folds it where it likes, and whatever the line had open stays open across the break. `quote.view` is the one shipped view in that case, and its second row starts at the margin with no bar.

> **Boundary:** deliberate, and reversible in two lines: `@box bare` buys the body machinery with none of the chrome, which is how `banner.view` wraps at the engine's own width. Which views spend it is a design decision. Keep a quote short, or wrap it in an `@box`.

### Resize the terminal and the print is broken

Width is measured at print time and nothing reflows afterwards. Claude Code's own output behaves the same way.

> **Boundary:** Claude Code, twice over: no resize event reaches a hook, and no channel rewrites lines already printed. The day the payload carries the terminal size, it becomes one more width source with zero API change.

### Leave and come back: you see the data, not the views

Nothing fires when a transcript is displayed again, and nothing restores the dressing. The two carriers do not age the same, and that is your one lever: a fenced payload rereads as a wall of code, a decorator payload as a native markdown table under one extra line.

**Carry anything that must stay readable after the session with the decorator.**

> **Boundary:** Claude Code has no re-display hook, and half of this is the feature: a plain transcript costs zero presentation tokens and any tool can read it.

### Two engines can draw the same message

More than one MessageDisplay hook can be registered, and both take effect. They CHAIN, the second receiving the first's output, and for one zone the FIRST to run wins, consuming the decorator or the fence. Nothing crosses over: a tag resolves only inside a view its own engine rendered. Measured 2026-07-31, both orders, streaming included: no duplication, no truncation.

The order is still not yours to choose, but which engine CONSUMES no longer follows from it. Each one announces itself on a machine-wide register (its path and its version, one file apiece), and an engine that finds a strictly newer peer there stands down: it answers nothing, and the delta reaches the newer one exactly as the model wrote it. So the newest installed engine draws whichever the dispatcher calls first, and a checkout under development wins over a copy a plugin installed months ago without a publish standing between them.

Every failure to read that register means DRAW, never a silence: an unreadable directory, a malformed claim, a version that does not parse, a peer whose path is gone, a claim older than an hour. `CC_VIEWS_NO_YIELD` turns the mechanism off for a contributor who wants their own engine to draw regardless, and off means draw for the same reason.

> **Boundary:** Claude Code's dispatcher owns the order, and the engine never reads its settings or its plugin manifests to learn who else is registered. Each engine answers for itself alone, which is the one claim that cannot go out of date. An engine too old to carry this cannot stand down, so it reaches a consumer by one install like any other change.

## Side effects

| Effect | Scope | Boundary |
| --- | --- | --- |
| Markdown around a view shows as plain text | Only messages that engage; the hook contract is per-message and all-or-nothing | Claude Code's contract |
| An interrupted message never reveals what was withheld | That message alone, no final flush ever arrives | Claude Code's dispatcher |
| Headless (`claude -p`) shows plain data | End-to-end checks are manual; everything below `handleMessageDisplay` stays unit-testable | Claude Code: no display to hook |
| A colour the HOST opened is not resumed after an engine span | A code span, chip or bold span sitting inside a sequence the engine did not write; the reset still happens there | Deliberate: the engine tracks its own marks, never arbitrary sequences on the line |

## Reference: the `@` collision catalogue

The decorator token requires the exact prefix `@{view:`, alone on its line.

| Syntax | Why it cannot match |
| --- | --- |
| `@app.route`, `@Component({...})`, `@Override`, `@ivar` (Python, TS, Java, C#, Ruby) | Never reach the prefix |
| `@media`, `@mixin`, `@use` (CSS/SCSS at-rules, nested or not) | Same |
| `@{Name='x'}` (PowerShell), `@{$ref}` (Perl) | The reason the prefix is not shorter; guarded and tested |
| `@{view}` (LESS interpolation) | One character away, rejected by the mandatory colon |
| `@{view: x}` (idiomatic Objective-C) | The space fails the name pattern; only the tight form parses |

Parsing the token is not engaging: the line must be alone, the template must resolve, and the payload must be a shape a parser claims. Any one of those failing leaves the zone exactly as written.
