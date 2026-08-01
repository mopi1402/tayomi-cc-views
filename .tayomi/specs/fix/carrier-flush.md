## target

Stop the streaming carrier from printing a raw view fence and from swallowing a block that never closes, so a message carrying a view survives every flush boundary and reaches the screen whole.

## non-goals

- Not touching the render path: how a block renders, and how it fails open on a bad view, stay exactly as they are today.
- Not widening `engaged`: a message that never carries a view fence anywhere stays the host's to draw, untouched.
- Not retracting a marker already printed: nothing can take back a delta the screen already holds, which is the standing limit `src/pipeline.ts` documents for a tag cut mid-marker, and this fix does not lift it.
- No new runtime dependency, and no change to the public surface exported by `src/index.ts`.

## hard-constraints

- The final flush withholds nothing: whatever the engine cannot render on the last delta shows raw, because no later flush exists to reveal it. Measured on the witness today, a 50-character message ending on an unclosed block reaches the screen as 7 characters, 43 lost without a trace.
- Withholding stays confined to the non-final flush, on the same `final !== true` convention `src/pipeline.ts` already applies to the decorator one line below, so a caller that omits the flag keeps today's behaviour.
- Withholding is transient by construction: anything held back on a non-final flush is re-emitted by a later one, so no path can drop content rather than delay it.
- `slice` stays a pure function of the text before the flush and the flush's own delta, holding no offset and no state between flushes, which is what lets concurrent flushes of one message agree on nothing.
- Fail-open throughout: any oddity shows the original text, never a crash and never a blank screen.
- A closed block renders byte-identically to today, so the existing view corpus and the suite that pins it are untouched by this change.

## done-when

```yaml
# The two defects' own proof, in the module that has no test file today. It pins: a sweep over EVERY cut point of a witness message carrying a view block, asserting no raw fence survives on screen (10 of them leak today, cut 10 through 19, the whole opening fence line); the chunk counts the inbox recorded, 2, 9, 17 and 33, converging on the same screen as a single unchunked flush; and an unclosed block on the FINAL flush reaching the screen whole rather than being cut away.
- id: carrier-flush-tests
  verify: pnpm vitest run src/carrier/scan.test.ts
  pass-if: exit == 0
# The collision floor. Out-of-order and concurrent flushes of one message already have their harness in these two files; the change must leave them green, since a cut that depends on flush order would break here first.
- id: concurrent-flushes
  verify: pnpm vitest run src/platform/stream-state.test.ts src/carrier/decorator.test.ts
  pass-if: exit == 0
# The no-regression floor. Its reach, stated honestly: it proves the corpus still renders and still contains what it asserts, not that every byte is unchanged. Byte-identity for a closed block is a constraint on the implementer, not something this command observes.
- id: suite-green
  verify: pnpm test
  pass-if: exit == 0
# TypeScript compiles cleanly across the project, tests included.
- id: typecheck
  verify: pnpm typecheck
  pass-if: exit == 0
# ESLint over src stays clean with zero warnings tolerated.
- id: lint
  verify: pnpm lint
  pass-if: exit == 0
```
