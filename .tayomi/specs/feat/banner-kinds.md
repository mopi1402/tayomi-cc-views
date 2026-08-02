## target

Make the banner cost what the README promises, and make its FALLBACK carry everything the render carries. Three changes get there, none of them specific to the banner. The decorator carrier learns a second payload shape, a blockquote, whose body reaches the template as `content` and whose optional leading alert marker (`> [!WARNING]`) reaches it as the `type` field. The .view language learns `@text`, the enum-to-TEXT sibling of `@map`, spent through the `${field:mapname}` form that already exists, so a template holds the word a kind is named by (`⚠ WARNING`) instead of the model typing it. `views/banner.view` becomes the first consumer, ships a default table of kinds so nothing has to be created to use it, and stays ONE file for every kind.

The blockquote is chosen over a bare paragraph for one reason, and it is the whole point of the carrier: where the hook does not run, a quote carrying `[!WARNING]` is still a visible, self-describing block, natively an alert box on GitHub and in VS Code, and readable as a callout in a raw transcript. A bare sentence is indistinguishable from prose, and a table for a single band is a shape the author never meant to write.

DEPENDS ON `fix/carrier-guards`, which must land first. That ticket makes a code fence shield both carriers, and it separates measuring the decorator's zone from parsing it. Without the second, a quote under a decorator is invisible to the pipe-only scanner and collapses to the static-view path, so this feature would be built on a zone that cannot see its own payload.

## non-goals

- No control flow in the language. No `@switch`, no `@if`, no `@case`. A switch chooses a SHAPE and the language already answers that with typed forms (`demo.warning.view`); a banner needs a VALUE, and a branch used for a value is what makes near-identical copies of a template.
- No `.view` file per kind. `banner.warning.view` and its siblings must not exist at the end of this change.
- No table payload for the banner, and no mechanism to forbid one. A view refuses a payload shape by not reading it: `banner.view` reads `content`, a table hands it `rows`, the hollow-render guard fires and the raw table shows. Nothing is added to enforce this.
- No bare-paragraph payload. Two shapes only: a first line starting with a pipe is a table, a first line starting with `>` is a blockquote. Anything else is not a payload and the zone fails open, which is `fix/carrier-guards`'s rule and not this ticket's.
- No presentation in the marker. The marker is a KIND NAME, constrained to one token, so no glyph and no space can enter it. `[!📦 VERSION]` is not a marker, and the line falls through to the body where the author sees it printed.
- No removal of `type:` from the decorator carrier. It keeps selecting typed FILES for the views that use them; the banner simply never needs it, because its kind rides in the payload.
- No typed-file selection from a MARKER. A marker names a kind for the tone slot and the text table, never a file, so a `[!WARNING]` over some other view must not start resolving `<name>.warning.view`.
- No change to the table payload's own behaviour, nor to the cell rules.
- No typed-file selection from the fenced block. The fence passes no dressing today (`pipeline.ts:95` calls `renderView` with no `Dressing`) and this change does not open that door.
- No change to `@map`: not its chip, not its uppercase, not its padding, and NOT the case-sensitivity of its lookup. A global case-insensitive lookup would silently change which values hit an existing table.
- No change to `src/style.ts`. The tone chain already reads a `type` FIELD (`render.ts:79`, `toneClass`), and this design is built so that stays true.
- No new runtime dependency.

## hard-constraints

