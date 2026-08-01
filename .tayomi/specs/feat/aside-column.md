## target

Give the .view language an `@aside <name>` / `@endaside` region so a template can put a second, independent column of content beside its main flow by naming a view, instead of hand-composing both columns line by line; the packaged `views/welcome.view` becomes the first consumer and keeps reading as the tutorial it is.

## non-goals

- No inline aside content: the region names a view and nothing else, since admitting a block on the spot would let back in exactly the wall of escapes this primitive removes.
- No aside on the right of the main flow; the column is on the left in this first cut.
- No support for naming a framed or dressed view: the region takes the named file's body lines and interprets no directive in them, so a view carrying `@box`, `@each`, `@map` or `@foot` shows those lines as plain text. This is why the packaged art ships as bare rows.
- No nested asides, and no region inside a region: the box is deliberately not nestable today and this change does not open that door.
- No `@rule` inside a region: an inner rule is filled to the full box width by the frame, which has no meaning across two columns.
- No switch to turn the separator off, and no configurable gutter; the region always spends the same five printed columns around the separator in this first cut.
- No image handling of any kind in the engine: the art is produced offline and reaches the engine as an ordinary `.view` file of text.
- No stacking the aside above the main flow when the width is short; the narrow path drops it.

## hard-constraints

- An aside row is emitted verbatim: never wrapped, never split, never restyled, because it carries raw ANSI art whose transparent pixels are spaces and would otherwise be wrap points. There is no bypass mark in the language (`src/layout/marks.ts` carries exactly two channels, RULE and HANG), so the only way to hold this is to build every composed line so its printed width already fits, which is what makes `wrapLine` hand it back untouched.
- The region spends the aside's own printed width plus five columns before the main flow: two spaces, the separator, two spaces. With the packaged art at 28 cells that is 33 columns, and the main flow gets whatever is left of the content width.
- The parser stays disk-free: resolving the named view happens through the loader layer, which is already the only module that knows a view is a file. The directive layer gains the search path as a handed-down value, exactly as it already receives the width.
- The layout layer keeps taking the width as a value handed down from the render entry, and never probes the platform itself.
- Inside a region, the aside and its separator are dropped as soon as the main column would fall under 40 printed columns of BOX CONTENT, which is the width the frame wraps the body to (`limit - 4`), not the terminal width and not `limit`. Outside a region nothing changes, and the existing floor of 40 that `maxBoxWidth` applies to `limit` is a different number in a different unit and stays untouched.
- Blank-line collapsing keeps its exact behaviour outside a region. Inside one, a blank main-flow line survives, because the composed line carries the separator and is therefore no longer empty; the validated mockup depends on those breathing lines being kept.
- A template that declares no aside renders byte-identically to today, so the existing view corpus and its tests are untouched by this change.
- The health check stays static: an empty `view:welcome` block keeps rendering the canonical box word for word, with nothing for the agent to improvise.
- No new runtime dependency.

## acceptance

1. Given a template whose box body carries full-width lines, then a region opened by `@aside <name>` and closed by `@endaside`, then full-width lines again, When it renders at a width that fits both columns, Then the lines outside the region print at the full content width, every line inside it carries the aside view's row on the left, the separator, and the main flow's line on the right, and no aside content appears outside the region.
2. Given that same template, When it renders at a width that would leave the main column fewer than 40 printed columns of box content, Then the aside and its separator are absent entirely, the main flow uses the full content width, and no line of the region is wider than the content width.
3. Given an aside view with fewer or more rows than the main flow of its region, When the region is declared as `@aside <name>` with no alignment token, Then the shorter column is padded so its rows sit centred against the region with the odd padding row below, and declaring `@aside <name> top` or `@aside <name> bottom` places them flush to that edge instead.
4. Given an aside view whose rows are raw ANSI art padded with spaces, When it renders inside the region, Then no aside row is wrapped, split or restyled, and the separator falls on the same printed column on every line of the region.
5. Given an `@aside` naming a view that resolves nowhere on the search path, When the box renders, Then the region degrades to the full-width main flow instead of failing the block, so a decoration never takes the surrounding box down with it.
6. Given `views/welcome.view` rewritten to name the art on one line, When the package is packed and the welcome block is rendered from the installed tarball at a width that fits both columns, Then a rendered line carries both an art cell and a section label, and both `views/welcome.view` and `views/tayo.view` are present in the tarball; and When the same block is rendered from the same tarball at the narrow width the pack harness already uses, Then the box still shows the four sections with the art dropped.

## tasks

