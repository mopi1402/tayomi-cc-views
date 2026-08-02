## target

Give a host the two colour spellings the engine can MEASURE, as functions, so registering a colour does not mean typing an escape sequence. `extendTags` takes raw ANSI, and a chip and a cap derive from a colour only where the sequence names its pixels: a 256 index or a truecolor triplet. Today `docs/view-language.md` teaches that seam by showing `extendTags({ brand: "\x1b[38;5;75m" })`, a literal a reader has to decode and a host has to get right by hand, while the engine already holds the builder for one of the two forms privately (`indexed` in `style.ts`, which every named index in the palette is written with). Export the pair, and "register the colour alone and its chip and its cap follow" becomes something a host can express rather than transcribe.

## non-goals

- No background builder, no chip builder, no cap builder. The chip and the cap DERIVE from the colour, and shipping a way to hand-write them beside the derivation is an invitation to make the pair drift, which is the one thing that seam exists to prevent. A host wanting a fill that is not its own colour registers a `_bg` explicitly, which already works and stays the documented escape hatch.
- No builder for the base sixteen and no attribute builders (bold, dim). They name a slot rather than pixels, nothing derives from them, and they already have tag names.
- No named-colour parsing, no `#rrggbb` string form, no CSS names. One more spelling to validate, and the two ANSI forms are what the engine measures.
- No change to the palette's contents, to any tag name, or to a single rendered byte. Every named index in `BASE` is built by the function being exported and must resolve to the sequence it resolves to today.
- No new module. These are ANSI sequences, `style.ts` owns those, and it is one concept and not two.
- No change to `extendTags`, its report, or its totality.

## hard-constraints

- `ansi256` IS the private `indexed`, renamed and exported, never a second function beside it. Two spellings of one sequence is the drift this repo names in its own rules, and the palette's twelve named indices are the proof it would go unnoticed.
- Both builders are TOTAL and neither throws, under `extendTags`' own law: they are called in the same breath, at a host's startup, and a styling call must never cost the screen. A parameter outside the byte range CLAMPS to it and a fractional one ROUNDS, so every call produces a sequence a terminal can read.
- Clamping to `0..255`, the honest ANSI domain, and NOT to the measurable `16..255`. A host asking for index 4 gets exactly the trade the engine's own `blue` already has, a theme slot whose chip is not derived; refusing it would be the engine calling a legal colour illegal. What the range buys is that nothing a host can pass emits a malformed sequence.
- Composed from the constants already in `style.ts` (`ESC`, `EXT_FG`, `RGB_SEL`, `PARAM`), never from a retyped `38;2`. The module holds those because `capOf` and `chipOf` read the same numbers, and a builder writing its own copy would be free to disagree with the reader that has to recognise it.
- The round trip is the test that matters, and it is written as one: a colour built here, registered through `extendTags`, resolves a `_bg` and a `_cap`, and the ink is the one the luminance rule chooses. Asserting the bytes alone would pass on a sequence `chipOf` cannot parse.
- A near-miss for each clamp: below the range, above it, fractional, and not a number at all. A builder that only ever sees good input cannot tell a clamp from an absent one.
- `docs/view-language.md` stops teaching the hand-typed literal at the `extendTags` example, and `docs/display-host.md`'s export table gains the pair. A doc showing the raw form while the package exports a builder for it is the doc telling a reader to do it the hard way.

## done-when

```yaml
# The builders' own contract: the two shapes, the four clamps, and the round trip through extendTags to a derived chip and cap.
- id: style-tests
  verify: pnpm vitest run src/style.test.ts
  pass-if: exit == 0
# The palette is written with the renamed function, so every named index must still resolve to the byte it resolves to today. Nothing in the corpus may move.
- id: suite-green
  verify: pnpm test
  pass-if: exit == 0
# Two new public exports.
- id: typecheck
  verify: pnpm typecheck
  pass-if: exit == 0
- id: lint
  verify: pnpm lint
  pass-if: exit == 0
# The pack renders the palette end to end from the installed tarball, which is where a rename that silently changed a sequence would show.
- id: pack-renders
  verify: pnpm verify:pack
  pass-if: exit == 0
```
