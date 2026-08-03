## target

Give the engine a generated CATALOGUE an LLM reads instead of exploring the source, so writing a `.view` costs one file rather than a tour of the code, which is literally what writing `views/welcome.view` took. The foundation is already laid by its sibling contract: the composition graph is data in `src/data/grammar.ts` that `renderBody` READS, the payload field names and the alignment words sit in `src/data/language.ts`, and `tagNames()` publishes the vocabulary without the ink. What is left is to DUMP that foundation and to close the loop around it. The dump cannot lie, because a word taken out of the table stops being read and the render changes. The loop is `check`, which needs no parser at all: an unknown tag comes back literally (`style.ts:466`) and a malformed directive falls through to the body, so a SURVIVOR in the output is the error itself, already located, and the three refusals in `template/render.ts:56-83` carry their own message. Per view the catalogue carries its path, its declarations and the payload it expects, derived from the slots it spends against `PAYLOAD_FIELDS`, so an agent can pick an existing view or copy it and adapt it under another name without opening `src/` once.

## non-goals

- No second parser and no grammar schema restating what a matcher already decides: `check` runs the engine and reads what it printed.
- The palette's VALUES stay private: the catalogue publishes tag NAMES, and the sequence a name resolves to belongs to `src/style.ts` alone.
- `check` reads no documentation and no generated file, so a stale catalogue can never make a verdict wrong: the words come from `src/data/` and the rest from the render itself.
- No new language surface: `banner` and `quote` gain no declaration, since `@fields` declares a LIST's column split (`parse.ts:114`) and neither has a list, so the payload they expect is DERIVED from the slots they spend instead.
- `scripts/` stays `.mjs`, and the generator therefore imports the BUILT module rather than parsing TypeScript as text.
- View composition with DATA stays out: `@aside` pastes the named view's raw body (`directives.ts:139`, measured, the slots printing literally), and fixing it carries its own design question about which data a nested view receives.
- The rendering logic stays code: what `@box`, `@aside` and `@each` DO with a body is not grammar and never enters the table.
- The composition table is not revisited: its sibling contract made it load-bearing and proved it so, and this one only READS it.

## hard-constraints

- The membership table lives in `src/data/` and `renderBody` READS it: a word removed from an entry stops being read, so the table cannot lie about the engine it describes.
- The generated catalogue is `agent/catalogue.json`, OUTSIDE `docs/` which stays human-facing: it is written for a machine reader, is 100% generated so its gate can be a byte diff, is committed, and ships in the package.
- Per view, the catalogue carries the PATH of its `.view` file, so an agent can copy one and adapt it under another name rather than starting from nothing.
- The catalogue separates the STABLE half, true of a VERSION, from the LIVE half `dict` prints, true only of an INSTALL: what `extendTags` registered and what this `viewsPath` resolves.
- The new export publishes tag NAMES only and leaves through `src/index.ts` like the rest of the API.
- `check` takes the template and a sample block, the block on stdin when it is not a second argument, and a template spending no slot checks with no data at all.
- The three existing refusals keep their exact messages: `check` REPORTS them and never rewraps or rewords them.
- `check` exits non-zero on an error and zero on a warning, so a hook or a CI step can gate on it without failing a deliberate choice.
- `src/bin/cli.ts` holds wiring only, a main() guard over parts tested elsewhere, matching what `src/bin/messagedisplay.ts` is excluded for.

## acceptance

1. Given `agent/catalogue.json`, When it is read, Then it carries every word declared in `src/data/language.ts` with its argument shape, what it opens, what closes it, and the containers it is read in.
2. Given `agent/catalogue.json`, When it is read, Then it carries every view of `views/` with the path of its `.view` file, what it declares, and whether it is static.
3. Given `columns`, `banner` and `hr`, When the catalogue states the payload each expects, Then it says a table for `columns` from the `rows` list it spends, a quote for `banner` from the `content` and `type` it spends, and none for `hr`.
4. Given a host process that called `extendTags` with a name of its own, When `dict` runs there, Then the live half carries that name and the resolvable views in their resolution ORDER, while `agent/catalogue.json` carries neither.
5. Given `dict`'s output and `agent/catalogue.json`, When either is read, Then neither contains an ESC byte or any SGR sequence, the palette's values having never left `src/style.ts`.
6. Given a template carrying `@box bear` or an unknown tag, When `check` runs it against a sample block, Then each is named with its line and the command exits non-zero, while a WELL-FORMED template reports nothing at all.
7. Given a sample block carrying a field the template never spends, When `check` runs, Then it is reported as a WARNING and the exit code stays zero, a view narrowing what it shows being a legitimate choice.
8. Given `docs/` and `agent/` both absent from the tree, When `check` runs on a template, Then it reports exactly what it reports with them present, no verdict of its own having depended on a file it does not execute.
9. Given a word added to `src/data/language.ts` without regenerating, When the gate runs, Then it fails naming `agent/catalogue.json` as stale, and an entry left behind for a word since deleted fails it too.

