# Changelog

## Unreleased

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
