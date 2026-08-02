# Caveats

Every entry names its **boundary**: a missing hook on Claude Code's side, a
deliberate trade of this engine, or a bug that will be fixed here. The dated
incidents behind these entries live in [decisions.md](decisions.md).

## Main caveats

### A view announces its start; its end is found

The engine never guesses from shape. A fence names both ends; a decorator line
names only its start, and the end is the first line that leaves the table. While
the message streams, an unknown end means the zone is withheld and revealed on
the final flush — rendered if it can be, raw otherwise.

One residue survives: a flush ending inside the eight characters of the opening
hint carries no fence yet, so the engine declines the whole message and the host
draws that fragment itself. Up to eight stray characters above the box. Widening
what engages costs more than the residue.

> **Boundary:** deliberate; the start marker will not move.

### Code can be mistaken for a view

One shape, and it is narrow: a tight Objective-C literal `@{view:x}` alone on its
line, while a template of that name resolves *and* spends no substitution at all.
A template that spends one is handed nothing and fails open, so it can no longer
draw an empty skeleton where content stood. Fail-open bounds the rest to a
mis-rendered zone, never lost text. See the collision catalogue below for why the
surface is that narrow.

A fenced code block no longer collides. Both carriers read a text's fences before
they read anything else, and the outermost fence decides, so a quoted example is
text: a `view:` block shown inside a longer fence, and a decorator line shown
inside any fence, are left exactly as written. What does NOT shield is an
indented four-space code block; fenced blocks are what agents and hooks emit, and
nobody has produced the other.

> **Boundary:** the token's surface is a tested trade; the indented block is a gap
> left open on purpose.

### Resize the terminal and the print is broken

Width is measured at print time and nothing reflows afterwards. Claude Code's own
output behaves the same way.

> **Boundary:** Claude Code, twice over: no resize event reaches a hook, and no
> channel rewrites lines already printed. The day the payload carries the
> terminal size, it becomes one more width source with zero API change.

### Leave and come back: you see the data, not the views

Nothing fires when a transcript is displayed again. The dressing is gone, and
nothing restores it — but the two carriers do not age the same, and that is your
one lever. A fenced payload rereads as a wall of code. A decorator payload
rereads as a native markdown table under one extra line.

**When the content must stay readable after the session, carry it with the
decorator.**

> **Boundary:** Claude Code has no re-display hook — and half of this is the
> feature, not the bug: a plain transcript costs zero presentation tokens and any
> tool can read it.

## Side effects

| Effect | Scope | Boundary |
| --- | --- | --- |
| Markdown around a view shows as plain text | Only messages that engage; the hook contract is per-message and all-or-nothing | Claude Code's contract |
| A token cut mid-flush (`@{view:ta`) leaks its first characters | Leading characters only, never the zone below an anchored decorator; markup re-emits from the divergence, so nothing is dropped | Deliberate: shown text cannot be retracted |
| An interrupted message never reveals what was withheld | That message alone — no final flush ever arrives | Claude Code's dispatcher |
| Headless (`claude -p`) shows plain data | End-to-end checks are manual; everything below `handleMessageDisplay` stays unit-testable | Claude Code: no display to hook |

## Reference: the `@` collision catalogue

The decorator token requires the exact prefix `@{view:`, alone on its line.

| Syntax | Why it cannot match |
| --- | --- |
| `@app.route`, `@Component({...})`, `@Override`, `@ivar` (Python, TS, Java, C#, Ruby) | Never reach the prefix |
| `@media`, `@mixin`, `@use` (CSS/SCSS at-rules, nested or not) | Same |
| `@{Name='x'}` (PowerShell), `@{$ref}` (Perl) | The reason the prefix is not shorter; guarded and tested |
| `@{view}` (LESS interpolation) | One character away, rejected by the mandatory colon |
| `@{view: x}` (idiomatic Objective-C) | The space fails the name pattern; only the tight form parses |

Parsing the token is not engaging: the line must be alone, the named template
must resolve, and the payload must be the supported two-column table or absent
entirely (bare summons a static view; a data-driven view summoned bare renders
hollow and falls back to the raw line). Any layer failing leaves the zone exactly
as written. The fenced carrier has no collision surface with language syntax at
all — it requires a markdown fence of its own.
