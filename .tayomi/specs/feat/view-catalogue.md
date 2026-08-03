## target

Give the engine a generated CATALOGUE an LLM reads instead of exploring the source, so writing a `.view` costs one file rather than a tour of the code, which is literally what writing `views/welcome.view` took. The foundation is laid: the composition graph is data in `src/data/grammar.ts` that `renderBody` READS, with the per-directive argument shape now beside it in `TAKES`, the payload field names and the alignment words sit in `src/data/language.ts`, and `tagNames()` publishes the vocabulary without the ink. What is left is to DUMP that foundation into `agent/catalogue.json` and to gate it against drift, in both directions. The dump cannot lie, because a word taken out of the table stops being read and the render changes. Per view it carries the path of the `.view` file, what the view declares and the payload it expects, derived from the slots the body spends against `PAYLOAD_FIELDS`, so an agent picks an existing view or copies one and adapts it under another name without opening `src/` once. The CHECKER that closes the loop around it is its own contract, `feat/view-check.md`, and rides the `src/bin/cli.ts` this one wires.

## non-goals

- No second telling of the language: the catalogue is a DUMP of the tables the engine executes, never a hand-written description, which could stay complete while being wrong.
- The palette's VALUES stay private: the catalogue publishes tag NAMES, and the sequence a name resolves to belongs to `src/style.ts` alone.
- No new language surface: `banner` and `quote` gain no declaration, since `@fields` declares a LIST's column split (`parse.ts`) and neither has a list, so the payload they expect is DERIVED from the slots they spend instead.
- The engine is not touched: this contract READS `src/data/` and `src/template/load.ts`, and adds no behaviour to the render.
- The composition table is not revisited: its sibling contract made it load-bearing and proved it so, and this one only reads it.
- The CHECKER is out of scope, `src/check.ts` and the `check` command belonging to `feat/view-check.md`: this contract adds the `dict` command and the CLI wiring the pair shares.
- `scripts/` stays `.mjs`, and the generator therefore imports the BUILT module rather than parsing TypeScript as text.

## hard-constraints

- The generated catalogue is `agent/catalogue.json`, OUTSIDE `docs/` which stays human-facing: it is written for a machine reader, is 100% generated so its gate can be a byte diff, is committed, and ships in the package.
- Per view, the catalogue carries the PATH of its `.view` file, so an agent can copy one and adapt it under another name rather than starting from nothing.
- The catalogue separates the STABLE half, true of a VERSION, from the LIVE half `dict` prints, true only of an INSTALL: what `extendTags` registered and what this `viewsPath` resolves.
- The new export publishes tag NAMES only and leaves through `src/index.ts` like the rest of the API.
- `src/bin/cli.ts` holds wiring only, a main() guard over parts tested elsewhere, matching what `src/bin/messagedisplay.ts` is excluded for.

## acceptance

1. Given `agent/catalogue.json`, When it is read, Then it carries every word declared in `src/data/language.ts` with its argument shape, what it opens, what closes it, and the containers it is read in.
2. Given `agent/catalogue.json`, When it is read, Then it carries every view of `views/` with the path of its `.view` file, what it declares, and whether it is static.
3. Given `columns`, `banner` and `hr`, When the catalogue states the payload each expects, Then it says a table for `columns` from the `rows` list it spends, a quote for `banner` from the `content` and `type` it spends, and none for `hr`.
4. Given a host process that called `extendTags` with a name of its own, When `dict` runs there, Then the live half carries that name and the resolvable views in their resolution ORDER, while `agent/catalogue.json` carries neither.
5. Given `dict`'s output and `agent/catalogue.json`, When either is read, Then neither contains an ESC byte or any SGR sequence, the palette's values having never left `src/style.ts`.
6. Given a word added to `src/data/language.ts` without regenerating, When the gate runs, Then it fails naming `agent/catalogue.json` as stale, and an entry left behind for a word since deleted fails it too.

## tasks

- Add `src/catalogue.ts` assembling the catalogue from the modules that own each part: the membership table with its argument shapes, the tag names, and the views read through `src/template/load.ts`. (AC: 1, 2, 5)
- Derive each view's expected payload from the slots its body spends, resolved against `PAYLOAD_FIELDS` in `src/data/language.ts`. (AC: 3)
- Split the assembly into a STABLE half and a LIVE half, so one function serves both the generator and the command without either restating the other. (AC: 4)
- Add `src/catalogue.test.ts` pinning every word reaching the output, every view carrying its path, the payload derivation on the three shapes, and no ESC byte anywhere. (AC: 1, 2, 3, 4, 5)
- Add `src/bin/cli.ts` dispatching `dict`, and register `cc-views` in `package.json` under `bin` and in `publishConfig.executableFiles`. (AC: 4)
- Add `src/bin/cli.ts` to the exclusion table of `scripts/check-sidecars.mjs` with the reason the existing executable carries, that importing it RUNS it. (AC: 4)
- Add `scripts/gen-catalogue.mjs`, importing the built assembly from `dist/` and writing the stable half to `agent/catalogue.json`, with a check mode that regenerates in memory and fails on a diff without touching the file. (AC: 6)
- Chain the generator into `pnpm verify` after `verify:pack` so it reuses that build rather than paying a second one, and ship the file by adding `agent` to `files` in `package.json`. (AC: 6)
- Point `docs/CHEATSHEET.md`, which stays the HUMAN short version, at `dict` and at `agent/catalogue.json`, so the human file stops doubling as the machine reference. (AC: 1)
- Narrow the roadmap entry on the template-generating skill to the SKILL alone, the reference half it names as the real work being what this contract builds. (AC: 1)

## done-when

```yaml
# Named by FILE rather than left to the suite: it bites on ABSENCE, so it stays red until the module exists.
- id: catalogue-tests
  verify: pnpm vitest run src/catalogue.test.ts
  pass-if: exit == 0
# The staleness gate, in both directions, and nothing else in the repo checks it. It runs against dist/, so the build precedes it.
- id: catalogue-fresh
  verify: pnpm build && node scripts/gen-catalogue.mjs --check
  pass-if: exit == 0
```

## clarifications

- Split, decided by the human on 2026-08-03: the catalogue and the checker become one contract each, reversing the earlier decision to hold them together. They are independent deliverables with their own finish lines, a file gated at the byte for one and the engine's own verdict for the other, and holding them together left a done-when red on absence for thirteen tasks with no checkpoint in between. The shared non-goals are restated in both rather than cross-referenced, and each contract names the other so the pair stays legible.
- Toolchain, decided by the human on 2026-08-03: `scripts/` stays `.mjs` rather than moving to TypeScript, so no contributor is pushed onto a newer Node. Type stripping was measured working on the installed `v22.22.1`, so the constraint is a choice about the floor and not about feasibility, and it is what makes the generator import `dist/` rather than `src/`.
- Determinism, decided by the human on 2026-08-03: the composition graph is data the parser READS, rather than a hand-written table a test cross-checks. A table the engine does not execute can be wrong while staying complete, and complete-but-wrong is exactly what a catalogue must never be.
- Argument shape, decided by the human on 2026-08-03: `TAKES` DECLARES what each word takes rather than deriving it from the matchers, because `@foot message` and `@aside tayo` are the same one-word matcher and no pattern tells a field of the block from the name of a file. What catches a wrong kind is `check`, running the engine, which is why the declared half is acceptable here and nowhere on the correctness path.
- Ordering, decided by the human on 2026-08-03: the catalogue ships before the checker. The catalogue is what the human asked for first, and it is what an agent needs to write a view at all, where the checker only judges one already written.
