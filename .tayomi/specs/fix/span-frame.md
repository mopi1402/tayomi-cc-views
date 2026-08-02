## target

An engine-inserted span terminates by popping ONE entry off the open-tag stack, and a span can have pushed several: its own opener, plus every `{{tag}}` its body contained. So what comes back after the span is not the style the span interrupted but the last one its body opened.

Measured 2026-08-02 on `renderTags(markCode(...))`, four forms, the first as the control:

| source | what paints the text after the span |
| --- | --- |
| `` {{dim}}see `ab` end{{/}} `` | `dim`, correct |
| `` {{dim}}see `a {{gold}}b` end{{/}} `` | `dim` then the code colour, so code |
| `` {{dim}}see `a {{gold}}b {{green}}c` end{{/}} `` | `dim`, code, then `gold` |
| `` see `a {{gold}}b` end `` | the code colour, with nothing open at all |

The last row is the one that makes this a bug rather than a rough edge: with NO enclosing tag the line must render byte-identically to a build that never had a resume mark, and it does not. `fix/style-restore` named this as a boundary left standing and understated it, saying the code colour leaks; what leaks is whichever tag the body wrote last, and it leaks with nothing open.

Two walkers carry the same rule and both are wrong the same way: `resumeTags` (`style.ts:526`), which resolves a resume, and `fitCell` (`measure.ts:101`), which counts one resume per stack entry to close a cut.

Only a TEMPLATE can reach it. A message's braces are neutralised by `inert` before they can reach a span, and no view shipped in this package writes a tag between backticks, so nothing on screen today is wrong. It is the third-party template author's trap, and it is silent: the author sees a colour, never an error.

## non-goals

- No change to `{{/}}`. An author's own reset still clears everything.
- No stack IN THE LANGUAGE. Depth stays an artefact of the resolver, exactly as `fix/style-restore` left it.
- No change to any colour, to the palette, or to which tag a span renders in.
- No change to the PUBLIC surface of `src/index.ts`. The new mark is internal, like the resume it pairs with.
- No lifting of the unknown-opener rule. `spanClose` still answers RESET for a name the palette cannot resolve, and that stays true even though a frame would make a resume safe there: it is a real simplification and it is a SEPARATE decision, named here so the next reader knows it was seen and declined rather than missed.
- No change to the host-colour boundary. A sequence the engine did not write is still not tracked, and `docs/caveats.md` keeps that row.
- No change to widths. This ticket must move no wrap point and no column.
- No new runtime dependency.

## hard-constraints