## tasks

- Add the per-directive ARGUMENT SHAPE to `src/data/grammar.ts`, the one half of the membership table the sibling contract did not need: what each word takes after it, so the catalogue states a call shape rather than a name alone. (AC: 1)
- Add `src/catalogue.ts` assembling the catalogue from the modules that own each part: the membership table, the tag names, and the views read through `src/template/load.ts`. (AC: 1, 2, 5)
- Derive each view's expected payload from the slots its body spends, resolved against `PAYLOAD_FIELDS` in `src/data/language.ts`. (AC: 3)
- Split the assembly into a STABLE half and a LIVE half, so one function serves both the generator and the command without either restating the other. (AC: 4)
- Add `src/catalogue.test.ts` pinning every word reaching the output, every view carrying its path, the payload derivation on the three shapes, and no ESC byte anywhere. (AC: 1, 2, 3, 4, 5)
- Add `src/check.ts`, rendering a template against a block and reporting three kinds: a directive still standing in the output, a tag still standing, and the engine's own refusal caught verbatim. (AC: 6)
- Report an arrived-but-unread field from the `__read` set the render already builds, as a warning that does not change the exit code. (AC: 7)
- Add `src/check.test.ts` covering each report kind, a WELL-FORMED template reporting nothing at all, and a run with neither `docs/` nor `agent/` on disk. (AC: 6, 7, 8)
- Add `src/bin/cli.ts` dispatching the two commands, reading the sample block from a second argument or from stdin, and register `cc-views` in `package.json` under `bin` and in `publishConfig.executableFiles`. (AC: 4, 6)
- Add `src/bin/cli.ts` to the exclusion table of `scripts/check-sidecars.mjs` with the reason the existing executable carries, that importing it RUNS it. (AC: 6)
- Add `scripts/gen-catalogue.mjs`, importing the built assembly from `dist/` and writing the stable half to `agent/catalogue.json`, with a check mode that regenerates in memory and fails on a diff without touching the file. (AC: 9)
- Chain the generator into `pnpm verify` after `verify:pack` so it reuses that build rather than paying a second one, and ship the file by adding `agent` to `files` in `package.json`. (AC: 9)
- Point `docs/CHEATSHEET.md`, which stays the HUMAN short version, at the two commands and at `agent/catalogue.json`, so the human file stops doubling as the machine reference. (AC: 1)
- Narrow the roadmap entry on the template-generating skill to the SKILL alone, the reference half it names as the real work being what this contract builds. (AC: 1)

## done-when

```yaml
# Named by FILE rather than left to the suite: it bites on ABSENCE, so it stays red until the module exists.
- id: catalogue-tests
  verify: pnpm vitest run src/catalogue.test.ts
  pass-if: exit == 0
# The same bite, and it carries the near-miss: a well-formed template must report nothing at all.
- id: check-tests
  verify: pnpm vitest run src/check.test.ts
  pass-if: exit == 0
# The staleness gate, in both directions, and nothing else in the repo checks it. It runs against dist/, so the build precedes it.
- id: catalogue-fresh
  verify: pnpm build && node scripts/gen-catalogue.mjs --check
  pass-if: exit == 0
```

## clarifications

- Toolchain, decided by the human on 2026-08-03: `scripts/` stays `.mjs` rather than moving to TypeScript, so no contributor is pushed onto a newer Node. Type stripping was measured working on the installed `v22.22.1`, so the constraint is a choice about the floor and not about feasibility, and it is what makes the generator import `dist/` rather than `src/`.
- Scope, decided by the human on 2026-08-03: one contract for the catalogue and the checker rather than one each, because the non-goals are shared and writing them twice gives them the right to diverge.
- Determinism, decided by the human on 2026-08-03: the composition graph becomes data the parser READS, rather than a hand-written table a test cross-checks. A table the engine does not execute can be wrong while staying complete, and complete-but-wrong is exactly what a catalogue must never be.
- Ordering, decided by the human on 2026-08-03: the catalogue ships before view composition. A generated catalogue absorbs a later engine change for free, so composition arrives already documented, where the reverse order would leave an agent reading `src/` to discover that it exists.
- Refactor bar, decided by the human on 2026-08-03: a relocation is worth doing when it makes the vocabulary homogeneous and the properties discoverable at no cost, which the two moves here are, and not worth doing when it invents language surface, which adding a declaration to `banner` and `quote` would have been.
- Split, decided by the human on 2026-08-03: the original contract covered 21 tasks and its done-when could only go green at the very end, which left no checkpoint and made the governor escalate for stagnation while real work was landing every turn. The engine half shipped as its own contract, and this one keeps the catalogue and the checker with their meaning of finished intact.