- The payload shape is decided by the FIRST line of the zone and nowhere else: a leading pipe is a table, a leading `>` is a blockquote. One dispatcher, one site, so a third shape later is an entry there and not a second scan.
- A blockquote zone's body lines have the `>` prefix stripped and join with one space, which is markdown's own soft-wrap semantics, so the render and the hookless fallback read the same text. Where the zone ENDS is `fix/carrier-guards`'s business, not this ticket's.
- The joined body is emitted on ONE line and nothing measures it. A body line outside a box never reaches `wrapLine` (it is called from `box.ts` and `aside.ts` only), so a band wider than the terminal is soft-wrapped by the terminal itself: the chip stays open across the break, the colour continues on the next row, and the closing cap lands at the end of the last one. That is the accepted look, and there is therefore NO width work in this ticket: no wrap, no truncation, no ellipsis, no measurement.
- A decorator's quote must be followed by a blank line or end the message. `fix/carrier-guards` measures a zone as the run of contiguous non-blank lines, so prose on the line directly under the quote joins the zone, no parser claims the mixture, and the whole thing fails open. This is a usage rule the emitting model has to know, so it belongs in the docs and in the packaged template's commentary, not only here.
- The quote body is NEUTRALISED before it becomes `content`, exactly as a table cell is. It is message text becoming a scope value, which is the seam this engine holds: text able to open a colour is able to close one the render meant to keep. It gets the same treatment `cell()` gives (`decorator.ts:98`): `inert()` first, then authored `**bold**` spans honoured per span, and if that means factoring `cell()` so both callers share it rather than writing a second copy, factor it.
- The marker is `[!TOKEN]` alone on the FIRST body line of the quote, and the token matches one uppercase run: `[A-Z][A-Z0-9_-]*`. A space, a glyph, a lowercase letter or a second word means the line is NOT a marker, and it stays what it is, the first line of the content, printed in the band. This is the engine's standing discipline that a malformed line falls through to the body where the author sees it, and it is what keeps the marker from becoming a label slot the model writes prose into.
- The marker's token is LOWERCASED into the `type` FIELD. This is what makes the whole design need no change to the palette or to the tone chain: `toneClass` already reads that field (`render.ts:79`) and the palette's classes are lowercase, so `[!WARNING]` paints yellow with nothing touched. The uppercase the author wrote comes back at the other end, from the table (see the echo rule below).
- When a marker is present the carrier does NOT set `dressing.type`; it sets the `type` field. That is the whole implementation of "the marker beats the attribute": `render.ts:71` overrides the field from the dressing only when the dressing carries one, so leaving it unset makes the marker win by construction, changes nothing in `render.ts`, and keeps a marker from ever selecting a typed file. With no marker, `type:` behaves exactly as it does today.
- `@text <name> <value>="..." ...` declares an enum-to-text table, spent by the SAME substitution the style map is spent by: `${field:mapname}`. Two declarations, one substitution, because the caller asks the same question and it is the table that decides what comes out. A name declared by both directives in one template is a template error, not a merge.
- `@text`'s pairs are parsed QUOTE-AWARE, and this is real work rather than a reuse. `@map` splits its pairs on whitespace because a tag name has none; a text value has spaces by definition, so reusing that splitter would truncate `"⚠ WARNING"` at its first space and do it silently.
- A DECLARED entry renders VERBATIM: the author's glyph, the author's casing, byte for byte. An OFF-MAP token echoes UPPERCASED. The rule is the language's, not the banner's: a MAPPED SLOT SHOWS AN UPPERCASE WORD UNLESS THE TABLE DECLARES THE ENTRY, which is what `@map` already does when it uppercases its chip. On the marker path it also happens to be a restoration, since the guard forced uppercase and the carrier lowercased it; on the fenced path nothing forced anything, and the slot still uppercases, because it is one rule and not two.
- Padding follows `@map`'s existing rule and is not re-decided here: padded to the cell when the substitution sits in a padded column, bare outside one (`substitute.ts:30` already draws that line for the off-map case). A band is not a column, so a banner never pads; a text map spent inside an `@each` still aligns, and writing "never pads" would break that.
- The table's default and its pass-through are two different cases and stay so. A value ABSENT or whitespace-only takes the reserved entry `*`; a value PRESENT but off the map echoes as above. This is what lets one slot serve a quote with no marker, a known kind, and a kind the table has never heard of, with no second field and no fallback concept in the language.
- The packaged `views/banner.view` ships a default `@text` table, or the promise holds only on paper: a consumer who has created nothing must be able to write `> [!WARNING]` and get a dressed band. A consumer with its own vocabulary does not patch the package, it shadows `banner.view` from an earlier directory on the search path, which is the existing contract and needs no new mechanism.
- The colour keeps coming from the tone slot, never from the text table. The table carries the WORD, `{{tone_bg}}` and `{{tone_cap}}` carry the paint, and a table that also named a colour would give a kind two places to declare its look.
- `views/banner.view` ends this change with no `${label}` on its band line. A line spending both a mapped slot and a free label prints both.
- Every directive word stays in `src/data/language.ts` and every matcher composes from there, `@text` and the marker's shape included. The reserved `*` is a constant beside them, never retyped.
- A template declaring no `@text`, and a decorator over a table, render byte-identically to today.

## acceptance

