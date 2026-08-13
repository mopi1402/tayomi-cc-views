**One shape, one constant, and `src/data/` when it has several readers.** A token, a delimiter, a marker: written once, never retyped, and regexes compose from it. When more than one module must AGREE on the value, it goes in `src/data/` by domain (`markup.ts` for the shapes, `marks.ts` for the reserved control codes, `language.ts` for the words a template author types) and everything imports from there, tests included. Three modules picking their own code is how two of them pick the same one.

A WORD is a constant too, and the ones the product is named on are the first: `view` sits at the root of `markup.ts` and the fence, the decorator token, the file extension, the directory and the env vars all derive from it. Every `@directive` sits in `language.ts` and every matcher composes from there. Renaming either is a major version, and it should cost one edit, never a sweep.

The test is HOW MANY MODULES MUST AGREE, never data-versus-logic. A value one module reads stays with the code that reads it, however table-shaped it looks: the palette sits in `style.ts` beside `resolveTag`, which is the only thing on earth that reads it, and keeping it unexported is what stops any module growing its own opinion about a colour. `src/data/` holds FORMS several readers share, never meanings.

Split a module by CONCEPT when it grows, never by the nature of its values. Splitting by nature separates exactly what changes together.

A module becomes a DIRECTORY the day it gains that second concept, never because of the storey it occupies: `style.ts` and `pipeline.ts` are the two ends of the chain and stay single files. A directory holding one file names a split nobody has designed yet, and the file inside it still has to be called something, where `index.ts` already means the package's public entry. Waiting costs nothing, because `exports` publishes `src/index.ts` alone and every import names its file under `nodenext`: the move is a rename the typecheck proves complete, never a search for the sites it missed.

**No magic number, no bare literal.** Anything a reader would have to decode gets a name: widths, offsets, escape sequences, sentinels, thresholds. **Tests included**, and first of all there, since a test is read to learn what the code is supposed to do. `expect(out).toContain("\x1b[1;97m")` says nothing; `seq("box_title")` says everything.

Prefer DERIVING over naming a copy: ask the module that owns the value (`renderTags(tagMark("fail"))`) rather than declaring a second constant that is free to drift from it. Name a copy only for a value the owner deliberately does not expose.

**Every module answers for itself.** `foo.ts` is tested by `foo.test.ts` beside it, or it says IN WRITING why it is not, in the exclusion table of `scripts/check-sidecars.mjs`, which gates it. A reason there is a decision; anything reading "not yet" belongs in the suite instead. The gate bites both ways, or the table rots into a list of excuses: an entry naming a module that has since gained a test, or that no longer exists, fails too.

Coverage counts lines a suite happened to execute, which a test driving the whole engine from the front door satisfies without pinning one module's edge. A sidecar is where that module's OWN contract is written, so the day it changes the failure lands on it and not three layers away. Tests typecheck like the rest: a fixture that no longer matches the shape it drives proves nothing.

Three kinds, and only the first is a sidecar. A suite answering for a PATH rather than a module lives in `tests/`, exempt by location so there is no allowlist to keep in step. End to end is `scripts/verify-pack.mjs` alone: it packs, installs and spawns the real binary, and nothing else here crosses a process.

A near-miss deserves a case as much as a hit. Every matcher in this engine is built so a malformed line falls through to the BODY, where an author sees it printed: a test that only ever feeds it valid input cannot tell that apart from a matcher that swallows.

**Only a template writes presentation.** A `{{tag}}` resolves at the end of a view's render (`template/render.ts`) and in the host's `strict.failedLine`, nowhere else. Text able to open a colour is able to close one the render meant to keep, and to paint a line in a tone that contradicts what the line says.

Two seams enforce it. The pipeline runs no tag pass, so a tag in the model's prose is text. And message text is neutralised (`inert`, `style.ts`) where it becomes a scope value: `render.ts` for a block, `cell()` for a decorated table. Neutralise first, style second, or a carrier's own emphasis dies with the model's markup.

**Comments only where the code cannot speak.** A why, a trap, a non-obvious decision. Short. No paraphrase of the line below.

**Nothing deploys untested, and a deploy must argue for itself.** Before proposing any deploy, name what the change still needs that no local bench can give: an edge only Claude Code fires, a boundary only a real install crosses. If every open question has a cheaper bench (a build, a sidecar case, a hook line in a local settings file), that bench runs FIRST and there is no deploy. When a deploy IS the test, it goes through the local Verdaccio and nowhere else: the public registry carries only what a rehearsal already proved, and no other user ever pays for an experiment.

**A local deploy is a written procedure, never an improvisation.** Any time a change has to be SEEN inside a real consumer, the TAYOMI plugin first of all, open `docs/contributing/manual-checks.md` BEFORE the first command and follow it step for step. Every step there is one that nothing on screen reports: no version bump and `plugin update` copies nothing, no rebuild and the bundle still carries the old engine, no restart and the session keeps the engine it loaded. The old render keeps drawing, identical, as if it had all worked. That file also names the one line that turns "it looks right" into a measurement: the engine version read INSIDE the plugin's cached copy, which is the only place the whole chain answers at once.

Never copy a `.view` into a consumer's tree to shorten the chain. The engine resolves a name through ORDERED directories on purpose, so a copy is both wiped by the next update and worthless as evidence: the same name resolves from this repo's own `views/` and draws the same screen, and the render then proves the thing you did not test.
