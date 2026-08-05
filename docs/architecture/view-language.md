# The `.view` language reference

What each form MEANS, and what it does at the EDGE. The grammar itself (every word, what it takes, what closes it, the container it is read in) is generated into `agent/catalogue.json` and printed by `cc-views dict`; why the engine has this shape is [architecture.md](architecture.md). Nothing here is aspirational. Grounded in `template/parse.ts`, `template/directives.ts`, `template/substitute.ts`, `template/load.ts`, `scope.ts`, `style.ts`, `carrier/scan.ts` and `carrier/decorator.ts`.

## Templates and their resolution

A view named `demo` is the file `demo.view`, searched through an ORDERED list of directories (`RenderOptions.viewsPath`), first hit wins.

- TYPED FORMS: `demo.warning.view` beside `demo.view`, selected by the decorator's `type:`. Within ONE directory the typed file beats the default; ACROSS directories, path order outranks specificity. An unknown type lands on the default form, never on an error.
- The LAST directory is read unconditionally rather than existence-checked, so a view found nowhere fails with a real path, which the caller turns into the raw block on screen.
- A typed form is for a different SHAPE. A view that only changes COLOUR under a kind needs no second file: it spends the tone slot.
- A line starting with `#` (leading whitespace allowed) is a comment, dropped at parse time. There is no way to render a literal leading `#`. Every line that is not a directive is body, rendered in order.

## The data a block carries

Flat and line-oriented; values are OPAQUE to end of line, so colons, backticks and brackets inside a value are just text. The parser is TOTAL: it never throws, and an unrecognised line is ignored.

```
key: value        -> scalar field, the rest of the line verbatim
key:              -> opens a list field named key
- item            -> appends an item to the currently open list
```

Keys match `[A-Za-z_][\w-]*`. Under a view's `@fields`, each `- item` splits: every LEADING field takes one whitespace-delimited token, the LAST takes the remaining text verbatim.

When a directive consumes a field:

- A scalar reads as a list of one where a list is expected.
- A whitespace-only field reads as empty, indistinguishable from never written.
- A missing field substitutes as the empty string (or as spaces, inside a padded column), never as an error.

## Directives

### `@each`

Repeats its inner lines once per item. Attribute values are QUOTED, and anything left over on the line after the known attributes makes the whole line TEXT, not a loop.

- `label=`: renders on the FIRST item (via `${#label}`), spaces of the same width on every later one. The label column is as wide as the WIDEST label any `@each` in the template declares.
- `bullet=`: substituted per item (`bullet="R${#} "` numbers rows), exposed as `${#bullet}`, and it carries the hanging-indent boundary so a wrapped item aligns under its own text.
- `cap="1/3"`: clamps every LEADING column of the loop at `floor(width * n / d)`. A value past the cap is cut on an ellipsis; the cut is markup-aware (a `{{tag}}` is never cut open, a code span keeps its backticks) and closes whatever the VALUE left open. Only capped columns truncate: an uncapped one is measured over its values.
- `@head` inside the loop: drawn ONCE above the items from the `head` field, and only when that field holds a row. It spends the loop's own column widths and joins the MEASUREMENT, so a header word longer than every value under it still fits its column. Write it more than once for a header of several lines; a `@rule` among them is honoured, and is the only way to divide a header from the first item, the loop's own `@rule` falling BETWEEN items. A scope with no `head` draws nothing.

Each field of an object list becomes a padded column, except the LAST (the prose tail), emitted verbatim.

### `@map` and `@text`

Two lookup tables, one substitution: both are spent by `${field:name}`, `@map` turning a value into a STYLE (a chip), `@text` into a WORD.

```
@map  states  ok=success  fail=error
@text kinds   warning="⚠ WARNING"  version="◆ VERSION"  *="ⓘ NOTE"
```

- `@map`'s pairs split on whitespace; `@text`'s are QUOTED, and an unquoted pair is simply not one and is skipped.
- A name declared by BOTH directives is a template error, not a merge: the view fails open and the raw block shows.
- Three outcomes serve one slot. A DECLARED entry renders verbatim, the author's glyph and casing byte for byte. A value ABSENT or whitespace-only takes the reserved entry `*`. A value present but OFF the table echoes UPPERCASED, where `@map`'s off-map value stays verbatim.
- Padded to the cell when the substitution sits in a padded column, bare outside one. A band is not a column, so a banner never pads. A text table inside an `@each` is measured on the WORD that comes out, never on the key that chose it.
- `@text` carries the WORD and never a colour: a kind's look comes from the tone slot.

### `@box`

Frames its inner lines: sizes to its CONTENT (a one-line block stays one line wide), wraps long lines at the width ceiling, and collapses blank runs so an unconditional separator only shows between sections that actually rendered. Boxes do not nest.

