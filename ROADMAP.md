# Roadmap

Intentions, not commitments. Each entry states what it would bring and what is still under study.

## A skill that generates `.view` templates (expected)

Writing a `.view` by hand is the adoption wall: the language is small, but you have to learn it before your first box shows up, and it is strict by design in ways a human trips on (directives at column 0, no indentation; body whitespace is significant content, it is how columns align). A skill would take "I want a deploy report with a title and status chips" and produce the template, the carrier line the agent writes, and the file where the resolution order will find it.

The reference half is done and is no longer part of this entry: `agent/catalogue.json` holds the language generated from the tables the engine executes, and `cc-views dict` prints the same thing for THIS install, with the tags `extendTags` added and the views the search path resolves in their resolution order. What is left here is the SKILL: turning a sentence into a template, choosing the carrier, and putting the file where the resolution order will find it.

## A standalone examples project (idea)

A separate project the user opens in Claude Code: `npm install`, the hook already wired, and every example view shipping with the block to ask the agent for, so each one is SEEN working rather than read about.

The boundary it enforces: the package tarball carries only what has a runtime contract (the engine, and the bundled `views/` where the `welcome` health check lives), while examples live at documentation scope. The graduation rule when the line blurs: a view that proves USEFUL as a default moves into the bundled `views/`; a view that only teaches stays an example.

## Art authored as source, not pasted as bytes (idea)

Give the language a small grid primitive so a mark can be WRITTEN instead of encoded: a palette line mapping one character to a `{{tag}}`, then rows of those characters, expanded to half-blocks at render.

Neither motive is about drawing pictures. An agent could WRITE it, where `views/tayo.view` cannot be produced by any writing tool in this stack (its rows are raw SGR sequences and the tools eat the ESC byte, so the file is copied byte for byte and never regenerated). And the colours would follow the theme, where pre-rendered art cements its palette: that one file holds 30 distinct 24-bit values under every theme and every tone.

Weight, measured on the packaged art (13 rows of 28 cells): 10621 bytes as it ships, 377 for the same picture as a grid. The templating is not the cost, the anti-aliasing is. What it does NOT replace is pre-rendering: a small palette is a decision taken when a mark is DESIGNED, never a compression applied to a photograph afterwards, so a real image keeps arriving as a pre-rendered `.view`. Still under study: the ceiling of what stays writable by hand (a 16x16 mark is 8 rows, the packaged one is 13 and already past comfort), and whether the palette admits raw values for the cases a theme must not repaint.

## Respect the theme the user chose (under study)

Nearly everything the engine draws already follows it: the palette spends ANSI slots, which a terminal maps through whatever theme is loaded, so a box outline, a status chip and a tone are already the user's own colours.

One thing overrides that on purpose, and it is the whole open question. `code` is the single truecolor value in the palette, pinned to `rgb(177,185,249)`, Claude Code's own periwinkle, because CC spends no palette slot for a code span: it emits that fixed value. Pinning the exact RGB is what makes a code span inside a view match the ones CC draws around it, in every terminal. What it costs is that the value tracks CC's DARK theme and answers to no theme of the user's, so the day CC moves its accent, or a light theme is loaded, the colour is wrong and nothing on screen says so.

Matching Claude Code exactly and obeying the user's theme are one decision pulling two ways, and the engine has no way to ask which the user would rather have. A host-supplied override is the cheap shape, since the palette is a single unexported table with one reader, but a knob invites a view to be desaturated against its own design and still does not answer what the DEFAULT should be. Cheap to leave open: whichever way it resolves, it is one line in `src/style.ts`. (Pre-rendered art is the other half of the problem, and the grid primitive above is already its answer.)

## Per-view opt-out configuration (under study)

Let each level of the stack disable views it does not want, without forking anything: a plugin embedding cc-views could ship only the bundled views it stands behind, and a project could disable a specific view coming from a plugin, which would then show as the plain data the transcript already holds.

Disabling is the missing sibling of shadowing, which ordered resolution already provides: a resolution outcome that says "do not engage" instead of "engage with my template". It would give [docs/caveats.md](docs/caveats.md)'s mis-render caveat an immediate workaround, at the price of the whole message losing its dressing, which is the user's trade to make view by view.

The hard question is the boundary of what a USER may disable: a plugin relying on cc-views for a load-bearing display (a strict view reporting its render outcome to a gate) would break if the user could switch that view off. The likely shape is a distinction the plugin declares, between views required by its contract and views that are cosmetic, with only the latter open to project-level opt-out.
