# The `.view` language reference

A view is a template file that dresses a data block on screen. This document is the language's boundary: every form the engine accepts is here, and nothing here is aspirational. Grounded in `template/parse.ts`, `template/directives.ts`, `template/substitute.ts`, `template/load.ts`, `scope.ts`, `style.ts`, `carrier/scan.ts` and `carrier/decorator.ts`.

## Templates and their resolution

A view named `demo` is the file `demo.view`, searched through an ORDERED list of directories (`RenderOptions.viewsPath`): the walk goes dir by dir and the first hit wins, so a consumer that lists its own directory before another one shadows a view by simply naming a file the same.

A view may carry TYPED FORMS: `demo.warning.view` beside `demo.view`. The decorator carrier (below) selects one with `type:`. Within ONE directory the typed file beats the default; ACROSS directories, path order outranks specificity (an earlier dir's `demo.view` beats a later dir's `demo.warning.view`). An unknown type lands on the default form, never on an error. One asymmetry to know: the LAST directory is read unconditionally rather than existence-checked, so a view found nowhere fails with a real path (which the caller turns into the raw block on screen).

A typed form is for a different SHAPE, and for nothing else. A view that only changes COLOUR under a kind needs no second file: it spends the tone slot (below), which is what keeps a near-copy of a template from existing per colour.

## Template anatomy

- A line starting with `#` (leading whitespace allowed) is a template comment, dropped at parse time. There is no way to render a literal leading `#`.
- `@map <name> <value>=<tag> ...` declares an enum-to-style table, e.g. `@map verdicts ok=pass fail=fail`. Pairs missing either side are skipped.
- `@fields <list> <field> <field> ...` declares that items of `<list>` split into named fields (see the data format below).
- `@tone <tag>` declares the class this template's tone slot holds by DEFAULT, e.g. `@tone key`. One tag name and nothing else on the line. A carrier that names a class outranks it (see the tone slot below).
- Every other line is body, rendered in order.

## The data a block carries

The block format is flat and line-oriented; values are OPAQUE to end of line, so colons, backticks and brackets inside a value are just text. The parser is TOTAL: it never throws, and an unrecognised line is ignored.

```
key: value        -> scalar field, the rest of the line verbatim
key:              -> opens a list field named key
- item            -> appends an item to the currently open list
```

