# Changelog

## Unreleased

- The README no longer asks a plugin to sign its engine on at `SessionStart`: nothing needs it

## 2.8.3

- The first message of a session is drawn again when two engines share it, instead of printing raw
- The README shows a plugin how to sign its engine on at `SessionStart`
- A drawn line opening like `1. ` or `- ` keeps its columns instead of being sheared by Claude Code's list layout

## 2.8.2

- A code span holding a version, like `@2.8.1`, keeps its colour instead of printing `[38;2;…m` and pushing the frame out

## 2.8.1

- An engine running in another Claude Code session no longer wins this session's election, which left every block raw
- The project's own `views/` is found from `CLAUDE_PROJECT_DIR`, so a session that changed directory keeps its views

## 2.8.0

- Diagrams are drawn by `@tayomi/mermaid2term`, which replaces `@tayomi/termaid-ts`
- An unasked diagram draws in mermaid's `default` theme with `padless` frames, instead of shades only
- A drawing whose first row opens on blanks keeps its indent, below prose as at the head of a message
- `CC_VIEWS_MERMAID_BORDERS` picks the frame: `default`, `padless` or `borderless`
- A `<br>` in a diagram label draws a two-line label, and a frontmatter `title` is drawn
- The briefing no longer tells a model to keep diagram labels on one line
- `NOTE`, `TIP`, `IMPORTANT` and `CAUTION` bands take the hue markdown draws them in, instead of the neutral fill
- `columns` and `lines` draw up to eight columns side by side, instead of showing a table past four raw
- A table past four columns that does not fit draws each row as an entry, one `Header: value` line per cell
- `columns` and `lines` take a markdown table only: a fenced `rows:` block under them now draws empty columns
- A capped column takes back the room the rest of its row leaves free, instead of folding in a table half as wide as the terminal
- An indented line in a fenced block continues the value or the item above it, instead of vanishing
- A fenced block holding a line no field claims now shows raw, where it used to render without that line
- `@{view:split}` lays the two zones written under it side by side, a diagram beside its text or two diagrams
- A bare mermaid fence or quote under a split takes the `mermaid` or `quote` view
- A bare ```markdown fence under a split is drawn as markdown: headings, lists, quotes, rules, code and bold
- `@{view:markdown}` draws a ```markdown fence alone, at the terminal's width
- A split side wanting less than half the width hands the rest to the other, and the sides stack when too narrow
- A diagram in a split column may turn its declared direction to match the other side's height
- `@{view:aside}` sets one zone aside, and the paragraphs after it flow in the column at its right
- An aside appears whole once its column is filled, instead of its text jumping into the column
- Under Claude Desktop the hook draws nothing, and Desktop shows the message as the model wrote it

## 2.7.0

- The payload a view takes is scored on the names the BLOCK carries, never on the fields a list splits into
- A view whose loop named `type`, a word of the quote, takes its table again instead of falling open to raw markdown
- `cc-views check` reads a sample written as a DECORATED block, which is the only form naming a payload shape
- It prints the shape the view resolved to before any verdict, an answer no author could read anywhere
- `cc-views check --all <dir>` sweeps a whole set of views, one `<view>.md` sample per view
- `check`, `checkAll` and `takes` are exported, for a host gating its own views in its own suite
- A sample that only ever fell open now FAILS a check that used to pass it
- A field the block carried and the view draws nowhere is reported on a decorated sample too, the form the skill asks for
- A view spending `flow` is no longer accused of dropping the `content` it drew, the two being one body under two names

## 2.6.0

- A diagram asked for no theme now draws in SHADES rather than flat, so a `classDef` or a `style` the source declares reaches the screen
- The env var still chooses OUR palette; its absence no longer means "no colour", it means "no palette of ours"
- A theme name the renderer does not hold falls to those same shades, so a typo still shows as the one drawing with no colour of ours in it
- A bare `>` inside a quote is a paragraph break the author wrote, and it reaches the screen as one
- A band still draws as one paragraph, that break spent as a single space
- Several lines under one label in a `box` read as one section, no blank line parting them

## 2.5.0

- A quote keeps the lines its author wrote: two `>` lines draw as two lines, each under its own bar
- `content` yields those lines to any template, the fold honouring a break as it honours a full column
- A view drawing ONE band spends the new `flow` field instead, the same body with its breaks as spaces

## 2.4.1

