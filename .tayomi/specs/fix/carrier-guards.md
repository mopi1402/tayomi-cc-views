## target

Stop a carrier firing where it should not and rendering where it should fall open, three defects with one theme: neither carrier knows what a fenced code block is, so a message SHOWING the syntax runs it; the decorator measures its zone with the only parser it owns, so a payload it cannot read is indistinguishable from no payload and takes the static-view path; and both hollow guards ask whether the template printed INK rather than whether DATA arrived, which a view drawing caps and a fill always satisfies. Together they turned a quoted example into a decorated blank on a live screen, and `feat/banner-kinds` depends on this landing first.

## non-goals

- No new carrier and no new payload shape. The blockquote payload belongs to `feat/banner-kinds` and this ticket must land first.
- No tilde fences (`~~~`). Backticks only, composed from the existing `FENCE` constant in `src/data/markup.ts`.
- No indented code blocks (four spaces). Only fenced ones shield, and that boundary is written into `docs/caveats.md` rather than closed.
- No escape syntax for the decorator, no backslash form, no inline-code exemption beyond what a fence already gives. The fence IS the escape, and inventing a second one would be a second thing to remember.
- No change to `cutUnclosedBlock`'s streaming contract. A plain fence still arriving is out of scope; this ticket changes where a carrier LOOKS, not when a flush withholds.
- No change to what a valid table payload renders, nor to the cell rules.
- No change to the ordered search path, the tone slot, or the palette.
- No new runtime dependency.

## hard-constraints

- Fence tracking is ONE pass in ONE module, consulted by both carriers. Two scans of the same shape drift, and this repo's rule is that a shape several modules must agree on is written once.
- The OUTERMOST fence decides, and that is the whole rule. A fence opens on three or more backticks at the start of a line (markdown allows the indent) and closes on a run at least as long carrying NO info string, which is what lets a longer fence quote a shorter one. If an outermost fence's info string opens `view:` it is the block carrier's own and renders; every other outermost fence is a shield whose contents are text, a nested `view:` block and a decorator line included. An unclosed fence shields to the end of the message, which is markdown's own reading and also what a streaming message needs.
- Protection is resolved before either carrier reads, by ONE function each of them calls on the text it is about to read. Corrected during implementation, having been written as a single map computed up front and shared: the pipeline replaces the block carrier's zones before the decorator runs, so an offset measured before that pass names a different character after it. `BLOCK_RE` must not match inside a span that is not its own, and `renderDecorated` must not test a line inside any span. The streaming cut reads the same fences, or a quoted example at the tail of a message withholds everything under it until the fence closes.
- Whether the decorator has a payload and how far that payload REACHES are two questions, and only the first belongs to this fix. Existence is decided by the line below the decorator being blank or absent, the one boundary every markdown block agrees on. Extent stays the payload shape's own rule, so a table still ends at the first line that no longer starts with a pipe. Corrected during implementation, having been written as "the run of contiguous non-blank lines": that regressed the table payload, whose documented block rule lets prose follow it directly, and the existing suite failed on exactly that shape.
- A payload that exists and is claimed by nobody fails open, decorator line and payload left exactly as written.
- Consequently a STATIC view is summoned by a decorator whose line ends the message or has a blank line under it. A decorator followed directly by prose no longer summons anything, which is a behaviour change and is the point: that prose was always on screen, and the pipe-only scanner simply could not see it.
- The hollow question asks whether DATA arrived, never whether the output has ink. A template that spends NO substitution at all is static and renders on empty data, which is what keeps `views/welcome.view` a health check summoned by its line alone. A template that spends at least one and received nothing to fill it goes raw, an empty fenced body included, where the guard covered a NON-empty one only.
- The template therefore carries whether it spends a substitution, decided at parse time beside the other things `parseTemplate` already computes, never re-derived by scanning the body a second time at render. Over the BODY alone, since a comment documenting a slot is not a template spending one.
- The carrier's KIND counts as data arriving, because it becomes a field the template may spend alone. What that leaves standing is narrow and deliberate: a slot-spending view named with a `type:` and no payload still draws its furniture.
- The ink test in `decorator.ts` is KEPT ALONGSIDE the data test. Corrected during implementation, having been written as a replacement on the ground that two guards on one failure means one of them rots. The premise was wrong and the suite proved it: they catch two DIFFERENT failures, the data test a template drawing furniture around nothing, the ink test a template handed rows it reads none of, and each one alone ships the other's blank. The rule that would subsume both is whether any SLOT resolved, and reaching it means threading resolution back out of the substitution layer, which is a bigger change than this ticket.
- Every near-miss gets a case, and each one asserts the raw text SHOWS rather than merely that nothing rendered: a fenced decorator, a fenced `view:` block, an unclaimed payload, a static summons with prose directly below, a hollow data-driven view, an empty fenced body. A test that only checks the absence of a render cannot tell a matcher that now declines from one that swallows.
- The "Code can be mistaken for a view" entry in `docs/caveats.md` loses its fence half. It names fence-quoting an engine bug with fence tracking planned, and this ticket IS that tracking, so what survives is the Objective-C token, whose surface is a tested trade, plus the boundary left standing. A caveat that outlives its cause is worse than no caveat, because a reader trusts it.
- Fail-open stays total on every path: an unknown view, an unclaimed zone, a hollow render, a thrown error. The raw text shows, decorator line and fences included, and the screen never goes blank.
- A message with no fence and a valid payload renders byte-identically to today, so the existing corpus and its tests are untouched.

## done-when

```yaml
# The new module's own contract: where a fence opens, where it closes, which one is outermost, and that a view: info string is a carrier rather than a shield.
- id: fences-tests
  verify: pnpm vitest run src/carrier/fences.test.ts
  pass-if: exit == 0
# The decorator's three defects, each with its near-miss asserting the raw text SHOWS.
- id: decorator-tests
  verify: pnpm vitest run src/carrier/decorator.test.ts
  pass-if: exit == 0
# The fenced carrier's side: the nested block that must not fire, the empty body that must not render a blank.
- id: scan-tests
  verify: pnpm vitest run src/carrier/scan.test.ts
  pass-if: exit == 0
# The no-regression floor. It proves the corpus still renders and still contains what it asserts; byte-identity for fence-free messages is a constraint on the implementer, not something this command observes.
- id: suite-green
  verify: pnpm test
  pass-if: exit == 0
# A new module arrives and must answer for itself.
- id: sidecars
  verify: pnpm check:sidecars
  pass-if: exit == 0
# The parsed template gains a flag and the carriers gain a span reader; the signatures have to stay sound.
- id: typecheck
  verify: pnpm typecheck
  pass-if: exit == 0
# Zero warnings is the repo's standing bar.
- id: lint
  verify: pnpm lint
  pass-if: exit == 0
# Gates the tarball, not the source: the health check is summoned by a bare decorator line and must still render from the installed pack once the empty-zone rule applies.
- id: pack-renders
  verify: pnpm verify:pack
  pass-if: exit == 0
```