1. Given `@{view:banner}` over a quote whose first line is `> [!WARNING]` and whose remaining lines are prose, When it renders, Then the band is yellow, it opens with `⚠ WARNING` from the packaged table, it carries the prose with the `>` prefixes stripped and the lines joined by single spaces, and the decorator line is consumed.
2. Given `@{view:banner}` over a quote with NO marker, When it renders, Then the band is the neutral white chip and opens with the word the table's `*` entry holds (`ⓘ NOTE`); and Given a quote marked `> [!VERSION]`, a token the table does not hold, Then the band opens with `VERSION`, uppercase, and its colour falls to the template's `@tone` because `version` is not a palette class.
3. Given `@{view:banner, tone:green}` over a quote marked `> [!VERSION]`, When it renders, Then the band is green and the word is `VERSION`; and Given `@{view:banner, type:error}` over a quote marked `> [!WARNING]`, Then the band is the WARNING one, the marker having won because the carrier left `dressing.type` unset.
4. Given a quote body carrying `{{red}}`, a `{{/}}` and a `**bold**` span, When it renders, Then the tag characters print as text, no style opens from the message, nothing the band meant to keep is closed by it, and the bold span renders bold exactly as it does in a table cell. Width is deliberately not asserted here: a band never reaches the wrapper, so what a tag COSTS is unobservable on this path and is pinned where wrapping actually happens.
5. Given a quote whose joined body is wider than the render width, When it renders, Then it is emitted as one line, unwrapped and untruncated, and no width computation ran; and Given a quote followed on the very next line by prose, Then the whole zone fails open and the raw text shows, quote and decorator included.
6. Given a quote whose first line is `> [!📦 VERSION]`, `> [! WARNING]`, `> [!warning]` or `> [!TWO WORDS]`, When it renders, Then none of them is read as a marker, each line is the first line of the CONTENT and prints inside the band, and the band takes the `*` entry as its word.
7. Given a template declaring `@text kinds warning="⚠ WARNING" *="ⓘ NOTE"` and spending `${type:kinds}`, When `type` is `warning`, Then the slot renders `⚠ WARNING` verbatim, glyph and casing byte for byte, and unpadded outside a column; When `type` is absent or whitespace-only, Then it renders `ⓘ NOTE`; When `type` is `deploy`, Then it renders `DEPLOY`; and Given the same table spent inside an `@each` column, Then its values pad to the cell exactly as `@map`'s off-map values already do.
8. Given a template declaring a `@text` entry whose value carries spaces and a glyph, When it is parsed, Then the whole quoted value survives and nothing is truncated at the first space; and Given one name declared by both `@map` and `@text`, Then the template is an error rather than a silent merge.
9. Given the packaged `views/banner.view` rendered from the installed tarball, When a quote marked `> [!WARNING]` is passed through the decorator and when the same band is written as a fenced `view:banner` block carrying `type` and `content` fields, Then both produce the same band, no typed file is loaded for either, no `banner.<kind>.view` is present in the tarball, and the README states the cost per payload shape rather than a flat one-line claim.

## tasks

- Dispatch the decorator payload on its first line in `src/carrier/decorator.ts`: a leading pipe keeps today's table parser and its `rows`, a leading `>` parses as a blockquote and yields `content`. (AC: 1)
- Strip the `>` prefixes and join the body with one space. (AC: 1)
- Neutralise the joined body the way `cell()` neutralises a cell, factoring `cell()` so the two share one treatment rather than growing a second copy of it. (AC: 4)
- Read the optional marker on the quote's first body line, matching one uppercase token, and put it LOWERCASED in the `type` field. A first line that is not a marker stays content. (AC: 1, 2, 6)
- Leave `dressing.type` unset whenever a marker is present, so the field is what reaches the template and no typed file resolves from a marker. (AC: 3)
- Add the blockquote cases to `src/carrier/decorator.test.ts`: marked and unmarked quotes, the multi-line join, `tone:` over an unknown kind, and the marker beating the attribute. (AC: 1, 2, 3)
- Add the neutralisation cases to the same sidecar: a tag in the quote body printing as text, and an authored bold span rendering bold. (AC: 4)
- Cover the near-misses, one case each: the glyph marker, the leading space, the lowercase token, the two-word token. Each must print inside the band rather than vanish, which is the only thing that tells a matcher apart from a swallower. (AC: 6)
- Pin the width behaviour as a test rather than as code: a joined body wider than the render width comes out on one line, unwrapped and untruncated. It passes on day one, and that is the point, since the next person to reach for `wrapLine` here should have to delete an assertion that says why. (AC: 5)
- Pin the blank-line rule: a quote followed on the very next line by prose fails open with the raw text intact. (AC: 5)
- Add `@text <name> <value>="..."` to `src/data/language.ts` beside the other directives, with the reserved `*` and the marker's shape as named constants there, and compose both matchers from them. (AC: 6, 7)
- Parse `@text` in `src/template/parse.ts` beside `@map`, with a QUOTE-AWARE pair reader, and make a name declared by both directives an error. Extend `src/template/parse.test.ts` with the spaced value, the glyph, and the double declaration. (AC: 8)
- Resolve `${field:mapname}` in `src/template/substitute.ts` against whichever table declared the name: the style map keeps its chip and its case-sensitive lookup untouched, the text table renders a declared entry verbatim and echoes an off-map token uppercased, and both follow the existing padded-in-a-column rule. Extend `src/template/substitute.test.ts` with the three lookup outcomes, the glyph surviving, and a text map inside a padded column. (AC: 7)
- Apply the absent-versus-off-map rule at the lookup: absent or whitespace-only takes `*`, present and unknown echoes uppercased. (AC: 2, 7)
- Rewrite `views/banner.view` as one file for every kind: `@tone chip` for the neutral white band, a default `@text` table holding the five GitHub alert kinds plus the palette's own severities and the `*` entry, and a band line spending `${type:kinds}` and `${content}` with no `${label}`. Keep the header commentary that makes this file readable and rewrite it around the three ways in, the marker's constraint, and how a consumer shadows the file to add its own vocabulary. (AC: 1, 2, 9)
- Document all of it in `docs/view-language.md`: the blockquote payload under the decorator carrier (its dispatch, the marker, the lowercasing, the marker-beats-attribute mechanism, the blank line a quote must be followed by), `@text` under the directives with its lookup, echo and padding rules beside `@map`, and the fallback gradient of the marker. (AC: 1, 5, 6, 7)
- Add one line to `docs/caveats.md`: a band is emitted unwrapped, so a long one is broken by the terminal and its closing cap lands on the last row. It is a deliberate look, not an oversight, and naming it is what stops it being reported as a bug. (AC: 5)
- Correct the README. The claim becomes ONE DECORATOR LINE OVER MARKDOWN THAT STANDS ON ITS OWN, which a table and an alert quote both are and an invented empty-header table was not. Add the marked-quote banner as the example that makes the claim honest, and state the fallback each payload shape degrades to. (AC: 9)
- Extend `tests/integration/bundled-views.test.ts` so the packaged banner is driven through the decorator and the fenced block, since that suite answers for the corpus as a PATH rather than for a module. (AC: 9)

