## target

An engine-inserted span ends by CLEARING the style instead of RESTORING the one it interrupted, so the rest of the line loses the colour the template opened. Three sites do it, all with the same primitive:

- `renderCode` (`style.ts:503`) emits `${TAGS.code}${x}${R}`, a raw full reset.
- `chip` (`style.ts:209`) closes on `RESET_MARK`.
- `cell`'s authored bold span (`decorator.ts:101`) closes on `RESET_MARK`.

The template author cannot compensate for any of them, which is what makes it a bug rather than a semantic. A line reading `{{dim}}- Read ${trace}{{/}}` cannot know where the model put a backtick, so it cannot re-open its own colour after one. Observed on the tldr box: a trace item is dim until its first code span and plain white for the rest of the line.

The fix is one notion the engine does not have yet: the style currently OPEN, known at the moment a span ends. `fitCell` (`measure.ts:49`) already keeps half of it, a boolean saying a style was interrupted so the ellipsis can close it; a restore needs the same state carrying the tag's NAME.

## non-goals

- No change to `{{/}}` in a template. An author's own reset stays a reset. Making it restore would be a language change, would shift every existing view, and the author who writes it already knows what is open.
- No style STACK and no nesting in the language. The rule stays flat: the most recent tag that is not a reset is what a restore re-opens.
- No change to any colour, to the palette, or to which tag a span renders in.
- No tracking of raw ANSI the engine did not emit. A host's own coloured output and `strict.failedLine` carry sequences rather than marks, so a code span inside those still resets. That boundary is named in this ticket, not closed by it.
- No change to widths. This ticket must move no wrap point and no column.
- No new runtime dependency.

## hard-constraints

- ONE notion of the open style, shared, never a third private copy. `fitCell` keeps a boolean today and this fix needs the tag name; whichever module ends up owning it, the cutter reads the same thing rather than keeping its own.
- The terminator the ENGINE inserts becomes a RESTORE mark, distinct from `RESET_MARK`, and it resolves late, in the pass that already turns marks into sequences. It cannot resolve early: `renderCode` runs before `fillTone` and `renderTags` (`render.ts:82`), so at the moment a code span is built the enclosing style is still an unresolved mark and, if it is the tone slot, is not yet even a colour.
- Resolving a restore therefore makes the tag pass STATEFUL. `renderTags` is a plain `.replace` today (`style.ts:460`); it gains the walk that `measure.ts` and `wrap.ts` already do with `TAG_AT`, and it is the only place that decides what a restore becomes.
- A restore with nothing open resolves to a plain reset, so a code span outside any styled region renders byte-identically to today. This is the case the whole existing corpus is made of, and it is what makes this fix safe to land.
- A restore mark is ZERO COLUMNS, like every other mark, which means `isTag` must know its name or the measurer will count it as text and every width on the line will be wrong. This is the trap of the change: the failure is silent, it moves wrap points rather than raising anything, and it is why the width gate below is not a formality.
- The mark's name is a constant in the data layer beside the others, never retyped, and every matcher composes from it.
- A restore re-opens the most recent non-reset tag, tone slot included, resolved to whatever the tone was filled with rather than to the literal word.

## acceptance

1. Given a template line opening `{{dim}}`, carrying prose with an inline code span, and closing `{{/}}`, When it renders, Then the text after the span is dim again, the span itself is in the code colour, and the dim still closes at `{{/}}`.
2. Given the same line with NO enclosing tag, When it renders, Then the output is byte-identical to today's.
3. Given a `${field:mapname}` chip and an authored `**bold**` span in a decorated cell, each inside a styled region, When each renders, Then the region's style resumes after it.
4. Given a line where two tags open in a row with no reset between them, When a code span ends inside it, Then the most recently opened tag is what resumes.
5. Given a line spending `{{tone}}` around a code span, When it renders under a carrier naming a class, Then what resumes is the class the tone slot was filled with, not the literal tone tag.
6. Given any line carrying a restore, When it is measured and when it is wrapped, Then its printed width is the same as the same line without the restore, and no wrap point moves.
7. Given a line whose enclosing colour came from the HOST rather than from a tag, When a code span ends inside it, Then the reset still happens, and the caveat says so.

