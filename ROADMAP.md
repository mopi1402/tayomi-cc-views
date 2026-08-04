# Roadmap

Intentions, not commitments. Each entry states what it would bring and what is still under study.

The adoption wall this file opened on, writing a `.view` by hand, is no longer an intention: the reference is `agent/catalogue.json` and `cc-views dict`, the verdict is `cc-views check`, and the procedure is the `write-view` skill. See [the README](README.md#write-your-own-view).

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

## Reminding an agent to draw at all (not here, and the reason)

The shape, if anyone builds it: the MessageDisplay edge already knows whether a view drew, since `handleMessageDisplay` returns an envelope or `null`, so it leaves a marker; a `Stop` hook clears the marker or moves a counter; a `UserPromptSubmit` hook injects one line once the counter passes a threshold. Nothing in the engine would change, because `HostSource` is already a factory over the payload meta for exactly this kind of per-turn bookkeeping.

What made it look necessary, and then made it unnecessary, is the same measurement. An instruction teaching the decorator sits in the primacy zone whether it arrives through `CLAUDE.md` or through a `SessionStart` hook: both land as conversation-level context after the system prompt, and neither reaches the recency zone. Observed live, across one session and with the instruction unchanged: the agent decorated nothing while the conversation was about something else, and decorated every turn once the SUBJECT itself sat in the prompt. So the trigger is recency, and re-injection is the only mechanism that buys any, at a cost per turn that turns the instruction into background noise.

It is not this package's decision to take. An engine renders; WHEN to render is the consumer's policy, and the consumer already owns that seam: TAYOMI gates its own tl;dr with a `Stop` hook of its own, in its own repo, with no public API to hold still. What would reopen the question here is a fact rather than an intuition: someone installs the package, wires the instruction, and reports it never fires.
