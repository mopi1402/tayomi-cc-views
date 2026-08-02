## target

Three defects, one theme: a carrier fires where it should not, and renders where it should fall open.

1. Neither carrier knows what a fenced code block is. `BLOCK_RE` (`scan.ts:20`) is a global regex and `renderDecorated` (`decorator.ts:137`) splits on newlines and tests every line, so a message SHOWING the syntax runs it. There is no way today to write `@{view:...}` in prose without engaging it, and the fenced carrier has only an accidental escape.
2. The decorator measures its zone with the only parser it owns (`decorator.ts:146`, `PIPE_LINE_RE`). A payload it cannot parse is therefore indistinguishable from NO payload, and falls into the static-view path (`data = {}`) instead of failing open.
3. Both hollow guards ask whether the template printed INK, not whether DATA reached it. `decorator.ts:165` tests `rendered.trim() === ""`, which a template drawing literal furniture never satisfies, and `render.ts:59` only guards a NON-empty body. A view with caps and a fill renders a decorated blank in both carriers.

All three reproduce on today's code with no new feature. `feat/banner-kinds` depends on this fix and drops its own version of defect 2 once it lands.

## non-goals

- No new carrier and no new payload shape. The blockquote payload belongs to `feat/banner-kinds` and this ticket must land first.
- No tilde fences (`~~~`). Backticks only, composed from the existing `FENCE` constant in `src/data/markup.ts`.
- No indented code blocks (four spaces). Only fenced ones shield.
- No escape syntax for the decorator, no backslash form, no inline-code exemption beyond what a fence already gives. The fence IS the escape, and inventing a second one would be a second thing to remember.
- No change to `cutUnclosedBlock`'s streaming contract. A plain fence still arriving is out of scope; this ticket changes where a carrier LOOKS, not when a flush withholds.
- No change to what a valid table payload renders, nor to the cell rules.
- No change to the ordered search path, the tone slot, or the palette.
- No new runtime dependency.

## hard-constraints

- Fence tracking is ONE pass in ONE module, consulted by both carriers. Two scans of the same shape drift, and this repo's rule is that a shape several modules must agree on is written once.
- The OUTERMOST fence decides, and that is the whole rule. A fence opens on three or more backticks at the start of a line (leading whitespace allowed, as markdown allows) and closes on a fence of at least the same length. If an outermost fence's info string opens with `view:`, it is a CARRIER block and is consumed as today. Any other outermost fence is a PROTECTED region: everything inside it is text, a nested `view:` block and a decorator line included.
- Protection is resolved before either carrier reads, by ONE function each of them calls on the text it is about to read. Corrected during implementation, having been written as a single map computed up front and shared: the pipeline replaces the block carrier's zones before the decorator runs, so an offset measured before that pass names a different character after it. `BLOCK_RE` must not match inside a span that is not its own, and `renderDecorated` must not test a line inside any span.
- Whether the decorator has a payload and how far that payload REACHES are two questions, and only the first belongs to this fix. Existence is decided by the line below the decorator being blank or absent, the one boundary every markdown block agrees on. Extent stays the payload shape's own rule, so a table still ends at the first line that no longer starts with a pipe. Corrected during implementation, having been written as "the zone is the run of contiguous non-blank lines": that regressed the table payload, whose documented block rule lets prose follow it directly, and it broke the existing suite on exactly that shape.
- A payload that exists and is claimed by nobody fails open, decorator line and payload left exactly as written.
- Consequently a STATIC view is summoned by a decorator whose line is followed by a blank line or ends the message. A decorator followed directly by prose no longer summons anything, which is a behaviour change and is the point: today that prose is invisible to the scanner and the view renders as if the author had written nothing.
- The hollow question becomes whether a FIELD resolved, never whether the output has ink. A template that spends NO substitution at all is static and renders on empty data, which is what keeps `views/welcome.view` working. A template that spends at least one and received nothing to fill it goes raw. One rule, one place, read by both carriers.
- The template must therefore carry whether it spends substitutions, decided at parse time beside the other things `parseTemplate` already computes, never re-derived by scanning the body a second time at render.
- `decorator.ts`'s ink test is KEPT ALONGSIDE the data test. Corrected during implementation, having been written as a replacement on the ground that two guards on one failure means one of them rots. The premise was wrong: they catch two DIFFERENT failures, and the suite proved it. The data test catches a template drawing furniture around nothing, which puts ink on screen; the ink test catches a template handed rows it reads none of, which arrives with data. Each one alone ships the other's blank. The rule that would subsume both is "did any SLOT resolve", and reaching it means threading resolution back out of the substitution layer, which is a bigger change than this ticket.
- Fail-open stays total on every path: an unknown view, an unclaimed zone, a hollow render, a thrown error. The raw text shows, decorator line and fences included, and the screen never goes blank.
- A message with no fence and a valid payload renders byte-identically to today, so the existing corpus and its tests are untouched.

## acceptance

