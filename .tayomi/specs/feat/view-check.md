## target

Close the loop around the catalogue with `check`, the command an LLM runs on the `.view` it just wrote and that answers with the REASON it will not draw. Two audiences, and this is the second one: at runtime the engine may never erase what the model sent, so a malformed line falls through to the body and a broken view hands the raw block back (`pipeline.ts`), and a user still reads the warning Claude sent. At AUTHORING time that same silence teaches nothing, and the author needs a loud refusal that names what is wrong and where. `check` needs no parser at all: an unknown tag comes back literally (`style.ts`) and a malformed directive falls through to the body, so a SURVIVOR in the output is the error itself, already located, and the three refusals in `src/template/render.ts` carry their own message. It rides the `src/bin/cli.ts` its sibling contract `feat/view-catalogue.md` wires, and adds the second command to it.

## non-goals

- No second parser and no grammar schema restating what a matcher already decides: `check` runs the engine and reads what it printed.
- `check` reads no documentation and no generated file, so a stale catalogue can never make a verdict wrong: the words come from `src/data/` and the rest from the render itself.
- The RUNTIME stays fail-open: nothing here makes the render throw or the pipeline drop a block, and the loudness belongs to the command alone.
- The engine's own messages are not rewritten: `check` reports the three refusals it catches, verbatim.
- No new language surface, and no view gains a declaration so that it can be checked.
- The catalogue's assembly and its generator are not revisited: this contract ADDS a command to the CLI they wire.

## hard-constraints

- `check` takes the template and a sample block, the block on stdin when it is not a second argument, and a template spending no slot checks with no data at all.
- The three existing refusals keep their exact messages: `check` REPORTS them and never rewraps or rewords them.
- `check` exits non-zero on an error and zero on a warning, so a hook or a CI step can gate on it without failing a deliberate choice.
- `src/bin/cli.ts` holds wiring only, a main() guard over parts tested elsewhere, matching what `src/bin/messagedisplay.ts` is excluded for.

## acceptance

1. Given a template carrying `@box bear` or an unknown tag, When `check` runs it against a sample block, Then each is named with its line and the command exits non-zero, while a WELL-FORMED template reports nothing at all.
2. Given a sample block carrying a field the template never spends, When `check` runs, Then it is reported as a WARNING and the exit code stays zero, a view narrowing what it shows being a legitimate choice.
3. Given `docs/` and `agent/` both absent from the tree, When `check` runs on a template, Then it reports exactly what it reports with them present, no verdict of its own having depended on a file it does not execute.
4. Given the same sample block passed on stdin rather than as a second argument, When `check` runs, Then it reports exactly what the two-argument form reports and exits the same.
5. Given a template spending no slot at all, When `check` runs with no block, Then it checks the template, reports nothing and exits zero, rather than refusing for want of data.

## tasks

- Add `src/check.ts`, rendering a template against a block and reporting three kinds: a directive still standing in the output, a tag still standing, and the engine's own refusal caught verbatim. (AC: 1)
- Report an arrived-but-unread field from the `__read` set the render already builds, as a warning that does not change the exit code. (AC: 2)
- Add `src/check.test.ts` covering each report kind, a WELL-FORMED template reporting nothing at all, a run with neither `docs/` nor `agent/` on disk, and a template spending no slot checked with no data. (AC: 1, 2, 3, 5)
- Dispatch `check` from `src/bin/cli.ts`, reading the sample block from a second argument or from stdin and passing no data when the template spends no slot. (AC: 4, 5)
- Point `docs/CHEATSHEET.md` at `check` beside the `dict` line its sibling contract added, so the human short version names both commands once they both exist. (AC: 1)

## done-when

```yaml
# Named by FILE rather than left to the suite: it bites on ABSENCE, and it carries the near-miss, a well-formed template reporting nothing at all.
- id: check-tests
  verify: pnpm vitest run src/check.test.ts
  pass-if: exit == 0
```

## clarifications

- Two audiences, decided by the human on 2026-08-03: the engine and the command answer to different readers. At runtime nothing may erase what the model sent, so a broken view hands back the raw block rather than an error, and the user still sees the warning; at authoring time the LLM must take a loud refusal with the reason, ideally located. `check` is that second half, and it is why the engine gains no new error here.
- Split, decided by the human on 2026-08-03: the catalogue and the checker become one contract each, reversing the earlier decision to hold them together. They are independent deliverables with their own finish lines, a file gated at the byte for one and the engine's own verdict for the other, and holding them together left a done-when red on absence for thirteen tasks with no checkpoint in between. The shared non-goals are restated in both rather than cross-referenced, and each contract names the other so the pair stays legible.
- Determinism, decided by the human on 2026-08-03: `check` runs the engine rather than describing it. A survivor in the rendered output is the error, already located, so no schema and no second matcher can drift from what the render actually does.