- A span's OPENING becomes markable, the way its closing already is. The resume then ends a FRAME (the opener and everything the body pushed on top of it) rather than one entry.
- The opening mark is a C0 control in `src/data/marks.ts`, enrolled in `CONTROL_MARKS`, for the same three reasons the resume is: `width.ts` counts a C0 as zero columns by TYPE rather than by a wiring three call sites must remember, `dropControl` strips it from message text for free, and the assertions `data/marks.test.ts` runs over the alphabet cover it on arrival. It is NOT a tag shape, for the reason `fix/style-restore` recorded: a tag-shaped mark needs a name the palette answers for, and that is a name a carrier can put in the tone slot.
- ONE rule for what a resume pops, written once and READ by both walkers. `resumeTags` and `fitCell` derive from it; neither restates it. A second copy is how the resolver and the cutter come to disagree about a cell, which is a colour and never an error.
- `fitCell`'s terminator DERIVES from that same rule rather than counting stack entries. One resume no longer means one entry, so `RESUME_MARK.repeat(open.length)` stops being the number of resumes that unwinds a cut.
- A frame boundary left on the stack resolves to NOTHING when a resume replays what stands under it. Engine spans nest (a chip's label can carry a code span), so a replay walks over boundaries belonging to frames still open.
- Where a frame's opening mark survives into a wrapped continuation prefix, it is KEPT, like the resume and the tags already are. `blankPrefix` (`wrap.ts:74`) blanks what it does not recognise, and dropping one end of a span while keeping the other is the exact defect that shipped and was caught in `fix/style-restore`.
- A body containing no tag inside any engine span renders BYTE-IDENTICALLY to 0.1.1-rc.14 with `fix/style-restore` applied. That is the entire current corpus, and it is what makes this safe to land.

## acceptance

1. Given a template line opening `{{dim}}`, containing an inline code span whose body writes `{{gold}}`, and closing `{{/}}`, When it renders, Then the text after the span is `dim` again and carries neither the code colour nor `gold`.
2. Given the same line whose span body writes two tags, When it renders, Then the text after the span is still `dim` alone.
3. Given a line with NO enclosing tag whose code span body writes a tag, When it renders, Then the text after the span is plain, byte-identical to the same line with the tag moved outside the backticks.
4. Given an engine span NESTED inside another (a `${field:map}` chip whose label carries an inline code span), When the inner span ends, Then the outer span's own style resumes, and when the outer ends, Then what stood before it resumes.
5. Given a capped column whose value is cut mid-span and whose span body wrote a tag, When the cell is fitted, Then the ellipsis and everything after the cell print in the colour the TEMPLATE opened around it, neither the code colour nor the body's tag.
6. Given any line carrying the new mark, When it is measured and when it is wrapped, Then its printed width equals the same line without the mark and no wrap point moves.
7. Given a wrapped line whose continuation prefix holds an engine span, When the prefix is blanked, Then both ends of the span survive it and no continuation row is painted in the span's own style.
8. Given a `${field:map}` chip whose class the palette cannot resolve, When it renders, Then it still CLEARS, unchanged by this ticket, and a test says so.
9. Given any input at all, When the PUBLIC `renderCode` renders it, Then its bytes are unchanged: sequences, no markup, no mark.

## tasks

- Add the frame's opening mark to `src/data/marks.ts` beside the other four and enrol it in `CONTROL_MARKS`. (AC: 6)
- Give `style.ts` the opener that mirrors `spanClose`, and the ONE pop rule both walkers read. Have `resumeTags` end a frame instead of an entry, and skip a boundary when it replays. (AC: 1, 2, 3, 4)
- Emit the opening mark from the three sites that already emit the closing one: `markCode`, `chip`, and `cell`'s bold span. (AC: 1, 4, 5)
- Teach `fitCell` the new mark, and derive its terminator from the shared pop rule instead of counting entries. (AC: 5, 6)
- Keep the opening mark through `blankPrefix` in `wrap.ts`. (AC: 7)
- Extend `src/style.test.ts` with the enclosing tag, two tags in the body, the bare line, the nested spans, and the unresolvable chip that still clears. Assert through named sequences, never through a raw escape written out. (AC: 1, 2, 3, 4, 8, 9)
- Extend `src/layout/measure.test.ts` and `src/layout/wrap.test.ts` with the cut span carrying a tag, the width equality, and the prefix keeping both ends. (AC: 5, 6, 7)
- Extend `src/carrier/decorator.test.ts` with a bold span whose body writes a tag. (AC: 4)
- Remove the row `docs/caveats.md` carries for this defect, since the boundary closes. Leave the host-colour row standing.

## done-when

```yaml
# The pop rule and the three sites that spend it.
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
# The reserved alphabet: zero columns, no escape, stripped from message text, all inherited by enrolment.
- id: marks-tests
  verify: pnpm vitest run src/data/marks.test.ts
  pass-if: exit == 0
# The no-regression floor: the whole corpus writes no tag inside a span, so it must not move.
- id: suite-green
  verify: pnpm test
  pass-if: exit == 0
- id: sidecars
  verify: pnpm check:sidecars
  pass-if: exit == 0
- id: vocabulary
  verify: pnpm check:vocabulary
  pass-if: exit == 0
- id: typecheck
  verify: pnpm typecheck
  pass-if: exit == 0
- id: lint
  verify: pnpm lint
  pass-if: exit == 0
# Renders the packaged views from the installed tarball at two widths, which is where a width that moved would show as a box that no longer lines up.
- id: pack-renders
  verify: pnpm verify:pack
  pass-if: exit == 0
```

## clarifications

- Origin: the boundary `fix/style-restore` named and left standing, reopened on 2026-08-02 after the reproduction above showed it was understated. The caveat claimed the code colour leaks past the span; what leaks is the last tag the body wrote, and the leak happens with nothing open, which the earlier ticket's own AC2 forbids.
- Priority, decided from evidence rather than felt: LOW urgency, since `grep` over `views/*.view` finds no shipped template writing a tag between backticks, and a message cannot reach the case at all. It is a correctness debt an author trips over, not a defect on any screen today.
- Author's call, open to challenge: the frame is marked at the span's OPENING rather than carried in the resume. A resume that named what it closes would need a payload, which makes the mark a shape with a name, and a name is the thing `fix/style-restore` proved a carrier can inject through the tone slot.
- Author's call, open to challenge: `spanClose` keeps its reset branch for an unresolvable name. A frame makes a resume correct there, so the branch could go and the chip would restore instead of clear. That is a behaviour change on a path a `@map` reaches, so it is its own decision and AC8 pins the current answer until someone takes it.
- Found while implementing, and it is the one thing the contract did not anticipate: the CUT has to open a frame of its own. A value's bare tags belong to no span, so the resume closing them finds no boundary and unwinds the ROW's tags with the cell's, which is the colour the template opened around the cut. `fitCell` therefore emits a boundary at the head of what it keeps, and counts its frames on the stack the ROW will see rather than on the value's own, which are two different numbers the day a value leaves only a boundary standing (a chip whose class the palette cannot answer for). Both are pinned.
- Proof, 16 mutations over the six files this touched, each breaking ONE decision: all 16 red, and the three that survived a first pass were real gaps rather than equivalent mutants. Counting frames on the value's stack instead of the row's, and blanking the boundary out of a wrapped prefix, both needed a case written for them; the third was an artefact of the harness, a mutant that broke the module's imports and reported as a survivor because no test ran at all.
- Widened while here, since the ticket's own mark made the gap visible: `verify-pack` asserted that codes 1 through 4 stay off the screen, a list that needed an edit for every mark the engine claims. It now asserts the whole C0 range minus the newline and the escape, which needs none.
- Sizing, stated for the reviewer: this is a piece added to a machine that already exists. Every mechanism it needs (a reserved C0, a shared stack, two walkers reading one notion, a keep-list in `blankPrefix`) was built by `fix/style-restore`, which is why the task list is short and why the wrap keep-list appears in it: that omission is the one regression the previous ticket shipped, and it is the same shape here.