Keys match `[A-Za-z_][\w-]*`. For a list declared as an object list (the view's `@fields`), each `- item` splits into the declared fields: every LEADING field takes one whitespace-delimited token, the LAST field takes the remaining text verbatim. Leading fields are ids and enums; the last field is the prose.

Reading rules the engine applies when a directive consumes a field:

- A scalar field reads as a list of one where a list is expected.
- A whitespace-only field reads as empty, indistinguishable from never written.
- A missing field substitutes as the empty string (or as spaces, inside a padded column), never as an error.

## Directives

### `@each <field> [label="..."] [bullet="..."] [cap="n/d"] ... @end`

Repeats its inner lines once per item of `<field>`. Attribute values are QUOTED, and the strictness is deliberate: anything left over on the line after the known attributes makes the whole line TEXT, not a loop.

- `label="CHECKS"`: the label renders on the FIRST item (via `${#label}`), spaces of the same width on every later one, so a section names itself once. The label column is as wide as the WIDEST label any `@each` in the template declares.
- `bullet="- "`: an item marker, substituted per item (so `bullet="R${#} "` numbers rows), exposed as `${#bullet}`, and carrying the hanging-indent boundary so a wrapped item aligns under its own text instead of under its bullet.
- `cap="1/3"`: clamps the measured width of every LEADING column of the loop at `floor(width * n / d)`. A value past the cap is cut on an ellipsis; the cut is markup-aware (a `{{tag}}` is never cut open, a code span keeps its backticks) and closes whatever the VALUE left open, handing the line back the style the template had around the cell. Only capped columns ever truncate: an uncapped column is measured over its values, so nothing exceeds it.

Column alignment inside a loop is automatic: each field of an object list becomes a padded column, except the LAST field (the prose tail), emitted verbatim.

### `@map <name> <value>=<tag> ...` and `@text <name> <value>="..." ...`

Two lookup tables, one substitution. Both declare an enum, both are spent by `${field:name}`, and which answer comes out is the TABLE's business rather than the caller's: `@map` turns a value into a STYLE (a chip), `@text` turns it into a WORD.

```
@map  states  ok=success  fail=error
@text kinds   warning="⚠ WARNING"  version="◆ VERSION"  *="ⓘ NOTE"
```

- `@map`'s pairs split on whitespace, because a tag name has none. `@text`'s pairs are QUOTED, because a text value has spaces by definition; an unquoted pair is simply not one and is skipped.
- A name declared by BOTH directives is a template error, not a merge: one `${field:name}` asks them both, and a merge would leave the winner to the order the lines happen to sit in. The view fails open, and the raw block shows.
- Three outcomes serve one slot, and they have to be three. An entry the table DECLARES renders verbatim, the author's glyph and casing byte for byte. A value ABSENT or whitespace-only takes the reserved entry `*`. A value present but OFF the table echoes UPPERCASED, which shows the unknown word rather than swallowing it.
- The echo is uppercase where `@map`'s off-map value is verbatim, and the asymmetry is narrow and deliberate: on the marker path (below) the shape forced uppercase and the carrier lowercased it, so the echo is a restoration. Everywhere else, a mapped slot showing an uppercase word is the same rule `@map` already follows when it uppercases a chip's label.
- Padding is `@map`'s existing rule and is not re-decided: padded to the cell when the substitution sits in a padded column, bare outside one. A band is not a column, so a banner never pads; a text table spent inside an `@each` still aligns, and it is measured on the WORD that comes out, never on the key that chose it.
- `@text` carries the WORD and never a colour. A kind's look comes from the tone slot, so it has one place to be declared, not two that can contradict each other.

### `@box ... @endbox`, with `@head`, `@right`, `@foot`, `@frame`, `@rule`

`@box` frames its inner lines: the box sizes to its CONTENT (a one-line block stays one line wide), wraps long lines at the width ceiling, and collapses blank runs so an unconditional separator in the template only shows between sections that actually rendered. Boxes do not nest.

- `@head <text>`: the title row, first inside the border (substitutions allowed).
- `@right <text>`: a badge set into the TOP border (substitutions allowed).
- `@foot <field>`: names a FIELD (it does not carry text); its items render in a zone under a full-width rule at the bottom, blank items dropped.
- `@frame <field> <key>=<tone> ...`: the border's colour follows a field's value, so the state that picks a badge picks the border too. An unlisted value keeps the default grey.
- `@rule [prefix]`: an inner division, drawn to the border; the prefix takes substitutions, and the rule survives only between two lines that actually printed.

### `@aside <view> [top|bottom] ... @endaside`

Lays a SECOND column to the LEFT of every line up to `@endaside`. The column's content is the named view, resolved through the same ordered search path as any other view (shadowing included), and nothing else: a region NAMES its content and cannot carry it inline, which is the whole point of the primitive (raw art stays out of a readable template).

```
@box
The health check, at the full content width.
@rule
@aside tayo
 {{cyan}}LEARN  {{/}}  {{cyan}}▎{{/}} the first section, beside the picture
@endaside
@endbox
```

- The named view is read as PLAIN ROWS: no directive in it is honoured and no substitution runs over it, so a file carrying `@box`, `@each`, `@map` or `@foot` shows those lines as text. Art meant for a region therefore ships frameless.
- The region spends the aside's own printed width plus FIVE columns before the main flow: two spaces, the separator, two spaces. With a 28-cell picture that is 33 columns, and the main flow gets whatever is left of the box's content width.
- Below **40 printed columns of box content** for the main flow (the box's width ceiling less its 4 columns of border, not the terminal's width), the aside and its separator are DROPPED whole and the flow takes the full width. A picture is decoration; prose squeezed beside one is not readable.
- The two columns CENTRE against each other, and an odd padding row goes below. `@aside <view> top` and `@aside <view> bottom` pin the shorter column to that edge instead. Anything else after the name makes the line plain text.
- A view that resolves NOWHERE degrades to the full-width main flow: a decoration never takes its box down.
- An aside row is emitted verbatim, never wrapped, split or restyled: every composed line is built to fit the box already, which is what keeps the wrapper from breaking a picture on the spaces its transparent pixels are made of.
- A BLANK main-flow line survives inside a region (the composed line still carries the separator, so the box has no blank run to collapse). Outside a region, blank collapsing is unchanged.
- Regions do not nest, they carry no `@rule` (an inner rule is filled to the border, which means nothing across two columns), and the column is always on the left.

## Substitutions

`${...}` resolves against the block's fields (plus the loop's bookkeeping):

