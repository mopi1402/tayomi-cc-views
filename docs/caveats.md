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

More than one MessageDisplay hook can be registered, and all take effect. The host runs them in sequence, hands EACH the ORIGINAL delta (never its predecessor's output), and puts on screen the LAST defined `displayContent` it collected: the last to answer wins, and an earlier answer, a suppression included, is overwritten wholesale (read off the 2.1.228 binary, 2026-08-11; an earlier note here had the first consuming, which that reading retires). Nothing crosses over: a tag resolves only inside a view its own engine rendered.

The order is still not yours to choose, but which engine CONSUMES no longer follows from it. Each one announces itself on a machine-wide register (its path, its version and the view NAMES it can resolve, one file apiece), and an engine stands aside on a view a strictly newer peer also has: that zone is left exactly as written, decorator and payload, and reaches the newer engine as the model wrote it. So the newest installed engine draws whichever the dispatcher calls first, and a checkout under development wins over a copy a plugin installed months ago without a publish standing between them.

Per ZONE, and that is the whole of it. A view only one engine has is drawn by that engine, with its own templates and its own host's colours, whoever else is registered: standing down for a whole MESSAGE takes every other zone in it down too, and a view nobody left can draw reaches the screen as raw text. Nothing is borrowed and nothing travels: a `.view` stays a file its own engine reads, and a `{{tag}}` stays a colour its own host registered.

The register's twin needs no register at all: a name an engine's own search path cannot RESOLVE never opens a zone for it. The run streams as prose, nothing is withheld, and the engine says NOTHING for those flushes, so whoever holds the template draws it whatever the dispatcher's order. Before that rule, an engine sharing the version but not the template withheld the zone and re-emitted it raw at the close, a defined answer that overwrote the holder's render whenever it landed later, one message out of a few (measured 2026-08-12: two hooks on this machine ran the repo's engine, which has no `tldr`, beside the plugin's, which does).

Every failure to read that register means DRAW, never a silence: an unreadable directory, a malformed claim, a version that does not parse, a peer whose path is gone, a claim older than an hour. `CC_VIEWS_NO_YIELD` turns the mechanism off for a contributor who wants their own engine to draw regardless, and off means draw for the same reason.

> **Boundary:** Claude Code's dispatcher owns the order, and the engine never reads its settings or its plugin manifests to learn who else is registered. Each engine answers for itself alone, which is the one claim that cannot go out of date. An engine too old to carry this cannot stand down, so it reaches a consumer by one install like any other change.

### A flush nobody answers is drawn by the host, and stays

A hook that answers no `displayContent` hands the delta to Claude Code's own display, and a delta once shown is never retracted. An EMPTY `displayContent` is not that: the host reads any DEFINED value as the delta's replacement and only an OMITTED one as "display the original" (read off the 2.1.228 binary, 2026-08-11), so `""` is the protocol's own suppression and the engine answers every wholly-withheld flush with it. On an incomplete prefix the delta renders ALONE, the engine's own withholding applied, rather than going back to the host with a zone opening in it.

The corollary is the ECHO rule: an answer IDENTICAL to the delta is withheld, and the engine answers null instead. Alone the two spell the same screen, "show the original"; in a chain the identical copy was a DEFINED answer, and the dispatcher keeping the last of those let it replace the render a peer had answered for the same flush (measured 2026-08-12). So prose of an engaged message, a zone left for a newer peer, and a zone this engine cannot resolve are all answered the same way: silence.

What a suppression cannot survive is a PEER LATER IN THE ORDER (see above: the last defined answer wins). And one asymmetry survives the register: a shape one grammar added later, the fence under a decorator say, is not a ZONE to an older engine at all. Malformed to it, it falls through to the BODY and is answered as written, overwriting the newer engine's suppression with the raw fragment. What leaks is worse than its own lines: the fragment's unclosed fence leaves the host's markdown INSIDE a code block, and everything after it in the message renders unstyled, literal stars included (measured 2026-08-11). The cure is never a rule here: it is the newer engine reaching that install.

> **Release rule that follows:** extending the GRAMMAR, any new shape a zone can take, ships to every install running beside this one before a model writes it, or the oldest engine answers the new shape raw over everyone else. A new view NAME costs nothing: to an engine whose search path lacks it the zone never opens, prose streams as prose, and the holder draws it whatever the order.

## Side effects

| Effect | Scope | Boundary |
| --- | --- | --- |
| Markdown around a view shows as plain text | Only messages that engage; the hook contract is per-message and all-or-nothing | Claude Code's contract |
| An interrupted message never reveals what was withheld | That message alone, no final flush ever arrives | Claude Code's dispatcher |
| Headless (`claude -p`) shows plain data | End-to-end checks are manual; everything below `handleMessageDisplay` stays unit-testable | Claude Code: no display to hook |
| A colour the HOST opened is not resumed after an engine span | A code span, chip or bold span sitting inside a sequence the engine did not write; the reset still happens there | Deliberate: the engine tracks its own marks, never arbitrary sequences on the line |
| A `<br>` inside a diagram label breaks the box drawn around it | Diagram views only: the label's first line goes, and the frame's left edge with it | The renderer's own layout (termaid 0.8.0, measured 2026-08-12, at two widths). A title in mermaid frontmatter is dropped the same way, silently. The briefing names the constraint, so a model keeps labels on one line |
| A backtick or a star a drawn line shows is a lookalike (U+02CB, U+2217), never the character itself | Only what survives resolution as TEXT: a tick a span holds, an orphan, a star the bold pass did not spend. Resolved delimiters were never text at all, and the BODY a block falls through to keeps its own | Claude Code re-reads the drawn message as markdown: a literal pair is a delimiter there, eaten off the very rows the layout had squared, and stars pair ACROSS LINES, slanting whole stretches of a table (both measured 2026-08-11). The engine draws what markdown cannot eat |

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
