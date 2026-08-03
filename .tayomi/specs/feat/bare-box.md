## target

Give `@box` a BARE mode, a container that runs the body machinery and draws no chrome, so a frameless view can wrap.

`frameBox` is the only place in this engine that wraps a template's lines (`box.ts:113`), with `composeAside` the sole other caller of `wrapLine`. Everything that rides on wrapping rides on it too: the hanging indent a declared `bullet=` sets up, and the gutter bar `blankPrefix` keeps on a continuation row with its tags. Outside a box, none of it happens: a body line and an `@each` row alike are emitted whole, and the terminal soft-wraps them at column zero, under the label rather than under the content.

That is the ceiling under all three frameless packaged views. `columns.view` loses its separator on any row that folds, `quote.view` loses the bar that is its entire identity, and `lines.view` cannot draw a measured rule at all: `RULE_MARK` is consumed by the framer alone, and inside an `@each` the inner lines go straight to substitution where a directive is not read. It therefore ships a literal forty-glyph run, derived from `MIN_WIDTH` so it never exceeds the narrowest canvas the engine composes for, which is correct on that canvas and absurd on a wide terminal, where a forty-column rule sits under a hundred-and-fifty-column row.

A bare box fixes the four at their common cause, per template and with nothing existing opted in.

## non-goals

- No global wrap in `renderView`. Wrapping every top-level line would change the output of every view ever written and would need `banner.view` exempted by name; the whole value here is that a template ASKS.
- No change to a single rendered byte of `banner.view`, `welcome.view`, `tayo.view`, `columns.view` or `quote.view`. The band stays unmeasured on purpose, its own header says so.
- No migration of `columns.view` or `quote.view` onto the new mode. Both would also have to trade `│` for `▎`, the only glyph `IS_KEPT` preserves, which changes what they draw. That is a separate decision with its own eye test.
- No new meaning for `@head`, `@right`, `@foot` or `@frame` in bare mode, and no bare-mode title, badge or zone.
- No nesting. `@box` is deliberately not nestable and stays so, bare or framed.
- No change to `@aside`: neither its `ASIDE_MIN_MAIN` floor nor the `BOX_CHROME` it subtracts with no box present. That last one is a real wart and it is not this task.
- No new module. `box.ts` owns framing, and bare is one concept with framed, not two.

## hard-constraints

- The word is a token ON `@box`, declared in `src/data/language.ts` like every other word of the language, and the matcher composes from it. `pnpm check:vocabulary` gates this and will fail on a spelling typed into a regex.
- Parsed in TWO steps on the `@aside` precedent, the directive then its token, and an UNRECOGNISED token is a near-miss: the line prints as body text and swallows nothing. A single regex with an optional quantified group backtracks on a near-miss, which is why `ASIDE_RE` and `EACH_RE` are already written this way. A `@box bare` typo must never silently render a framed box.
- Bare mode does not recognise `@head`, `@right`, `@foot` or `@frame`. They fall through to the body and print literally, which is EXACTLY what they already do outside any box today (measured: a template carrying all four with no `@box` renders the four lines as text). Nothing new is invented, and an author who writes a title into a bare box sees it on screen rather than losing it in silence.
- The body machinery is SHARED with the framed path and never copied: the wrap, the blank-run collapsing, the hanging indent, the rule filling. Two functions each wrapping their own body is how the two grow different ideas of what a blank run is.
- A bare box wraps at `limit`, with no `BOX_CHROME` to subtract, since there is no border to fit inside.
- A bare box keeps the box's own width law and sizes to its CONTENT, not to the terminal: `total` is the widest line after wrapping. So `@rule` inside it fills that width and no more. A rule running to the terminal's edge under a short body would be the one piece of furniture louder than the content it divides.
- `@rule` resolves inside a bare box, so no `RULE_MARK` reaches the screen. The mark is a C0 control that prints nothing and is invisible to every other assertion, so this is stated as its own case.
- `@rule` becomes the ONE directive an `@each` body honours, and this task cannot be done without it. An `@each`'s inner lines go straight to substitution today, so a rule written inside a loop prints as the five characters `@rule`, and a divider BETWEEN items is a thing only the loop can place. No view known to this repo or to the TAYOMI plugin puts one there, so nothing rendered today can move. Everything else inside an `@each` stays a line of the item.
- The rule a loop draws under every item is turned into one drawn BETWEEN them by the container's blank-run collapsing, which already keeps a rule only between two lines that printed. Nothing counts iterations, and nothing needs to: the language has no conditional and this task does not give it one.
- `views/lines.view` is rewritten onto the mode and loses its literal forty-glyph run, along with the two paragraphs of its header that exist only to justify that run. Its rule becomes `@rule`, measured.
- `box.ts` answers for bare mode in its own sidecar, `box.test.ts`, not through the views that use it. The near-miss token belongs to `directives.test.ts`, beside the matcher that has to reject it.
- `tests/integration/bundled-views.test.ts` pins the new `lines.view` output, including a row long enough to FOLD: the wrap is the whole point and a suite fed only short rows cannot see it. Its existing assertion that the rule is one fixed length is replaced by one that reads the rule against the body it divides.
- The rendered corpus of every other bundled view is unchanged, which the existing suite already proves by having no reason to go red.
- `docs/view-language.md` gains the token under the `@box` section, and `docs/architecture.md` gains the fact that wrapping now has a second entry point. A behaviour change lands with its documentation.

## done-when

```yaml
# The framer's own contract: bare mode's wrap, its width law, its rule, and the chrome directives falling through.
- id: box-tests
  verify: pnpm vitest run src/layout/box.test.ts
  pass-if: exit == 0
# The matcher's contract: the token recognised, and an unknown one a near-miss that prints rather than swallows.
- id: directive-tests
  verify: pnpm vitest run src/template/directives.test.ts
  pass-if: exit == 0
# The rewritten lines.view, folded on a long row, plus the four other bundled views unchanged.
- id: bundled-views
  verify: pnpm vitest run tests/integration/bundled-views.test.ts
  pass-if: exit == 0
# A new word of the language may not be spelled anywhere outside src/data/.
- id: vocabulary
  verify: pnpm check:vocabulary
  pass-if: exit == 0
# The whole corpus, which is what proves no existing view moved.
- id: suite-green
  verify: pnpm test
  pass-if: exit == 0
- id: typecheck
  verify: pnpm typecheck
  pass-if: exit == 0
- id: lint
  verify: pnpm lint
  pass-if: exit == 0
# The rewritten lines.view drawn from the INSTALLED tarball, where a control mark reaching the screen is already gated.
- id: pack-renders
  verify: pnpm verify:pack
  pass-if: exit == 0
```