- Read an `@aside <name> [top|bottom]` / `@endaside` region in the directive layer and resolve the named view's body lines through the existing ordered search path, shadowing contract included, with the search path handed down rather than probed. (AC: 1)
- Compose the region line by line: the aside column at its own measured width, the five-column gutter carrying the separator, then the main flow pre-wrapped to the width that remains, so the composed line already fits and the wrapper hands it back whole. (AC: 1)
- Add `src/layout/aside.test.ts`, driving a region through the render entry at fixed widths so no probe or terminal can reach the assertions, and covering full-width lines above and below the region. (AC: 1)
- Document the region in `docs/view-language.md` beside the other directives, including the alignment token, the five columns the gutter costs, and the width below which the column is dropped. (AC: 1)
- Drop the aside and its separator when the remaining main column would fall under 40 printed columns of box content, and render the region full width instead. (AC: 2)
- Pad the shorter column against the taller one, centred by default with the odd row below, and honour the optional `top` or `bottom` token on the opening directive. (AC: 3)
- Hold the separator on a constant printed column for the whole region, and assert that an art row survives the frame unchanged rather than relying on a bypass the language does not have. (AC: 4)
- Degrade an unresolvable aside name to the full-width main flow rather than letting the load error escape and take the block down. (AC: 5)
- Add the rendered Tayo art as `views/tayo.view` at the package root, copied from `sandbox/views/tayo.view` and stripped of the `@box`, `@head`, `@right` and `@endbox` lines it carries, so the file the welcome names is 13 bare rows of 28 cells and ships in the tarball. The art rows themselves are copied byte for byte, never regenerated or reflowed. (AC: 6)
- Rewrite `views/welcome.view` so its health-check line and its `@rule` stay full width at the top, then a region opened by `@aside tayo` holds the four existing sections and closes before `@foot message`. Keep the line-by-line commentary that makes this file the package tutorial, and keep every section's text exactly as it reads today. (AC: 6)
- Extend `scripts/verify-pack.mjs` to require the art view in the tarball listing and to render the welcome twice from the installed pack: once at a width that fits both columns, asserting a line carrying both an art cell and a section label, and once at the narrow width it already uses, asserting the sections survive without the art. (AC: 6)

## done-when

```yaml
# The region's own proof: composition at a fitting width with full-width lines around it, the drop at a narrow one, the centring default and its token, the verbatim art rows, and the unresolvable name.
- id: aside-tests
  verify: pnpm vitest run src/layout/aside.test.ts
  pass-if: exit == 0
# The no-regression floor. Note its reach honestly: the suite carries no snapshot, so it proves the corpus still renders and still contains what it asserts, not that every byte is unchanged. Byte-identity for aside-free templates is a constraint on the implementer, not something this command can observe.
- id: suite-green
  verify: pnpm test
  pass-if: exit == 0
# The directive layer gains a region and takes the search path as a new parameter, propagated through its recursive call; the signatures have to stay sound.
- id: typecheck
  verify: pnpm typecheck
  pass-if: exit == 0
# Zero warnings is the repo's standing bar.
- id: lint
  verify: pnpm lint
  pass-if: exit == 0
# Gates the built artifact and the tarball, not the source: it installs the pack and renders the welcome from it at two widths. The `files` whitelist ships the whole `views` directory, so a new view is carried automatically; what this gate really catches is an art file left outside that directory, and a region that composes nothing once installed.
- id: pack-renders
  verify: pnpm verify:pack
  pass-if: exit == 0
```

## clarifications

- Narrow terminal, decided by the human on 2026-08-01: drop the column entirely rather than stack it above the main flow, so the package's health check stays readable and honest on an 80-column terminal instead of pushing its content down.
- Content source, decided by the human on 2026-08-01: a named view only, neither an inline block nor a data field, because the whole motive of the primitive is to keep the pixels out of the readable template.
- Region scope, decided by the human on 2026-08-01: an explicit `@aside` / `@endaside` block rather than running to the end of the box, matching every other container in the language and leaving room for full-width content above and below the region, which is what the validated mockup has.
- Vertical alignment, decided by the human on 2026-08-01: centred by default, which reproduces the two-column mockup validated in this session, with a declared alignment available for the other cases.
- Author's call, open to challenge: the region always draws its separator in this first cut, because once the template no longer composes lines itself it can no longer draw one, and the validated look has it.
- Author's call, open to challenge: an unresolvable aside name degrades to the full-width flow rather than failing the block, on the ground that the narrow path already treats this column as droppable decoration.
- Author's call, raised by review on 2026-08-01 and open to challenge: the pack harness renders the welcome at two widths instead of one. Its single width today is 74, which leaves 70 columns of content, so the 33 the region spends would leave the main flow at 37 and the narrow path would drop the art at the very gate that is supposed to prove the art ships. Rather than move that deliberately narrow width, the harness gains a second, wider render and keeps the narrow one as the drop case.
- Author's call, raised by review on 2026-08-01 and open to challenge: the alignment token rides on the opening directive (`@aside tayo top`) rather than on a line of its own, because the acceptance demanded a declared alignment without ever naming its syntax, which left the public surface of the language to chance.
- Layout of the first consumer, validated by the human on 2026-07-31 against a mockup and against the working prototype `sandbox/views/welcome-tayo.view`: Tayo full height on the left, a vertical separator, the four LEARN / CREATE / ASK / EXPLORE sections on the right, and the health-check line then the `@rule` full width above the two-column zone. That prototype is the reference render and is retired once the region reproduces it.
- Author's call, raised by review on 2026-08-01 and open to challenge: the region takes the named view's body lines and honours no directive in them. The sandbox art is a full `@box` today, so without this the packaged art would open a nested box inside the region, which a non-goal forbids; the art therefore ships frameless.
