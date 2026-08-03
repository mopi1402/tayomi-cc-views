## target

Let a view DRAW another view, rendered and fed data, so a layout can be composed instead of retyped. Today nothing does: `@aside` names a view and pastes its BODY as text (`directives.ts:139`), deliberately, because an aside column is measured art and a nested box would open a region the column cannot close. So `@aside banner` prints `${content}` literally, and the layout an author asks for out loud, a banner beside some text and the `lines` view under it, cannot be written at all. This contract adds the one word that was missing, `@use <name> from <field>`, which loads the named view, builds its scope from the field it was pointed at, and renders its body with the included template's OWN tables, own field split and own tone. The named field is what makes it safe to place two views in one screen: `banner` and `quote` both spend `content`, and a shared scope would silently hand them the same one. `@aside` is not touched and keeps its job.

## non-goals

- `@aside` keeps pasting its named view as measured rows: it is a layout primitive for art, not an include, and the two words keep their own job.
- No include inside an `@each` body: a loop line goes to substitution per item, which is a different path and a different feature (a view drawn per row), and `@use` written there prints as text like any other unread word.
- No arguments on the include line: a view is fed a FIELD of the block, never a list of inline pairs, so there is no second data language to parse and to describe.
- No catalogue and no checker: they ship under `.tayomi/specs/feat/view-catalogue.md` and this contract is what they will have to describe.
- No change to what the bundled views draw: every one of them renders byte-identical, which is the regression oracle.

## hard-constraints

- The included view is rendered with ITS OWN declarations: its `@text` tables, its `@fields` split and its `@tone` default, never the caller's, or a view changes look depending on who drew it.
- The tone slot of an included view is filled AT INCLUSION, before the caller's own single tone pass runs over the whole output, since that pass would otherwise paint a banner's band in the caller's colour.
- `@use` draws the view or it DRAWS ITSELF: a name that resolves nowhere, a `from` naming a field that is absent, and a field holding no object all print the line as written, which is the near-miss rule the whole engine is built on.
- The include chain is guarded by NAME: a view already being drawn further up the chain prints the line instead of recursing, so a cycle terminates visibly rather than filling the stack.
- The width the main column of an aside will actually get is asked of `src/layout/aside.ts` and computed nowhere else, so the region's body is rendered at the width it will be composed at and the degrade rule keeps one home.
- The word and its `from` keyword are spelled in `src/data/language.ts` alone, and which containers read the word is an entry of `src/data/grammar.ts` like every other.
- An include claims a READ only once it is going to draw: counting it earlier disarms the guard that refuses a hollow render, and the message whose only consumer was that include then reaches the screen as a line of template source.
- The block format stays opaque to end of line and never becomes YAML: nesting rides on INDENTATION alone, one open mapping at a time, so prose carrying a colon is still ignored rather than read as a pair.

## acceptance

1. Given a view whose body carries `@use banner from alert` and a block whose `alert` holds a type and a content, When it renders, Then the band is drawn in place with BANNER's own colour, and the caller's own `@tone` is not what painted it.
2. Given `@use lines from status`, When it renders, Then the split `lines` declares is what divides the rows of `status`, and the caller's own field split has no say in it.
3. Given `@use hr`, carrying no `from` at all, When it renders, Then the rule is drawn, a view spending no slot needing no data to draw.
4. Given `@use` that cannot draw its view, When the view around it read data of its own, Then the line prints as written and everything else still draws; and When nothing else read the block, Then the render is REFUSED so the carrier hands the block back and the message stays readable.
5. Given a view that includes itself, directly or through a second view that includes it back, When it renders, Then the include that would repeat prints as written and the render finishes.
6. Given an aside region whose body includes a view that draws a box, When it renders, Then that box fits inside the column it is drawn in, its border whole on every row.
7. Given the whole bundled corpus, When the word has landed, Then every view renders byte-identical to what it rendered before.
8. Given a block whose key is followed by INDENTED pairs, When it is parsed, Then they become that key's mapping and reach the view fed from it, where they used to match nothing and be dropped in silence.

## tasks