- The README shows what every view draws, each picture the engine's own render and never a screenshot
- The npm page carries keywords, a homepage and a bugs URL

## 2.4.0

- A themed diagram is painted for the SIDE the host's theme names: on a light terminal the palette is mirrored, never fog on white
- The side joins the drawing's cache key, so one terminal is never served the other's colours

## 2.3.4

- Under `CC_VIEWS_DEBUG`, the engine journals every flush under the register: a display gone wrong is read, not guessed at
- An engine wired twice draws ONCE and the same: a final flush no longer drops the store its own duplicate still reads

## 2.3.3

- Engines COMPOSE one answer per flush: claims speak a protocol, all-or-nothing per fleet
- The election casts one ASSEMBLER; every other engine answers nothing at all
- A speaker's render travels as a write-once piece, named by message, carrier, view and ordinal
- The assembler splices the winners' pieces into its own render, their colours intact
- A peer's zone still streaming is withheld like the engine's own: the flush-boundary leak dies
- An expired piece wait is recorded and irrevocable: a late piece never repaints a raw zone
- One mute claim on the register sends the whole fleet back to answering alone
- A mixed fleet is named to the operator, culprits pointed by version and by the project to update, once per session
- A claim outrun by a newer engine at its own location dies at once: an update never leaves a ghost accusing the project it fixed
- The warning is a styled NOTICE: accent header, boxed culprits, and the update call under the rule
- `notice` and `middleEllipsis` join the public API: the systemMessage dress, for any host with something to say
- The warning lands mid-session too, relayed by the model from the first prompt after the fleet mixed: `cc-views-session prompt`, a new optional hook
- One engine WINS each view: an election every engine computes alike replaces the stand-aside
- A view another engine declares and this one cannot resolve is left to its winner, never echoed as prose
- The election tie-breaks by version, then proximity to the project, then a fixed path order: one winner, always
- Engines sign a per-session roster at SessionStart; SessionEnd tears it down; a first flush recreates it
- A view born mid-session enters the election at the next message: the roster re-signs itself, no restart
- `cc-views-session` wires the two bookends (`start`, `end`), optional on any host
- `CC_VIEWS_ENGINES_DIR` redirects the register: a test harness never writes where real engines elect

## 2.3.1

- New `mermaid` view: a mermaid fence under its decorator is drawn in the terminal
- Diagrams are drawn IN PROCESS by `@tayomi/termaid-ts`: nothing spawns, no Python, no binary to install
- A diagram is drawn unpainted, in the terminal's own foreground, readable on light and dark alike
- A source of no known diagram type shows its fence instead of boxes of its own syntax
- `CC_VIEWS_MERMAID_THEME` paints the diagram with a named renderer theme, unpainted staying the default
- A diagram fills the box it was drawn for, folded at that width and no other
- A drawing is cached under the engine's version, so an upgrade never serves the previous engine's render
- A flowchart's direction can be forced to `TD` or `LR` at render
- Both footprints of a flowchart are measurable before choosing a direction
- `CC_VIEWS_NO_MERMAID` keeps the diagram half out of the briefing
- Node 22.12 is the floor, the version that requires an ES module from synchronous code
- A flush whose predecessor never lands renders its delta alone, open zones withheld
- The wait for a predecessor delta grows to a full second
- A view the search path cannot resolve never opens a zone: prose streams as prose
- An answer identical to the delta is withheld, so an echo never overwrites a peer's render
- The briefing no longer claims a closed list of view names, which an install adding its own made false

## 2.1.3

- A fold cutting a code span seals and reopens one space off the text
- A backtick surviving resolution as text is drawn as the lookalike U+02CB
- A star the bold pass did not spend is drawn as the lookalike U+2217

## 2.1.1

- A code span closes on the run it opened on, and never past its own cell

## 2.1.0

- Two engines on one machine no longer race: the newest one HOLDING a view draws it
- Each engine announces its path, its version and the view names it resolves
- Per ZONE: a view only one engine has is always drawn by that engine
- `CC_VIEWS_NO_YIELD` turns it off, and every failure to read the register means draw

## 2.0.0

- BREAKING: `DisplayHost.inject` receives parsed data instead of the block's raw text
- A two-column decorated table carries named fields: a sectioned view can be driven from either carrier
- Added `viewZones()`: every view zone a message carries, without rendering
- A table row a cell too long rejoins its last column instead of printing the block raw
