## target

Turn the `.view` language's composition graph into DATA the engine reads, so a catalogue describing this language can be a dump of what runs rather than a second telling of it. Today which word is read inside which container is control flow spread through `renderBody` (`directives.ts:167-285`), where `bare ? null : match(HEAD_RE)` is a decision written in ink that no extractor will ever recover, and two vocabularies leak outside `src/data/` besides: the `@aside` alignment words typed as literals at `directives.ts:203` and again in the type and the padding that act on them (`aside.ts:14`, `:29`), invisible to `check-vocabulary` whose matcher only sees `@words`, and the payload field names spelled as object keys in `src/carrier/decorator.ts`, which are what decide that a view spending `rows` wants a table and one spending `content` wants a quote. Making the membership table LOAD-BEARING is the whole point and the only thing that makes the later catalogue honest: a word taken out of an entry stops being read, the render changes, and the suite falls, so the table cannot be wrong while staying complete. Nothing on screen may move: this contract adds no capability an author can see, it moves decisions from ink into data and proves the engine consults them.

## non-goals

- No catalogue, no `dict`, no `check` and no generator: this contract lays the foundation those read, and they ship under `.tayomi/specs/feat/view-catalogue.md`.
- The rendering logic stays code: what `@box`, `@aside` and `@each` DO with a body is not grammar and never enters the table, no table expressing that a rule collapses between two lines that printed.
- No new language surface: not a word an author types is added, removed or respelled.
- No change to what the engine draws: every render stays byte-identical, which is the oracle the whole contract is judged on.

## hard-constraints

- The membership table lives in `src/data/` and `renderBody` READS it before every matcher: a word taken out of an entry stops being read, which is what parts a load-bearing table from a description sitting beside the code.
- The relocations are PURE: the alignment words and the payload field names change module and never meaning, with the existing suite as the oracle that nothing moved.
- The table holds MEMBERSHIP only, never behaviour: what a container reads, what opens a block and what closes it, and nothing about what the opener then does.
- `@box bare` is its own container in the table rather than a flag on the box, since it draws the same body and reads strictly fewer words, which is exactly what an entry says.
- The table's sidecar proves it load-bearing by REMOVAL, never by restating its entries: a test asserting that the table says what it says would pass against a table nothing reads.

## acceptance

1. Given the whole bundled corpus, When the relocations and the table have landed, Then every view renders byte-identical to what it rendered before and the existing suite passes unchanged.
2. Given the membership table with `@head` taken out of `@box`'s entry, When a template writes `@head a title` inside a box, Then the title prints as a body line, which is only possible if the engine consulted the table.
3. Given the membership table with `@rule` taken out of `@each`'s entry, When a loop body carries a rule, Then it goes to substitution like any other line of the item.
4. Given `@box bare`, When its body carries `@head`, `@right`, `@foot` or `@frame`, Then none is read and each prints as a body line, the container's entry naming no chrome word at all.
5. Given the source outside `src/data/` and outside the tests, When it is searched for the alignment words, Then not one of them is spelled there, the type and the padding deriving from the language instead.
6. Given the payload field names, When the carrier builds a scope, Then it composes every key from `src/data/`, and the mapping saying which shape yields which fields is declared there for a later reader to derive a view's expected payload from.
7. Given the palette, When the tag vocabulary is enumerated, Then names come back and no escape sequence does, and a name a host registered through `extendTags` appears while the derived `cap` and `bg` forms are stated as a rule rather than listed.

## tasks

- Move the `@aside` alignment words into `src/data/language.ts` with the set they form, derive the type from that set, and add a guard so a near-miss token stays a near-miss. (AC: 5)
- Compose `src/layout/aside.ts` and `src/template/directives.ts` from those words, the type included, so all three former copies are gone. (AC: 1, 5)
- Move the payload field names into `src/data/language.ts` and declare which payload shape yields which of them. (AC: 6)
- Compose `src/carrier/decorator.ts` from those names, the row type included, so no payload key is spelled there any more. (AC: 1, 6)
- Add `src/data/grammar.ts` holding what each container reads and what closes each opener, with the query the engine asks before a matcher. (AC: 2, 3, 4)
- Make `renderBody` ask that query before the four chrome matchers and before honouring a rule in a loop body, so no membership decision is written in ink any more. (AC: 1, 2, 3, 4)
- Add `src/data/grammar.test.ts` proving the table load-bearing by REMOVAL, one case per container, plus the near-miss that the query answers no for a word a container does not read. (AC: 2, 3, 4)
- Export the tag NAME enumeration and the derived-form suffixes from `src/style.ts`, names never sequences, and publish both through `src/index.ts`. (AC: 7)
- Add the enumeration's cases to `src/style.test.ts`: the engine's own names, a name `extendTags` registered, no escape sequence in the output, and the suffix rule stated against a freshly registered colour. (AC: 7)

## done-when

```yaml
# The only case that proves anything here: a word removed from an entry stops being read. It bites on absence, so it is red until the table and its sidecar exist.
- id: grammar-tests
  verify: pnpm vitest run src/data/grammar.test.ts
  pass-if: exit == 0
# The regression oracle the whole contract is judged on: the table and the relocations must be invisible on screen.
- id: corpus-unmoved
  verify: pnpm vitest run tests/integration/bundled-views.test.ts
  pass-if: exit == 0
# The enumeration is the one new hole in a deliberately closed module, and this is where the boundary is pinned: the vocabulary leaves, the ink never does.
- id: style-tests
  verify: pnpm vitest run src/style.test.ts
  pass-if: exit == 0
```

## clarifications

- Split, decided by the human on 2026-08-03: the original contract covered 21 tasks and its done-when could only go green at the very end, which left no checkpoint and made the governor escalate for stagnation while real work landed every turn. This contract is the engine half, finished and verifiable on its own; the catalogue and the checker keep their own meaning of finished under `.tayomi/specs/feat/view-catalogue.md`.
- Determinism, decided by the human on 2026-08-03: the composition graph becomes data the parser READS rather than a hand-written table a test cross-checks. A table the engine does not execute can be wrong while staying complete, and complete-but-wrong is exactly what a catalogue must never be.
- Refactor bar, decided by the human on 2026-08-03: a relocation is worth doing when it makes the vocabulary homogeneous and the properties discoverable at no cost, which the two moves here are, and not worth doing when it invents language surface, which adding a declaration to `banner` and `quote` would have been.