## done-when

```yaml
# The carrier's own proof: the blockquote payload, the marker and its four near-misses, the lowercasing, the precedence mechanism, and the neutralisation of the body.
- id: decorator-tests
  verify: pnpm vitest run src/carrier/decorator.test.ts
  pass-if: exit == 0
# The directive word, the reserved key and the marker's shape live in src/data, and the sidecar there is what pins them.
- id: language-tests
  verify: pnpm vitest run src/data/language.test.ts
  pass-if: exit == 0
# Where @text is READ: the quote-aware pair reader is the part a naive reuse of @map's splitter would break silently.
- id: parse-tests
  verify: pnpm vitest run src/template/parse.test.ts
  pass-if: exit == 0
# Where @text is SPENT: the three lookup outcomes, the verbatim entry, the uppercased echo, and the padding rule shared with @map.
- id: substitute-tests
  verify: pnpm vitest run src/template/substitute.test.ts
  pass-if: exit == 0
# The no-regression floor. It proves the corpus still renders and still contains what it asserts; byte-identity for @text-free templates is a constraint on the implementer, not something this command observes.
- id: suite-green
  verify: pnpm test
  pass-if: exit == 0
# Every module answers for itself, and this change adds a payload branch to the carrier and a lookup path to the template layer.
- id: sidecars
  verify: pnpm check:sidecars
  pass-if: exit == 0
# The decorator gains a payload union and the template layer a second table kind; the signatures have to stay sound.
- id: typecheck
  verify: pnpm typecheck
  pass-if: exit == 0
# Zero warnings is the repo's standing bar.
- id: lint
  verify: pnpm lint
  pass-if: exit == 0
# Gates the tarball, not the source: the rewritten banner has to ship and render from the installed pack, and a banner.<kind>.view left behind shows up here as a file that must not be in the listing.
- id: pack-renders
  verify: pnpm verify:pack
  pass-if: exit == 0
```

## clarifications