- `${field}`: the value. Dotted paths (`${a.b}`) resolve into nested data.
- `${field:tablename}`: the value looked up in the table of that name, `@map` or `@text` (see the directives above). Through an `@map`, on the map, it renders as a chip: the value UPPERCASED inside the mapped tag's colours, padded so chips align down the column; off the map, plain text, padded to the same cell. Through an `@text`, it renders the declared word verbatim, the reserved `*` entry when nothing arrived, and the token uppercased when the table does not hold it.
- `${.}`: the current item of the enclosing `@each` (an object item re-serialises as `key: value, ...` prose).
- `${#}`: the current item's 1-based index.
- `${#label}`: the loop's label column (see `label=`). Outside a labelled loop it is spaces of the label column's width, so a non-list line can align with one.
- `${#bullet}`: the loop's item marker (see `bullet=`). Empty outside one.

## Inline styling

`{{tag}}` opens a style, `{{/}}` resets. An UNKNOWN tag name stays on screen verbatim (it is text, not markup), and every width measurement agrees with that.

A span the ENGINE inserts inside your line (an inline code span, a `@map` chip, the bold a decorated cell derives from the message's `**`) RESUMES the style it interrupted instead of clearing it, so `{{dim}}- Read ${trace}{{/}}` stays dim on both sides of a backtick. Your own `{{/}}` still means reset, and it still closes everything: the resume exists precisely for the terminators you cannot see coming, since the line has no way to know where the model will put a backtick.

What resumes is the style that stood OUTSIDE the span, whatever the span's own text did in between. A tag you write between backticks paints the rest of that span and stops there, and spans nest: a chip whose label carries a code span hands the chip back at the tick, and the line back at the chip's edge.

This is the VIEW language, and it is spoken in a `.view` file only. A tag written in a MESSAGE is inert, in its prose and inside a block's data alike: `{{warn}}` typed by the model prints as those eight characters, and it is measured as eight columns because that is what it costs. Only the template you wrote opens a style. That is what keeps presentation on disk, where you can read it and change it, instead of in whatever a model happened to emit.

The one thing a message still influences is the tone SLOT (below), which names a class the template chose to spend. It cannot invent a style the template did not ask for.

The built-in vocabulary (`style.ts`):

- Weight: `b`, `dim`.
- Colours, base range (follows the user's theme): `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`.
- Colours, named indices (the same pixels under every theme): `orange`, `gold`, `purple`, `violet`, `pink`, `teal`, `aqua`, `lime`, `brown`, `navy`, `salmon`, `mint`.
- Semantic foreground: `pass`, `warn`, `fail`, `high`, `med`, `low`, `key`.
- Carrier names, aliases of the above: `warning` (= `warn`), `error` (= `fail`), `success` (= `pass`), `info` (= `key`). They exist so a kind a carrier names dresses a view with no template of its own.
- Filled chips: `chip`, `title`, and a `<name>_bg` for EVERY colour, derived from the colour itself where its pixels are known and declared by hand for the base range. A colour always fills, because a template may spend a chip as a surface and draw against it. What has no chip is what names no colour to fill with: `b`, and `box_title`, whose bold white is an attribute rather than a pixel. `dim` would fall there too and is given the low chip by hand.
- Caps: any `<name>_cap`, the foreground painting the fill of the `<name>_bg` beside it, for drawing a shape AGAINST a chip (see below). Derived, never declared, so it exists for a host's own chip too.
- Furniture: `box_rule`, `box_title`; `code` is the inline-code colour.
- The tone slot: `tone`, `tone_bg`, `tone_cap` (below).

A host adds its own tags process-wide with `extendTags` (see the integration reference); a host's registration SHADOWS a built-in name, the last word going to the screen's owner, under the same law that lets a views dir shadow a bundled view. **Register the colour alone** and its chip and its cap both follow:

```ts
extendTags({ brand: "\x1b[38;5;75m" });
// {{brand}}      the foreground, as declared
// {{brand_bg}}   a chip filling with that blue, inked black because it is light
// {{brand_cap}}  the blue again, for a glyph drawn against the chip
```

One value in, three names out, none able to drift, and `tone:brand` dresses any view that spends the slot. Shadowing a built-in colour carries its chip along: register your own `info` and a band under `tone:info` fills with YOUR blue, not the engine's cyan.

The ink is measured, not guessed (WCAG relative luminance, black or white, whichever contrasts more), which is possible only for a colour naming its PIXELS: a 256 index or truecolor. A base-sixteen slot names a slot, and what a terminal paints there comes from the user's theme, so its chip is declared by hand instead. Declare a `_bg` of your own whenever you want a specific ink, or a fill that is not the colour itself; an explicit registration always wins over the derivation. Inline backtick code spans (`` `like this` ``) render on every view in Claude Code's native inline-code colour; the backticks cost no width.

### The tone slot

`{{tone}}`, `{{tone_bg}}` and `{{tone_cap}}` are the tags whose colour the RENDER decides instead of the template. A view writes them where its accent goes; a carrier names the class that fills them, like sticking a class on it. Same template, any colour, no second file:

```
@tone key
@each rows
{{tone}}${label}{{/}}  ${content}
@end
```

The class is a palette tag NAME (`warn`, `dim`, `gold`, a host's own tag, or a carrier name above). Resolution, most explicit first:

1. `tone:` on the decorator line;
2. the block's own `tone` field (the fenced block's way in: it carries no attributes);
3. the kind, from `type:` on the decorator or a `type` field;
4. the template's `@tone`;
5. otherwise the neutral (`key`).

Every candidate is checked against the palette and an unknown name falls THROUGH to the next one, so a typo costs a colour, never the render. `{{tone_bg}}` spends the class's `_bg` chip, or its foreground when the palette has no chip for it.

#### Drawing against a chip: `{{tone_cap}}`

`{{tone_cap}}` is the foreground painting the fill of `{{tone_bg}}`, for the characters a template draws AGAINST the chip rather than inside it: the rounded caps that turn a band into a pill, an arrow between two zones, any glyph that must read as an extension of the coloured surface next to it.

Spending `{{tone}}` there is the trap, and it looks right until it does not. A class's foreground and its chip name the same palette entry, but the foreground carries bold, and a terminal promotes a bold base-sixteen foreground to the BRIGHT slot while nothing promotes a background. `cyan` (`1;36`) against an `info_bg` fill (`46`) is one shade off, in every theme that separates the two. `{{tone_cap}}` is derived from the chip itself, so the two cannot drift and a theme cannot separate them.

A class with no chip has no cap either, and the slot falls back to that class's foreground, so caps and text still land on one colour. Every COLOUR carries a chip precisely so a band never reaches that path: a cap is half a pill, and with no fill to extend it, two solid glyphs sit around bare text and read as broken. Furniture naming its pixels fills like any other colour, `tone:code` and `tone:box_rule` both included; the two names that land there are the ones carrying no colour at all, `tone:b` and `tone:box_title`. The same rule holds outside the slot: any `<name>_cap` resolves as long as `<name>_bg` does, a host's own registered chip included.

## The carriers

Neither carrier looks inside a FENCED CODE BLOCK. The fences of a text are read before anything else, and the outermost one decides: if its info string opens `view:` it is the block carrier's own and renders, and every other fence is a shield whose contents are text, a nested `view:` block and a decorator line included. A fence closes on a run at least as long as its opening carrying no info string, which is what lets a longer fence quote a shorter one, and an unclosed fence shields to the end of the message. This is what makes it possible to SHOW the syntax: a page of examples is a page, not a render of itself. An indented four-space code block does not shield.

### The fenced block

````
```view:demo
key: value
```
````

The engine replaces the whole block with the named view's render. While the block is still STREAMING (opening fence seen, closing fence not yet), it is withheld from the screen and revealed rendered when it closes. On any failure (unknown view, zero fields parsed from a non-empty body, render error) the raw block shows, fences included: fail-open, never a blank.

The block carries no attributes, so a `tone` or `type` FIELD is how it names the class filling the tone slot. They stay ordinary fields: a template that never spends the slot and never prints them renders exactly as it did without them.

### The decorator line

```
@{view:<name>}
@{view:<name>, type:<kind>}
@{view:<name>, tone:<tag>}
@{view:<name> type:<kind> tone:<tag>}
```

Alone on its line (surrounding whitespace allowed), directly above its payload. TWO payload shapes, and the FIRST line of the zone decides which, nowhere else: a leading pipe is a table, a leading `>` is a blockquote.

**A table**: header row MANDATORY (its cells may be empty, `| | |`), then the delimiter row, then at least one data row. The zone ends by markdown's own block rule, at the first line that no longer starts with a pipe.

**A blockquote**, which is what a one-line band is written as:

```
@{view:banner}
> [!WARNING]
> two flaky suites, publication is blocked
```

- The body reaches the template as `content`: the `>` prefixes come off and the lines join with ONE space, which is markdown's own soft-wrap, so the render and the hookless fallback read the same sentence.
- The first body line may be a KIND MARKER, `[!TOKEN]` alone on the line, matching one uppercase run (`[A-Z][A-Z0-9_-]*`). It reaches the template LOWERCASED in the `type` field, which is what makes the whole thing need nothing from the palette: the tone slot already reads that field and its classes are lowercase, so `[!WARNING]` paints yellow. The uppercase comes back at the other end, from the template's `@text` table.
- No space, no glyph, no lowercase, no second word. `[!📦 VERSION]`, `[! WARNING]`, `[!warning]` and `[!TWO WORDS]` are NOT markers: each stays the first line of the content and prints inside the band, where the author sees it. The narrowness is the point, because once a space is legal the marker has become the label slot the `@text` table exists to remove.
- The marker BEATS a `type:` attribute, and that is not a branch anywhere: when the payload names a kind the carrier leaves the dressing's kind unset, and the template's field is what reaches the render. It follows that a marker never selects a typed FILE either. With no marker, `type:` behaves exactly as it does over a table.
- The quote must be followed by a BLANK LINE or end the message. Its zone is the run of contiguous non-blank lines, so prose written on the very next line JOINS the zone, no parser claims the mixture, and the whole thing fails open with every line intact.
- The band is emitted on ONE line and nothing measures it: see [caveats](caveats.md).

**The fallback gradient.** A marked quote is what survives where this engine does not run, and it degrades in three steps. Re-rendered as plain markdown, exactly five tokens become native alert boxes: `NOTE`, `TIP`, `IMPORTANT`, `WARNING` and `CAUTION` (verified against GitHub's writing-and-formatting docs, 2026-08-02). Any other token falls back to an ordinary quote whose first line reads `[!VERSION]` literally, which is still visible and still self-describing. Read raw in a transcript, it is still a quote. One boundary worth knowing: an alert cannot be NESTED, so a banner's quote has to sit at the top level of the message. One written inside a list item or another quote keeps rendering here and loses its native fallback there.

A decorator has NO payload when the line under it is blank or absent, and only then. That is how a static view is asked for: `@{view:welcome}` alone, ending the message or with a blank line under it, is the whole health check. Prose on the very next line IS a payload, no parser claims it, and the zone fails open.

Whether a payload exists and how far it reaches are two questions, deliberately kept apart. Existence is decided by that blank line, the one boundary every markdown block agrees on. Extent belongs to the payload's own SHAPE, and the two shapes answer differently: a table ends at the first line that no longer starts with a pipe, which is markdown's rule, so a table followed straight by prose is still a table; a quote ends at the first blank line, so a quote followed straight by prose is neither, and fails open. Asking the table scanner where the zone ended made everything it could not read look like nothing at all, which is how a quoted example became a view summoned with no data.

A payload that exists but is not a shape a parser here claims fails open, and so does a hollow render, under any of three readings: no data reached a template that spends a substitution; data reached one that read none of the fields it got; or every field it did read arrived blank. The middle one is decided on the fields the render ACTUALLY resolved, never on what it printed, because a template drawing literal furniture puts ink on screen whatever it was handed. That is what makes a view refuse a payload SHAPE by not reading it: `banner.view` reads `content`, a table hands it `rows`, and the raw table shows.

"Actually resolved" is meant literally: the reads are recorded by the accessor every field resolution goes through, so the answer covers whatever a template really spent, and a field mentioned on a line the render never reached does not count. A `${field}` inside a loop over an absent list is not read, and neither is the tag an `@tone` names or the view an `@aside` names, neither of which is a field at all.

- The payload stays plain markdown, so the FALLBACK is native: wherever the hook does not run, the reader gets an ordinary table, or an alert quote, under one extra line.
- A table reaches the template as `rows`, a list of `{ label, content }`. An empty label cell continues the label above (one row per item). A quote reaches it as `content`, plus the `type` field its marker named.
- Message text becomes a scope value under ONE treatment, whichever shape carried it: neutralised first (a `{{tag}}` the model wrote prints as those characters and opens no colour), then authored `**bold**` spans rendered per span. Nothing is added the message did not carry. A table cell may additionally carry an escaped pipe (`\|`), the one escape a cell needs and a quote does not.
- `type:` names the KIND of content (`warning`, `error`, `success`; think markdown admonitions). It selects a typed form when one exists (above), reaches the template as the `type` field (so `@frame type warning=fail` colours a border from it), and fills the tone slot when the palette knows the name.
- `tone:` names the LOOK: a palette tag stuck on this render, no file, no semantics, and it outranks the kind. A look wearing a semantic name (`type:even`) would lie to the model about what the content IS, which is why the two words stay apart.
- Both attributes are OPTIONAL, come in any order, and are separated by a comma, whitespace, or both. Any OTHER attribute makes the line prose. The token must begin `@{view:` exactly, which keeps PowerShell's `@{Name='x'}` and a quoted mention inside a sentence from engaging.
- Streaming is withheld from the decorator line, anchored, and revealed when the zone's end is known. Fail-open on every path (unknown template, malformed payload, a template that reads none of the rows): the raw markdown shows, decorator line included.
