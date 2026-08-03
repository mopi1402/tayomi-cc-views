## target

Close the catalogue's own hole: it tells an agent which views exist and which payload each expects, and nowhere does it say how to WRITE the thing that carries the data. An agent reading `agent/catalogue.json` alone learns that `banner` wants a quote payload spending `content` and `type`, and cannot type a single line that reaches it, since the fence, the decorator, its two attributes, the markdown that selects a table over a quote and the four line shapes the data parser recognises are written only in `docs/CHEATSHEET.md`, which is the HUMAN page and is not generated. The forms already exist as tokens the engine matches on: `BLOCK_HINT` and `DECORATOR_HINT` in `src/data/markup.ts`, the kind marker in `src/data/language.ts`, and the three matchers of `src/template/view-data.ts`. This contract moves the block's own tokens next to the others, makes the matchers compose from them, and dumps the assembled forms into the catalogue, so the file an agent reads answers the whole question rather than half of it.

## non-goals

- The data format itself does not change: this contract moves tokens and dumps forms, and the parser recognises exactly the line shapes it recognises today.
- No second parser: the forms are DECLARED beside the matchers they are spelled from, and what catches a wrong one is `check`, parked as `feat/view-check.md`.
- No tutorial: the catalogue states a form and what it does, never how to choose one, `docs/CHEATSHEET.md` staying the human page that explains.
- The palette's VALUES stay private, as they were: the catalogue publishes forms and names, never a sequence.
- `agent/catalogue.json` stays 100% generated and gated at the byte, so nothing here is hand-written into the file.

## hard-constraints

- Every form the catalogue states is spelled from the tokens the engine matches on, so renaming one reaches the dump with no edit beside it.
- The tokens the block format is built from live in `src/data/`, like every other shape more than one module must agree on.
- `src/data/markup.ts` keeps its exclusion from the sidecar gate: tokens derived from one word, with no behaviour of their own to state.

## acceptance

1. Given `agent/catalogue.json`, When it is read, Then it carries the FENCED carrier's form and the DECORATOR's form, each spelled from the tokens the engine engages on.
2. Given the decorator's entry, When it is read, Then it names the two attributes an author may write and the payload-less form a static view is asked for with.
3. Given the block's entry, When it is read, Then it carries every line shape the data parser recognises, each with what it does, and says an unrecognised line is ignored rather than refused.
4. Given each payload shape, When it is read, Then it says what SELECTS it in the markdown under a decorator, and the quote carries the form of its kind marker.
5. Given `type` or `tone` renamed in `src/data/language.ts`, When the catalogue is regenerated, Then the decorator's attributes follow with no edit beside them, the matcher that reads an attribute composing from the very same names.

## tasks

- Move the block format's own tokens into `src/data/markup.ts`, the pair separator, the item bullet and the nesting indent, and compose the three matchers of `src/template/view-data.ts` from them. (AC: 3)
- Compose the decorator's attribute matcher from `FIELD_TYPE` and `FIELD_TONE` rather than spelling the two names a second time inside the pattern. (AC: 2, 5)
- Add a `block` section to `src/catalogue.ts` carrying the two carrier forms, the decorator's attributes and its payload-less form, and every data line shape with what it does. (AC: 1, 2, 3)
- Carry, per payload shape, what selects it in the markdown under a decorator, with the kind marker's form on the quote. (AC: 4)
- Cover the new section in `src/catalogue.test.ts`, the derivation included, and regenerate `agent/catalogue.json`. (AC: 1, 2, 3, 4, 5)

## done-when

```yaml
# Read on the GENERATED file rather than in the suite: it bites on absence today, and afterwards it is the shape a consumer depends on.
- id: catalogue-block
  verify: node -e "const c=require('./agent/catalogue.json'); if (!c.block || !c.block.carriers || !c.block.lines) process.exit(1)"
  pass-if: exit == 0
# Where the derivation is stated: a form spelled by hand rather than from the token fails here.
- id: catalogue-tests
  verify: pnpm vitest run src/catalogue.test.ts
  pass-if: exit == 0
# The byte gate, unchanged: the new section is generated like the rest or it does not ship.
- id: catalogue-fresh
  verify: pnpm build && node scripts/gen-catalogue.mjs --check
  pass-if: exit == 0
```

## clarifications

- Scope, decided by the human on 2026-08-03: the block format ships BEFORE the checker. The catalogue exists so an agent can write a view; a file that names every view and no way to feed one leaves the agent exactly where it started, where the checker only judges what is already written.
- Declared over derived, decided by the human on 2026-08-03: a form an agent reads is written out and a matcher is not asked to explain itself, exactly as `TAKES` states what a directive takes. What makes the declaration honest is that every TOKEN inside it comes from the module the matcher composes from, so the two cannot drift on a rename, and what catches a wrong shape is `check` running the engine.