1. Given a message holding a plain ``` fence whose body carries `@{view:banner, tone:green}` followed by two quote lines, When it renders, Then nothing is summoned and the fence, the decorator line and the quote survive byte for byte.
2. Given a message holding a four-backtick fence whose body carries a complete three-backtick `view:demo` block, When it renders, Then nothing is summoned and both fences and the inner block survive byte for byte.
3. Given a top-level `view:demo` block and, elsewhere in the same message, a top-level decorator over a valid two-column table, When it renders, Then both render exactly as they do today, so protection has not shielded the carriers from their own outermost blocks.
4. Given a decorator over a payload no parser claims (a blockquote, on today's code), When it renders, Then the decorator line and the payload show raw and the view is NOT summoned with empty data.
5. Given `@{view:welcome}` as the last line of a message, and given the same line followed by a blank line, When each renders, Then the health check renders; and Given the same line followed directly by a line of prose, Then nothing renders and the decorator line shows raw.
6. Given a decorator summoning a data-driven view with an empty zone, and given an empty `view:banner` fenced block, When each renders, Then the raw text shows rather than a decorated blank; and Given an empty `view:welcome` block, whose template spends no substitution, Then the health check still renders.

## tasks

- Add `src/carrier/fences.ts` with its sidecar: one pass over a text returning the protected spans, outermost fence winning, a `view:` info string marking a carrier rather than a shield. Compose every shape from `src/data/markup.ts` and add there whatever is missing. (AC: 1, 2, 3)
- Have `pipeline.ts` resolve the spans once and consult them before `BLOCK_RE`, then hand the same spans to `renderDecorated`. Neither carrier computes them itself. (AC: 1, 2, 3)
- Skip a decorator line that falls inside a protected span, and keep the line untouched in the output. (AC: 1)
- Measure the decorator's zone as the run of contiguous non-blank lines under it, then offer the zone to the table parser; a non-empty zone it does not claim fails open. (AC: 4)
- Summon a static view only on an EMPTY zone, and document the blank line or end-of-message this now requires. (AC: 5)
- Record at parse time whether a template spends any substitution, on the parsed template beside the fields it already carries. (AC: 6)
- Extend `render.ts`'s guard: a template that spends slots and got no field is hollow and its caller falls open. Keep `decorator.ts`'s ink test beside it, each one carrying in writing which failure it is the only one to catch. The carrier's KIND counts as a field arriving, since it becomes one below and a template may spend it alone. (AC: 6)
- Extend `src/carrier/decorator.test.ts` with the fenced decorator, the unclaimed zone, the static summons and its blank-line requirement, and the hollow data-driven view. Every one of these is a near-miss whose whole point is that the raw text SHOWS, so each asserts the original line is present rather than merely asserting nothing rendered. (AC: 1, 4, 5, 6)
- Extend the fenced carrier's own sidecar with the nested `view:` block and the empty body. (AC: 2, 6)
- Document all three in `docs/view-language.md`: a fenced code block shields both carriers and the outermost fence decides, the decorator's zone is measured before it is parsed, and a static view is summoned by an empty zone. Add the behaviour change about a decorator followed directly by prose. (AC: 1, 4, 5)
- Rewrite the "Code can be mistaken for a view" entry in `docs/caveats.md`. It currently names TWO shapes and says of the second "fence-quoting is an engine bug, fence tracking planned here": this ticket IS that tracking, so the entry keeps the Objective-C token, whose surface is a tested trade, and loses the fence half. Replace it with the boundary this leaves standing: an indented four-space code block does not shield, only a fenced one does. A caveat that outlives its cause is worse than no caveat, because a reader trusts it. (AC: 1)

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
# The parsed template gains a flag and the carriers gain a span map; the signatures have to stay sound.
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

## clarifications

- Scope, decided by the human on 2026-08-02: a separate ticket rather than an extension of `feat/banner-kinds`. All three defects reproduce on today's code, they are the contract of one pair of functions, and folding them into the feature would touch the same lines twice and hide a fix inside a change of behaviour.
- Defect 1 was already KNOWN, and this ticket is its plan rather than its discovery: `docs/caveats.md` names fence-quoting an engine bug with fence tracking planned. What the live session added is that the bug does not stop at a mis-rendered zone the way that entry implies, because defects 2 and 3 turn it into a decorated blank rather than raw text.
- Origin, observed on 2026-08-02: the empty pill was reproduced in a live session. A decorator written inside a plain code fence to SHOW the syntax fired, its quote was invisible to the pipe-only zone scanner, the empty payload took the static-view path, and `banner.view` drew its caps and its fill around nothing, which the ink test read as a successful render.
- Author's call, open to challenge: the outermost fence decides, rather than tracking nesting depth properly. A `view:` block inside a protected region is text and nothing more, which is exactly what a documentation example needs, and depth tracking would buy a case nobody has.
- Author's call, open to challenge: no tilde fences. They are legal markdown and no consumer here writes them, so admitting them adds a second shape to `src/data/markup.ts` for a reader that does not exist yet.
- Author's call, open to challenge: a static view now requires an EMPTY zone, so `@{view:welcome}` followed directly by prose stops rendering. This is a documented behaviour change and it is the honest reading: the prose was always there, the scanner simply could not see it.
- Author's call, open to challenge: the ink test is deleted rather than kept alongside the data test. Two guards on one failure means one of them stops being maintained, and the ink test is the one that was already wrong.
- Boundary left standing, to be written in `docs/caveats.md` rather than fixed: an indented four-space code block does not shield a carrier. Fenced blocks are what agents and hooks emit, and an indented block carrying a decorator line is a case nobody has produced.
