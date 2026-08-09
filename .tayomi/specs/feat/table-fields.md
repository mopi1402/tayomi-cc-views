## target

Let a decorated markdown table carry what a fenced `view:` block carries today, so a load-bearing view can move onto the decorator without changing one byte of its template or its render. Three things are missing for that. A two-column table is read as `rows`, never as the NAMED FIELDS a sectioned template spends. The decorator path receives no `DisplayHost`, so nothing may be injected into it and no view may be strict on it. And a host's gate judging what was displayed can read the block format (`parseData` is exported for exactly that) but has no reader for a decorated zone.

The reason is the FALLBACK, and it is the whole point of the ticket. Where this hook does not run, on Ctrl+O, on a resumed session, in a re-read transcript, a fenced block prints its pseudo-yml as raw text and reads as debris; a table prints as a table. The failure modes part the same way: a broken fence spills the rest of the message, a broken row stays one raw row.

## non-goals

- No new directive and no change to the template language. `views/*.view` files are untouched, which is the property that makes the render identical.
- No change to what a table renders TODAY. `rows` and `head` keep their meaning, their shape, and their precedence.
- No new payload shape. The pipe table and the blockquote stay the two the decorator knows.
- No migration of any view in this repo, and none of TAYOMI's. Moving `view:tldr` onto the decorator, rewriting its steering rule and porting its Stop gate belong to TAYOMI's own contract, which this one only enables.
- No retirement of the fenced carrier. Both stay, and a host chooses.

## hard-constraints

- A payload becomes NAMED FIELDS in ONE module, `src/template/view-data.ts`, beside `parseData`. Two ways in, one grammar out: a scalar field, a list field, and nothing else. A second reading of the same idea written elsewhere is the drift this repo forbids.
- The named reading applies to a table of TWO columns and to no other arity. The first cell NAMES the field, lowercased and trimmed; an empty first cell continues the field above, which is already the rule box, columns and lines print by; a value cell opening `- ` appends an item to that field's list, exactly as the block format's own item line does; any other value is a scalar. A row whose field name is not a legal field name is skipped, never a parse failure: this layer is total, like `parseData`.
- The derived fields are written UNDER `rows` and `head`, never over them. A table labelling a row `rows` changes nothing about what any existing view draws, so the corpus cannot move.
- The derivation runs where the TEMPLATE is known, so `@fields` splits a table-carried list exactly as it splits a block-carried one. Without it a sectioned view works and a tabular one silently loses its columns, which is a half-migration nobody would trust. The seam is therefore the rows the carrier already built, read once the template is loaded, and their arity is what the row objects themselves say. Nothing is neutralised a second time: a cell arrives from the carrier already inert.
- This rests on the surplus-pipe rule (a row a cell LONG rejoins into its last column). A field whose value is a sentence carrying an unescaped `|` is ordinary, and refusing it would print the whole block raw for a character no author will think to escape.
- The host reaches BOTH carriers. `renderDecorated` receives it, injects into a decorated zone, honours `strict` there, and the strict outcome is decided ONCE per message whoever drew the view, still reported on the final delta alone. Fail-open per zone is unchanged: a strict view that throws shows its `failedLine`, every other one shows its raw markdown, decorator line included.
- `inject` receives the PARSED data rather than the payload text. A decorated zone has no block body to hand, and a host re-parsing a body the engine already parsed is the second reader this repo keeps refusing. `DisplayHost.inject` changes shape, the package majors, and `docs/display-host.md` says so.
- A reader of the view zones of a message is EXPORTED, both carriers, name and data per zone, no render and no template loaded. It is what a gate judges the screen with, and its documented limit is that a list arrives unsplit, `@fields` being the template's business and not the reader's.
- The proof of no regression is a test and not a claim: the same TL;DR written as a fenced block and as a decorated table renders to IDENTICAL bytes, injection included. The corpus is the floor under it, every existing message rendering exactly as it renders today.

## done-when

```yaml
# The new reading's own contract: the two-column rule, the continuation cell, the list item, the illegal name, the precedence of rows and head.
- id: view-data-tests
  verify: pnpm vitest run src/template/view-data.test.ts
  pass-if: exit == 0
# The carrier's side: a decorated table read as fields, a three-column one still read as rows, an injected zone, a strict zone that throws.
- id: decorator-tests
  verify: pnpm vitest run src/carrier/decorator.test.ts
  pass-if: exit == 0
# Where the two halves meet: the host on both carriers, one outcome per message, and the byte-identity of the two carriers on one payload.
- id: pipeline-tests
  verify: pnpm vitest run src/pipeline.test.ts
  pass-if: exit == 0
# @fields must split a table-carried list, and inject must see the parsed data.
- id: render-tests
  verify: pnpm vitest run src/template/render.test.ts
  pass-if: exit == 0
# The no-regression floor: the whole corpus still renders what it asserts.
- id: suite-green
  verify: pnpm test
  pass-if: exit == 0
# A public signature changes and a public reader arrives.
- id: typecheck
  verify: pnpm typecheck
  pass-if: exit == 0
- id: lint
  verify: pnpm lint
  pass-if: exit == 0
# Gates the tarball: the exported reader has to be reachable from the installed pack, not just from source.
- id: pack-renders
  verify: pnpm verify:pack
  pass-if: exit == 0
```
