# Roadmap

Intentions, not commitments. Each entry states what it would bring and what is still under study. What ships leaves this file; what will not be built never enters it.

## Art authored as source, not pasted as bytes (idea)

Give the language a small grid primitive so a mark can be WRITTEN instead of encoded: a palette line mapping one character to a `{{tag}}`, then rows of those characters, expanded to half-blocks at render.

Neither motive is about drawing pictures. An agent could WRITE it, where `views/tayo.view` cannot be produced by any writing tool in this stack (its rows are raw SGR sequences and the tools eat the ESC byte, so the file is copied byte for byte and never regenerated). And the colours would follow the theme, where pre-rendered art cements its palette: that one file holds 30 distinct 24-bit values under every theme and every tone.

Weight, measured on the packaged art (13 rows of 28 cells): 10621 bytes as it ships, 377 for the same picture as a grid. The templating is not the cost, the anti-aliasing is. What it does NOT replace is pre-rendering: a small palette is a decision taken when a mark is DESIGNED, never a compression applied to a photograph afterwards, so a real image keeps arriving as a pre-rendered `.view`. Still under study: the ceiling of what stays writable by hand (a 16x16 mark is 8 rows, the packaged one is 13 and already past comfort), and whether the palette admits raw values for the cases a theme must not repaint.

## Per-view opt-out configuration (under study)

Let each level of the stack disable views it does not want, without forking anything: a plugin embedding cc-views could ship only the bundled views it stands behind, and a project could disable a specific view coming from a plugin, which would then show as the plain data the transcript already holds.

Disabling is the missing sibling of shadowing, which ordered resolution already provides: a resolution outcome that says "do not engage" instead of "engage with my template". It would give [docs/caveats.md](docs/caveats.md)'s mis-render caveat an immediate workaround, at the price of the whole message losing its dressing, which is the user's trade to make view by view.

The hard question is the boundary of what a USER may disable: a plugin relying on cc-views for a load-bearing display (a strict view reporting its render outcome to a gate) would break if the user could switch that view off. The likely shape is a distinction the plugin declares, between views required by its contract and views that are cosmetic, with only the latter open to project-level opt-out.