## tasks

- Add the restore mark's name to the data layer beside the other marks, and make `isTag` (or whatever the measurer consults) recognise it so it costs zero columns. (AC: 6)
- Track the open tag where the open tag is known, and have `fitCell` read that notion instead of keeping its own boolean. (AC: 1, 4)
- Turn `renderTags` into the stateful walk that resolves a restore: to the most recent non-reset tag, or to a plain reset when nothing is open. (AC: 1, 2, 4, 5)
- Close `renderCode`'s span, `chip`'s span and `cell`'s bold span on the restore mark instead of `R` and `RESET_MARK`. (AC: 1, 3)
- Extend `src/style.test.ts` with the enclosing tag, the bare span (byte-identical), two tags in a row, and the tone slot. Assert through named sequences, never through a raw escape written out. (AC: 1, 2, 4, 5)
- Extend `src/layout/measure.test.ts` and `src/layout/wrap.test.ts` with a line carrying a restore, asserting its width equals the same line without one and that no wrap point moves. (AC: 6)
- Extend `src/carrier/decorator.test.ts` with the bold span inside a styled cell. (AC: 3)
- Add one line to `docs/caveats.md`: a colour the HOST opened is not restored after a code span, because the engine tracks its own marks and not sequences it did not write. (AC: 7)
- Document the restore in `docs/view-language.md` where inline styling is described, in one sentence: an engine-inserted span resumes the style it interrupted, and `{{/}}` still means reset.

## done-when

```yaml
# The three sites and the resolution rule.
- id: style-tests
  verify: pnpm vitest run src/style.test.ts
  pass-if: exit == 0
# The silent failure mode: a mark the measurer does not know is counted as text and every width on the line is wrong.
- id: width-tests
  verify: pnpm vitest run src/layout/measure.test.ts src/layout/wrap.test.ts
  pass-if: exit == 0
# The bold span the decorator inserts into a cell.
- id: decorator-tests
  verify: pnpm vitest run src/carrier/decorator.test.ts
  pass-if: exit == 0
# The no-regression floor: the whole corpus renders code spans outside any styled region, and that path must not move.
- id: suite-green
  verify: pnpm test
  pass-if: exit == 0
- id: sidecars
  verify: pnpm check:sidecars
  pass-if: exit == 0
- id: typecheck
  verify: pnpm typecheck
  pass-if: exit == 0
- id: lint
  verify: pnpm lint
  pass-if: exit == 0
# Renders the packaged views from the installed tarball, which is where a width that moved would show as a box that no longer lines up.
- id: pack-renders
  verify: pnpm verify:pack
  pass-if: exit == 0
```

## clarifications

- Origin, observed by the human on 2026-08-02 on a live tldr render: a trace item opens dim, its first inline code span ends on a full reset, and every character after it is plain white for the rest of the line.
- Scope, decided by the human on 2026-08-02: a separate ticket, independent of `feat/banner-kinds` and of `fix/carrier-guards`. It touches the style layer rather than a carrier, and it is reproducible on any view that puts a code span inside a colour.
- Author's call, open to challenge: `{{/}}` keeps meaning reset. Only the terminators the ENGINE inserts change, because those are the ones no author can see coming.
- Author's call, open to challenge: the restore re-opens the most recent non-reset tag, flatly, with no stack. A stack would let `{{a}}{{b}}code{{/}}` resume `a`, which no template in this corpus asks for and which would need the language to say what nesting means.
- Author's call, open to challenge: a restore is a MARK resolved late rather than a sequence emitted early. Early is impossible for the tone slot, which has no colour yet when `renderCode` runs, and a rule that works for two of three cases is the kind that rots.
- Boundary left standing: a colour the host itself opened is not restored, because the engine tracks marks and not arbitrary sequences. Written into `docs/caveats.md` rather than fixed.
