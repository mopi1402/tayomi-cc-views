## target

An engine-inserted span ends by CLEARING the style instead of RESTORING the one it interrupted, so the rest of the line loses the colour the template opened. Three sites do it, all with the same primitive:

- `renderCode` (`style.ts:503`) emits `${TAGS.code}${x}${R}`, a raw full reset.
- `chip` (`style.ts:209`) closes on `RESET_MARK`.
- `cell`'s authored bold span (`decorator.ts:101`) closes on `RESET_MARK`.

The template author cannot compensate for any of them, which is what makes it a bug rather than a semantic. A line reading `{{dim}}- Read ${trace}{{/}}` cannot know where the model put a backtick, so it cannot re-open its own colour after one. Observed on the tldr box: a trace item is dim until its first code span and plain white for the rest of the line.

The fix is one notion the engine does not have yet: the style currently OPEN, known at the moment a span ends. `fitCell` (`measure.ts:49`) already keeps half of it, a boolean saying a style was interrupted so the ellipsis can close it; a restore needs the same state carrying the tag's NAME.

## non-goals

- No change to `{{/}}` in a template. An author's own reset stays a reset. Making it restore would be a language change, would shift every existing view, and the author who writes it already knows what is open.
- No style STACK and no nesting IN THE LANGUAGE. `{{/}}` still clears everything, so `{{a}}{{b}}x{{/}}` renders the bytes it always did and no author gains nesting. The RESOLVER holds a stack that only an engine span's terminator pops, and depth passes one only where the engine opened a span inside an author's tag. Amended 2026-08-02; the original flat rule could not satisfy AC3, see the clarifications.
- No change to any colour, to the palette, or to which tag a span renders in.
- No tracking of raw ANSI the engine did not emit. A host's own coloured output and `strict.failedLine` carry sequences rather than marks, so a code span inside those still resets. That boundary is named in this ticket, not closed by it.
- No change to widths. This ticket must move no wrap point and no column.
- No new runtime dependency.

## hard-constraints

- ONE notion of the open style, shared, never a third private copy. `fitCell` keeps a boolean today and this fix needs the tag name; whichever module ends up owning it, the cutter reads the same thing rather than keeping its own.
- The terminator the ENGINE inserts becomes a RESTORE mark, distinct from `RESET_MARK`, and it resolves late, in the pass that already turns marks into sequences. It cannot resolve early: `renderCode` runs before `fillTone` and `renderTags` (`render.ts:82`), so at the moment a code span is built the enclosing style is still an unresolved mark and, if it is the tone slot, is not yet even a colour.
- Resolving a restore therefore makes the tag pass STATEFUL. `renderTags` is a plain `.replace` today (`style.ts:460`); it gains the walk that `measure.ts` and `wrap.ts` already do with `TAG_AT`, and it is the only place that decides what a restore becomes.
- A restore with nothing open resolves to a plain reset, so a code span outside any styled region renders byte-identically to today. This is the case the whole existing corpus is made of, and it is what makes this fix safe to land.
- A restore mark is ZERO COLUMNS, like every other mark. Amended 2026-08-02: it is a C0 control in `src/data/marks.ts`, so zero columns is a property of its TYPE (`width.ts` counts a C0 as none) rather than a wiring the measurer has to remember at three call sites. `isTag` is untouched, and must stay so: a tag-shaped mark would need a name the palette answers for, which is a name a carrier may fill the tone slot with, and a message writing `tone: ^` would then rewrite every `{{tone}}` in a template into the engine's own terminator. The width gate below stays, as the proof rather than as the wiring.
- The mark's name is a constant in the data layer beside the others, never retyped, and every matcher composes from it.
- A restore closes exactly the tag ITS OWN SPAN opened and re-opens what stands under it, tone slot included, resolved to whatever the tone was filled with rather than to the literal word. Amended 2026-08-02: two of the three sites open on a tag, so "the most recent non-reset tag" is the span's own opener and re-opens the chip it was closing.
- Where a span's opener is a name the palette cannot answer for, which only `@map`'s chip can produce, the span clears instead. An unknown name is text and opens nothing, so a restore there would close the style the span is sitting in.

## acceptance

1. Given a template line opening `{{dim}}`, carrying prose with an inline code span, and closing `{{/}}`, When it renders, Then the text after the span is dim again, the span itself is in the code colour, and the dim still closes at `{{/}}`.
2. Given the same line with NO enclosing tag, When it renders, Then the output is byte-identical to today's.
3. Given a `${field:mapname}` chip and an authored `**bold**` span in a decorated cell, each inside a styled region, When each renders, Then the region's style resumes after it.
4. Given a line where two tags open in a row with no reset between them, When a code span ends inside it, Then the most recently opened tag is what resumes.
5. Given a line spending `{{tone}}` around a code span, When it renders under a carrier naming a class, Then what resumes is the class the tone slot was filled with, not the literal tone tag.
6. Given any line carrying a restore, When it is measured and when it is wrapped, Then its printed width is the same as the same line without the restore, and no wrap point moves.
7. Given a line whose enclosing colour came from the HOST rather than from a tag, When a code span ends inside it, Then the reset still happens, and the caveat says so.
8. Given any input at all, When the PUBLIC `renderCode` renders it, Then the bytes are the ones 0.1.1-rc.14 wrote: sequences, no markup, no mark. Added 2026-08-02, and it is the only thing standing between this fix and a silent break in every host colouring its own lines.

