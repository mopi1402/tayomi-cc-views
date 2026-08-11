# Changelog

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