- `@head`: the title row, first inside the border. Substitutions allowed.
- `@right`: a badge set into the TOP border. Substitutions allowed.
- `@foot`: names a FIELD and carries no text; its items render in a zone under a full-width rule at the bottom, blank items dropped.
- `@frame`: the border's colour follows a field's value. An unlisted value keeps the default grey.
- `@rule`: an inner division drawn to the border, its prefix taking substitutions, surviving only between two lines that actually printed. It is the one directive an `@each` BODY honours, and that survival rule is what drops the one trailing the last item.

### `@box bare`

The same container with no outline. It buys three things a plain body cannot have:

- Lines WRAP, at the full width since there is no border to fit inside, and a fold keeps the hanging boundary a declared `bullet=` sets up (`bullet=""` buys the indent and prints nothing).
- An `@rule` is FILLED, to the width of the widest line it divides.
- Blank runs collapse, which turns a divider drawn under every item into one drawn between them.

Its edges:

- `@head`, `@right`, `@foot` and `@frame` are not its words: with no border to hang on they fall through to the body and print. A token it does not know makes the line ordinary text too, so a typo can never render a frame you did not ask for.
- It sizes to its CONTENT, never to the terminal, so a rule divides the body it sits in rather than running out to a margin nothing else reaches. `views/lines.view` is written on it.
- One case reads the terminal instead: a bare container holding NOTHING BUT a rule has no body to measure it against, so the rule fills the width it was handed, and the collapsing does not drop it for want of neighbours. `views/hr.view` is exactly that.

### `@aside`

Lays a SECOND column to the LEFT of every line up to `@endaside`. The column's content is the named view, resolved through the same ordered search path (shadowing included), and nothing else: a region NAMES its content and cannot carry it inline.

```
@box
The health check, at the full content width.
@rule
@aside tayo
 {{cyan}}LEARN  {{/}}  {{cyan}}▎{{/}} the first section, beside the picture
@endaside
@endbox
```

- The named view is read as PLAIN ROWS: no directive in it is honoured and no substitution runs over it, so a file carrying `@box`, `@each`, `@map` or `@foot` shows those lines as text. Art meant for a region ships frameless.
- The region spends the aside's own printed width plus FIVE columns before the main flow: two spaces, the separator, two spaces.
- Below **40 printed columns of box content** for the main flow (the box's width ceiling less its 4 columns of border, not the terminal's width), the aside and its separator are DROPPED whole and the flow takes the full width.
- The two columns CENTRE against each other, an odd padding row going below. `@aside <view> top` and `@aside <view> bottom` pin the shorter column to that edge instead. Anything else after the name makes the line plain text.
- A view that resolves NOWHERE degrades to the full-width main flow: a decoration never takes its box down.
- An aside row is emitted verbatim, never wrapped, split or restyled.
- A BLANK main-flow line survives inside a region. Outside one, blank collapsing is unchanged.
- Regions do not nest, they carry no `@rule`, and the column is always on the left.

## Substitutions

`${...}` resolves against the block's fields, plus the loop's bookkeeping.