- Payload shape, decided by the human on 2026-08-02: a blockquote, on the ground that the FALLBACK has to stay visible. A banner is read again in a transcript and re-rendered as plain markdown, and in both a bare sentence disappears into prose while an invented table is a shape the author never wrote. A quote is a block in every renderer, and a marked quote is a native alert box in the ones that matter.
- Where the kind is written, decided by the human on 2026-08-02: in the payload, as markdown's own alert marker, not in a `type:` attribute. It is the only place the kind survives BOTH degradations, the hookless transcript and the plain-markdown re-render. Admitting both spellings would be two ways to say one thing with a precedence rule to write, so the attribute simply stops being needed here.
- Where the kind's WORD lives, decided by the human on 2026-08-02: in the template, never in the payload. `⚠ WARNING` is presentation, the repo's rule puts presentation on disk, and the marker already names the kind. Having the model type the word duplicates the marker and lets a message contradict itself with `[!WARNING]` over a `✓ PASS` label.
- Map over branch, decided by the human on 2026-08-02: a lookup table rather than Angular-style control flow. A `@switch` in `banner.view` would hold four copies of the same band line differing by one word, which is worse than the four files this change exists to avoid.
- No glyph in the marker, decided by the human on 2026-08-02: the objection is not the emoji, it is the SPACE it needs. Once a space is legal, `[!📦 VERSION]` and `[!THE BUILD FAILED ON NODE 20]` are the same shape, and the marker has become the label slot this design removed. A glyph reaches a band by the template's table (declared once, every band of that kind identical) or by the fenced block (spelled out, one off).
- Three levels of effort, decided by the human on 2026-08-02: nothing to create, because the packaged table holds the common kinds; a shadowed `banner.view` for a consumer's own vocabulary, patching nothing; and the fenced block for a one-off, where the extra lines are the honest price of writing presentation in a message.
- Lowercase in, uppercase out, decided by the human on 2026-08-02 after a review pass against the code: the first draft kept the token uppercase in the field and asked both lookups to become case-insensitive, which would have needed `src/style.ts` touched and would have changed which values hit an existing `@map`. Lowercasing at the carrier and echoing uppercase at the table keeps both untouched and produces the same band.
- Precedence mechanism, decided by the human on 2026-08-02 after the same pass: the first draft asserted "the marker wins" while `render.ts:71` does the opposite, overriding a `type` field from the dressing. Leaving `dressing.type` unset when a marker is present makes the rule true by construction and costs no edit in `render.ts`.
- Width, decided by the human on 2026-08-02 and verified on screen: a band is emitted on one line and the TERMINAL breaks it. No wrap, no truncation, no ellipsis. The caps landing on different rows is understood by a reader as one band, and buying a wrapper here would mean giving a body line outside a box a width it has never had. The rule is pinned by a test that passes on day one, so removing it is a deliberate act.
- Author's call, open to challenge: the directive is named `@text`. It says what comes out of the table, which is the axis separating it from `@map`. `@label` was rejected because `label=` already means something else on `@each`.
- Author's call, open to challenge: one substitution form serves both tables, rather than a second form making the caller state which KIND of table it reads, which the table already knows.
- Author's call, open to challenge: the reserved entry is `*`. A literal `default=` was rejected because `default` is a plausible enum value.
- Author's call, open to challenge: absent takes `*` and off-map echoes, rather than `*` catching both. Collapsing them would cost the unknown-kind band its word and force a `label` field back onto the band line.
- Author's call, open to challenge: an off-map token echoes UPPERCASED, where `@map`'s off-map value echoes verbatim. The asymmetry is deliberate and narrow: the marker guard forced uppercase and the carrier lowercased it, so the echo is a restoration rather than a transformation.
- Author's call, open to challenge: the neutral is `@tone chip`, the white chip, rather than today's `@tone info`. The change of default is deliberate: an unmarked banner is white from here, not cyan.
- Author's call, open to challenge: the packaged table carries `VERSION` alongside the severities, as the one non-severity kind, because a band is a label and a value on a coloured line and that family is legitimate. If it reads as product vocabulary in a general-purpose package, it is the first entry to drop.
- Not gated, stated so it is not mistaken for covered: the README's wording is a task with no done-when that can observe it. The pack gate proves the banner renders from the tarball, not that the sentence above it became true.
- Fallback gradient, to be documented rather than fixed, verified against GitHub's current writing-and-formatting docs on 2026-08-02: exactly five kinds re-render as native alert boxes, NOTE, TIP, IMPORTANT, WARNING and CAUTION. Any other token falls back to a quote whose first line reads `[!VERSION]` literally, which is still visible and still self-describing, but not an alert box.
- Case, settled on 2026-08-02: GitHub documents no case rule and writes every example uppercase. It does not matter which way it leans, because this engine's guard accepts UPPERCASE ONLY and is therefore strictly narrower: everything the marker matcher admits renders as a native alert, whether GitHub is lenient or not. The guard needs no knowledge of GitHub's parser, which is why it is written as a shape rather than as a list of five words.
- Boundary found in the same docs and worth one line of ours: GitHub states that alerts cannot be NESTED inside other elements. A banner's quote therefore has to sit at the top level of the message, and one written inside a list item or another quote keeps rendering here while losing its native fallback there. Document it beside the gradient.