- Add the include word and its `from` keyword to `src/data/language.ts`, and name the word in the entries of `src/data/grammar.ts` that read it, the loop body deliberately not among them. (AC: 1, 3)
- Add the matcher to `src/template/directives.ts`, parsed in two steps (the name, then what follows it) so a line that is not a well-formed include falls through to the body instead of swallowing what comes after. (AC: 1, 4)
- Draw an included view: load it by name, build its scope from the field it was pointed at or inherit the caller's when no field was named, and render its body with the included template's own tables and own field split. (AC: 1, 2, 3)
- Fill the included view's tone slot at inclusion, from its own declaration and from what its scope names, so the caller's single tone pass finds nothing left to paint there. (AC: 1)
- Make every failure one path that prints the line as written: a name resolving nowhere, an absent field, a field holding no object, and a name already being drawn further up the chain. (AC: 4, 5)
- Carry the chain of names being drawn down the render, so the guard reads it rather than counting a depth nobody can explain. (AC: 5)
- Move the main column's width out of `composeAside` into a function `src/layout/aside.ts` exports, and have the aside path render its region body at that width, so an included structure is composed at the size it was drawn for. (AC: 6)
- Add the sidecar cases for the include: each report of the failure path, the included view keeping its own tone against a caller declaring another, the field split coming from the included view, and the cycle terminating. (AC: 1, 2, 3, 4, 5)
- Add the aside width's own case to `src/layout/aside.test.ts`: a main column measured against a composed line, so the two can never disagree. (AC: 6)
- Add a worked composition to `tests/integration/` driving the corpus: a view including a banner and the lines view inside an aside region, which is the layout the target names. (AC: 1, 2, 6, 7)
- Write the manual check in `docs/contributing/manual-checks.md`: the composed layout on a real terminal, since no assertion answers whether the screen reads right. (AC: 6)
- Split the scope accessor in two: the walk that records nothing, and the lookup that records. The include probes with the first and claims the read with the second, only once the view draws. (AC: 4)
- Read an indented pair in `src/template/view-data.ts` as a mapping under the key above, deciding on the pair rather than up front so a key followed by nothing stays the empty list it has always been. (AC: 8)
- Add the parser's own cases: the mapping beside the block's other fields, the empty list unmoved, prose left ignored, and a list that already has items refusing the pair. (AC: 8)
- Pin the refusal in `src/template/render.test.ts`: an include that fell through counts no read, so a view whose only consumer it was throws and the block comes back raw. (AC: 4)

## done-when

```yaml
# Where the word's own contract is written, the failure path first: it is red until the include and the width function exist.
- id: include-tests
  verify: pnpm vitest run src/template/directives.test.ts src/template/view-data.test.ts src/template/render.test.ts src/layout/aside.test.ts
  pass-if: exit == 0
# The regression oracle: a new word must move no existing render, and this is also where the worked composition lands.
- id: corpus-unmoved
  verify: pnpm vitest run tests/integration/bundled-views.test.ts
  pass-if: exit == 0
```

## clarifications

- Ordering, decided by the human on 2026-08-03, reversing an earlier call: composition ships BEFORE the catalogue. A catalogue is a faithful description of the engine, so describing one that cannot compose views would send an agent to write `@use` with confidence and put a literal slot on screen. What the engine can do comes first, describing it comes second.
- Data, decided by the human on 2026-08-03: an included view is fed a NAMED FIELD rather than the caller's whole scope. It is the idiom `@each` already uses (a field holds an object, its keys become the scope), and it is what lets two views spending the same slot name sit on one screen, which sharing a scope silently forbids.
- Scope of the check, decided by the human on 2026-08-03: the deliverable is that an author, or an agent, can compose a layout, and no oracle answers that. The two criteria below guard against regression and against the word not existing; whether the composed screen reads right is a written manual check, deliberately.
- Two audiences, stated by the human on 2026-08-03: at RUNTIME the engine never shows an error, it draws or it hands the raw block back, so a user never loses what Claude sent. The loud refusal naming a reason belongs to the AUTHORING path, `check` under the catalogue contract, and never to the render.
