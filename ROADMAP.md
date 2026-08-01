# Roadmap

Intentions, not commitments. Each entry states what it would bring, what it
builds on, and what is still under study.

## A skill that generates `.view` templates (expected)

Writing a `.view` file by hand is the adoption wall today: the language is
small, but you have to learn it before your first box shows up, and it is
strict by design in ways a human trips on (directives live at column 0, no
indentation; body whitespace is significant content, it is how columns align).
A generator absorbs exactly that strictness. A skill would
take "I want a deploy report with a title and status chips" and produce the
template, the carrier line the agent writes, and the file in the right views
directory.

Two pieces, and the second is the real work:

- **The skill itself**: gather the intent, generate the `.view`, drop it where
  the resolution order will find it, show a rendered preview.
- **A reference the LLM can consume**: views are necessarily built from what
  already exists, so the generator needs the live inventory, the directives,
  the `{{tag}}` palette (including tags added by `extendTags`), the views
  already resolvable (to shadow or extend rather than duplicate), the two
  carriers and when to pick which. [view-language.md](docs/view-language.md)
  is the human reference; the skill needs the same facts in a compact,
  queryable form that tracks the installed version rather than a frozen copy.

## A standalone examples project (idea)

A separate project the user opens in Claude Code: `npm install`, the hook is
already wired, and every example view comes with the block to ask the agent
for, so each one is SEEN working rather than read about.

The boundary it enforces: the package tarball carries only what has a runtime
contract (the engine in `dist/`, the bundled `views/` where `welcome` the
health check lives). Examples are documentation, they live at documentation
scope: this project, and the repo's `examples/`. The graduation rule when the
line blurs: a view that proves USEFUL as a default (a real generic table, a
report) moves from the examples project into the bundled `views/`; a view that
only teaches stays an example.

## Art authored as source, not pasted as bytes (idea)

Give the language a small grid primitive so a mark can be WRITTEN instead of
encoded: a palette line mapping one character to a `{{tag}}`, then rows of
those characters, expanded to half-blocks at render.

Neither of its two motives is about drawing pictures:

- **An agent can write it.** The packaged `views/tayo.view` cannot be produced
  by any writing tool in this stack: its rows are raw SGR sequences and the
  tools eat the ESC byte, so the file is copied byte for byte and never
  regenerated. A grid of ASCII characters has no such problem, and the
  generator skill above could then produce a mark, not just a template.
- **The colours would follow the theme.** Pre-rendered art cements its palette:
  `views/tayo.view` holds 30 distinct 24-bit values and will hold them under
  every theme and every tone. A grid naming tags is repainted by the tag
  palette, so an icon answers `@tone` like the rest of the view.

Weight, measured on the packaged art (13 rows of 28 cells): 10621 bytes as it
ships, 377 bytes for the same picture as a grid, a factor of 28. The
templating is not the cost, the anti-aliasing is. Deduplicating the SGR runs
of today's file saves 3%, because a 30-colour anti-aliased image changes its
colour pair at nearly every cell; a mark authored by hand is flat by
construction, which is where that same deduplication finally pays.

What it does NOT replace: pre-rendering. Quantising the packaged art to the 16
base colours leaves 5 of them actually used, which destroys it. A small
palette is a decision taken when a mark is DESIGNED, never a compression
applied to a photograph afterwards, so a real image keeps arriving as a
pre-rendered `.view` file.

Still under study: the ceiling of what stays writable by hand (a 16x16 mark is
8 rows, the packaged 28x26 one is 13 and already past comfort), and whether
the palette maps to tags only or also admits raw values, for the cases a theme
must not repaint.

## Respect the theme the user chose (under study)

Nearly everything the engine draws already follows it. The palette spends ANSI
slots (the base sixteen, plus `38;5;N` for the outline's grey), and a terminal
maps those through whatever theme is loaded, so a box outline, a status chip and
a tone are already the user's own colours rather than ours.

Exactly two things override that, and both on purpose:

- **The inline-code accent**, the ONE truecolor value in the whole palette.
  `code` is pinned to `rgb(177,185,249)`, Claude Code's own "Claude periwinkle",
  because CC spends no palette slot for a code span: it emits that fixed value.
  Pinning the exact RGB is what makes a code span inside a view match the ones
  CC draws around it, in every terminal. What it costs is stated by what it
  buys: the value tracks CC's DARK theme and answers to no theme of the user's,
  so the day CC moves its accent, or the day a light theme is loaded, the colour
  is wrong and nothing on screen says so.
- **Pre-rendered art**, which cements its palette by construction:
  `views/tayo.view` carries 30 distinct 24-bit values that no theme and no
  `@tone` can repaint. The grid primitive above is the answer to that half, and
  it is already written down as one of its two motives.

So the open question is the first one alone, and it is a real conflict rather
than an oversight: matching Claude Code exactly and obeying the user's theme are
one decision pulling two ways, and the engine has no way to ask which the user
would rather have. A host-supplied override is the cheap shape, since the
palette is a single unexported table with one reader and a seam there costs
little, but a knob invites a view to be desaturated against its own design and
it still does not answer what the DEFAULT should be.

Cheap to leave open, and that is why it is only written down: whichever way it
resolves, today it is one line in `src/style.ts`.

## Per-view opt-out configuration (under study)

Let each level of the stack disable views it does not want, without forking
anything:

- **A plugin embedding cc-views** could disable some of cc-views' own bundled
  views, and ship only the ones it stands behind.
- **A project (the end user)** could disable a specific view coming from a
  plugin: a block they find buggy, or simply do not like. The block would then
  show as the plain data the transcript already holds, exactly like the
  existing fail-open path.

What it builds on: resolution through ordered directories already lets a user
SHADOW any view by naming a file the same. Disabling is the missing sibling of
shadowing: a resolution outcome that says "do not engage" instead of "engage
with my template".

What it would improve in [docs/caveats.md](docs/caveats.md):

- **Code mistaken for a view** (main caveat 2): a per-view kill switch gives
  the reader an immediate workaround while a fix is awaited, instead of living
  with the mis-render.
- **Markdown around a view shows as plain text** (side effect): disabling the
  view means the message no longer engages at all, so Claude Code's native
  markdown pass comes back for the whole message. The user chooses, view by
  view, whether the dressing is worth that trade.

Under study, and the hard question is the boundary of what a USER may disable:
a plugin that relies on cc-views for a load-bearing display (a strict view
reporting its render outcome to a gate, as TAYOMI's own tldr does) would break
if the user could switch that view off. The likely shape is a distinction the
plugin declares: views that are required by its contract vs views that are
cosmetic, with only the latter open to project-level opt-out. To be designed.