- `${field}`: the value. Dotted paths (`${a.b}`) resolve into nested data.
- `${field:tablename}`: through an `@map`, ON the map, it renders as a chip (the value UPPERCASED inside the mapped tag's colours, padded so chips align down the column); OFF the map, plain text padded to the same cell. Through an `@text`, the declared word verbatim, the reserved `*` when nothing arrived, the token uppercased when the table does not hold it.
- `${.}`: the current item of the enclosing `@each` (an object item re-serialises as `key: value, ...` prose).
- `${#}`: that item's 1-based index.
- `${#label}`: the loop's label column. Outside a labelled loop it is spaces of that column's width, so a non-list line can align with one.
- `${#bullet}`: the loop's item marker. Empty outside one.
- `${#hang}`: the hanging-indent boundary, written, for the line with no `@each` to declare one on. Everything left of it is a prefix the wrapped rows redraw with its visible characters blanked, tags and section bars KEPT. It prints nothing and only bites inside a container.
- `${#fold}`: where the fold starts PAINTING. Left of it the prefix is VOIDED rather than blanked: bare columns, opened on a reset, with the style that drew them dropped. Blanking keeps every tag, which is right for a gutter bar and wrong for a fill opened before a label, since the kept tag repaints the hole.
- `${#tail}`: the line's closing furniture. Drawn whole while the line FITS; the moment it folds the tail is dropped and every row is padded to the width and closed instead, which is what turns a wrapped block from a staircase into a rectangle.

## Inline styling

`{{tag}}` opens a style, `{{/}}` resets. An UNKNOWN tag name stays on screen verbatim (it is text, not markup), and every width measurement agrees with that. The names this install answers to are in `cc-views dict` and in `agent/catalogue.json`.

A span the ENGINE inserts inside your line (an inline code span, a `@map` chip, the bold a decorated cell derives from the message's `**`) RESUMES the style it interrupted instead of clearing it, so `{{dim}}- Read ${trace}{{/}}` stays dim on both sides of a backtick. Your own `{{/}}` still means reset, and it still closes everything.

What resumes is the style that stood OUTSIDE the span, whatever the span's own text did in between. A tag written between backticks paints the rest of that span and stops there, and spans nest: a chip whose label carries a code span hands the chip back at the tick, and the line back at the chip's edge.

A tag written in a MESSAGE is inert, in its prose and inside a block's data alike: `{{warn}}` typed by the model prints as those eight characters, and is measured as eight columns. Only the template you wrote opens a style. The one thing a message still influences is the tone SLOT, which names a class the template chose to spend; it cannot invent a style the template did not ask for.

Every colour carries a `<name>_bg` chip and a `<name>_cap`, the foreground painting that fill, for a glyph drawn AGAINST the chip. What has no chip is what names no PIXELS to measure an ink against: `b` and `box_title`, which carry a weight or a slot rather than a colour, and `code` in the two `ansi` themes. A host registers names of its own with `extendTags`, and a registration SHADOWS a built-in one: see the [integration reference](display-host.md).

Inline backtick code spans (`` `like this` ``) render on every view in Claude Code's native inline-code colour; the backticks cost no width.

### The tone slot

`{{tone}}`, `{{tone_bg}}` and `{{tone_cap}}` are the tags whose colour the RENDER decides instead of the template. A view writes them where its accent goes; a carrier names the class that fills them. Same template, any colour, no second file:

```
@tone key
@each rows
{{tone}}${label}{{/}}  ${content}
@end
```

The class is a palette tag NAME. Resolution, most explicit first:

1. `tone:` on the decorator line;
2. the block's own `tone` field (the fenced block's way in: it carries no attributes);
3. the kind, from `type:` on the decorator or a `type` field;
4. the template's `@tone`;
5. otherwise the neutral (`key`).

Every candidate is checked against the palette and an unknown name falls THROUGH to the next one, so a typo costs a colour, never the render. `{{tone_bg}}` spends the class's `_bg` chip, or its foreground when the palette has no chip for it.

`{{tone_cap}}` is for the characters a template draws AGAINST the chip rather than inside it: the rounded caps that turn a band into a pill, an arrow between two zones. Spending `{{tone}}` there is the trap, because a foreground carries bold and a terminal promotes a bold base-sixteen foreground to the BRIGHT slot while nothing promotes a background, so `cyan` against an `info_bg` fill is one shade off. A class with no chip has no cap either and falls back to that class's foreground, so caps and text still land on one colour: what reaches that path is `tone:b`, `tone:box_title`, and `tone:code` under `ansi`.

## The carriers

Neither carrier looks inside a FENCED CODE BLOCK. The fences of a text are read before anything else and the outermost one decides: if its info string opens `view:` it is the block carrier's own and renders, and every other fence is a shield whose contents are text, a nested `view:` block and a decorator line included. A fence closes on a run at least as long as its opening carrying no info string, and an unclosed fence shields to the end of the message. An indented four-space code block does not shield.

### The fenced block

````
```view:demo
key: value
```
````

The engine replaces the whole block with the named view's render. While the block is still STREAMING (opening fence seen, closing fence not yet) it is withheld from the screen and revealed rendered when it closes. On any failure (unknown view, zero fields parsed from a non-empty body, render error) the raw block shows, fences included.

The block carries no attributes, so a `tone` or `type` FIELD is how it names the class filling the tone slot. They stay ordinary fields: a template that never spends the slot and never prints them renders exactly as it did without them.

### The decorator line

```
@{view:<name>}
@{view:<name>, type:<kind>}
@{view:<name>, tone:<tag>}
@{view:<name> type:<kind> tone:<tag>}
```

Alone on its line (surrounding whitespace allowed), directly above its payload. TWO payload shapes, and the FIRST line of the zone decides which, nowhere else: a leading pipe is a table, a leading `>` is a blockquote.

**A table**: header row MANDATORY (its cells may be empty, `| | |`), then the delimiter row, then at least one data row. The zone ends at the first line that no longer starts with a pipe.

**A blockquote**, which is what a one-line band is written as:

```
@{view:banner}
> [!WARNING]
> two flaky suites, publication is blocked
```

- The body reaches the template as `content`: the `>` prefixes come off and the lines join with ONE space, which is markdown's own soft-wrap, so the render and the hookless fallback read the same sentence.
- The first body line may be a KIND MARKER, `[!TOKEN]` alone on the line, matching one uppercase run (`[A-Z][A-Z0-9_-]*`). It reaches the template LOWERCASED in the `type` field, and the uppercase comes back at the other end from the template's `@text` table.
- No space, no glyph, no lowercase, no second word. `[!📦 VERSION]`, `[! WARNING]`, `[!warning]` and `[!TWO WORDS]` are NOT markers: each stays the first line of the content and prints inside the band, where the author sees it.
- The marker BEATS a `type:` attribute, and never selects a typed FILE. With no marker, `type:` behaves exactly as it does over a table.
- The quote must be followed by a BLANK LINE or end the message. Its zone is the run of contiguous non-blank lines, so prose written on the very next line JOINS the zone, no parser claims the mixture, and the whole thing fails open with every line intact.
- A band wider than the width WRAPS, which the template buys with a bare container and the three fold marks above: `${#hang}` says where the text starts, `${#fold}` voids the word's columns on every continuation, `${#tail}` drops the closing arc and squares every row. A band that fits keeps both arcs. A bare line outside a container is still the terminal's to break: see [caveats](../caveats.md).

**The fallback gradient.** Re-rendered as plain markdown, exactly five tokens become native alert boxes: `NOTE`, `TIP`, `IMPORTANT`, `WARNING` and `CAUTION` (verified against GitHub's writing-and-formatting docs, 2026-08-02). Any other token falls back to an ordinary quote whose first line reads `[!VERSION]` literally, which is still visible and still self-describing. Read raw in a transcript, it is still a quote. An alert cannot be NESTED, so a banner written inside a list item or another quote keeps rendering here and loses its native fallback there.

### What reaches the template, and what fails open

A decorator has NO payload when the line under it is blank or absent, and only then: `@{view:welcome}` alone, ending the message or with a blank line under it, is the whole health check. Prose on the very next line IS a payload, no parser claims it, and the zone fails open.

Existence and extent are two questions, deliberately kept apart. Existence is decided by that blank line, the one boundary every markdown block agrees on. Extent belongs to the payload's own SHAPE: a table ends at the first line that no longer starts with a pipe, so a table followed straight by prose is still a table; a quote ends at the first blank line, so a quote followed straight by prose is neither, and fails open.

A payload that exists but is not a shape a parser here claims fails open, and so does a HOLLOW render, under any of three readings: no data reached a template that spends a substitution; data reached one that read none of the fields it got; or every field it did read arrived blank. The middle one is decided on the fields the render ACTUALLY resolved, never on what it printed. "Actually resolved" is meant literally: a `${field}` inside a loop over an absent list is not read, and neither is the tag an `@tone` names or the view an `@aside` names.

- The table's HEADER row reaches the template as `head`, a row carrying the same field names as any other, drawn by `@head` inside the loop. It is present the moment ONE of its cells holds a word, and absent when they are all blank, which is the empty header (`| | |`) markdown forces on a table that wants none.
- A table of TWO TO FOUR columns reaches the template as `rows`. The two ENDS are anchored, first cell to `label` and last to `content` whatever the width, and whatever sits between them takes the numbered middle names `mid1` then `mid2`. The header row fixes the width and every row below must hold it; a ragged table, or one column past four, fails open as the markdown it already is. An empty label cell continues the label above. A quote reaches the template as `content`, plus the `type` field its marker named.
- A column NO row carries is dropped from the loop line together with the text leading up to it, which is where a template writes its separator. That is what lets ONE file draw two, three or four columns with no conditional in the language. The rule is measured over the WHOLE list, never per item, so a field one row happens to omit still holds its cell on every row. A separator must therefore be written as a CLOSED span (`{{dim}}  │  {{/}}`): a closer standing at the head of the dropped run is kept, since it belongs to the column before it, but an opener left hanging inside the run goes down with it.
- Message text becomes a scope value under ONE treatment, whichever shape carried it: neutralised first (a `{{tag}}` the model wrote prints as those characters and opens no colour), then authored `**bold**` spans rendered per span. A table cell may additionally carry an escaped pipe (`\|`), the one escape a cell needs and a quote does not.
- `type:` names the KIND of content (`warning`, `error`, `success`; think markdown admonitions). It selects a typed form when one exists, reaches the template as the `type` field, and fills the tone slot when the palette knows the name.
- `tone:` names the LOOK: a palette tag stuck on this render, no file, no semantics, and it outranks the kind.
- Both attributes are OPTIONAL, come in any order, and are separated by a comma, whitespace, or both. Any OTHER attribute makes the line prose. The token must begin `@{view:` exactly.
- Streaming is withheld from the decorator line, anchored, and revealed when the zone's end is known. Fail-open on every path: the raw markdown shows, decorator line included.