## tasks

- Add the restore mark to `src/data/marks.ts` as a C0 beside the other three, and enrol it in `CONTROL_MARKS`, which is what buys the zero-column and no-escape assertions already written there. `isTag` is NOT touched. (AC: 6)
- Track the open tags where they are known, and have `fitCell` read that notion instead of keeping its own boolean. It still closes on a RESET, which clears them all: a cut may have left two open and a restore closes one. (AC: 1, 4)
- Turn `renderTags` into the stateful walk that resolves a restore: close the tag the span opened, re-open what stands under it, or a plain reset when nothing is open. (AC: 1, 2, 4, 5)
- Close `chip`'s span and `cell`'s bold span on the restore mark instead of `RESET_MARK`, and split `renderCode` into the internal `markCode` the render chain spends and the public `renderCode`, whose bytes do not move. (AC: 1, 3, 8)
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
- Author's call, open to challenge: a restore is a MARK resolved late rather than a sequence emitted early. Early is impossible for the tone slot, which has no colour yet when `renderCode` runs, and a rule that works for two of three cases is the kind that rots.
- **Retracted 2026-08-02.** The original rule read: "the restore re-opens the most recent non-reset tag, flatly, with no stack. A stack would let `{{a}}{{b}}code{{/}}` resume `a`." Both halves were wrong. The rule cannot satisfy AC3: `renderCode`'s opener is a raw sequence invisible to the walk, but `chip`'s and the bold span's openers ARE tags, so on `{{dim}}x {{success}} OK ⟨restore⟩ y{{/}}` the most recent non-reset tag is `success` and the chip re-opens itself, painting the rest of the line. And a stack does not resume `a` on `{{a}}{{b}}code⟨restore⟩`: `b` sits above `a`, so `b` resumes, which is AC4's literal requirement. The objection described a double pop, not a stack.
- Three findings from three independent reviews of the LANDED change, all reproduced by execution before being acted on, all fixed in the same ticket because each is the target's own sentence at a site the target failed to list. (6) `wrap.ts` blanks a continuation's prefix and keeps what is a TAG, so the new terminator was dropped there and a chip in a bullet or a label painted every wrapped row in its own fill, out to the border: a regression this change introduced, and the only one. (7) `fitCell` closed a cut cell on a reset, which killed the colour the TEMPLATE opened around the cell and printed the ellipsis and the rest of the line plain: the ticket's own defect at a fourth site, now one resume per tag the cut left open. (8) `inert` neutralises braces and not the reserved codes, so a message spelling U+0004 in its JSON could end a span and close a colour the template opened: the first reserved code whose effect is presentation, and the seam `architecture.md` exists to hold, so the codes now come off with the braces.
- Boundary left standing, and CLOSED since by `fix/span-frame` (2026-08-02): a `{{tag}}` a TEMPLATE writes INSIDE a code span is stacked above the span's own opener, so the resume closes the tag and leaves the code colour standing. Named rather than fixed here, on the reading that closing it needed a marker in the mark or an inert span body. The first of those turned out to be a second C0 marking the span's OPENING, which costs no width and no language change, so the caveat came out. The entry also understated the defect: what leaks is the body's LAST tag rather than the code colour, and it leaks with nothing open at all, which breaks this ticket's own AC2.
- Five amendments signed by the human on 2026-08-02, after three independent design reviews reached the same verdict: (1) the resolution rule becomes a pop, above; (2) the "no stack" non-goal is re-scoped to the language, which it already governs; (3) the mark is a C0 in `data/marks.ts` rather than a tag shape, which voids the `isTag` constraint and its task; (4) a restore replays every style still open under the span, not only the innermost, so nothing is lost where two tags were open; (5) `renderCode` keeps its public bytes and the render chain calls a new internal `markCode`, since a consumer test in the TAYOMI plugin pins today's ANSI output.
- Found while implementing and then RETRACTED on review: `layout/aside.ts` and `layout/box.ts` were read as carrying the same defect. They do not. Every reset there is followed either by end of line or by the border re-opening, and the separator's reset only closes what the art column left open, which is raw ANSI with no tag in it. Same shape, different situation. And the swap would not be one token: `box.ts` writes a tag whose name it says in its own comment it cannot vouch for, so a resume there would need `spanClose`, which is exactly why that rule is a function and not three copies.
- Boundary left standing: a colour the host itself opened is not restored, because the engine tracks marks and not arbitrary sequences. Written into `docs/caveats.md` rather than fixed.
