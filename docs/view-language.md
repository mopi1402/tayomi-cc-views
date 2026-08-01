# The `.view` language reference

A view is a template file that dresses a data block on screen. This document is the
language's boundary: every form the engine accepts is here, and nothing here is
aspirational. Grounded in `template/parse.ts`, `template/directives.ts`,
`template/substitute.ts`, `template/load.ts`, `scope.ts`, `style.ts`,
`carrier/scan.ts` and `carrier/decorator.ts`.

## Templates and their resolution

A view named `demo` is the file `demo.view`, searched through an ORDERED list of
directories (`RenderOptions.viewsPath`): the walk goes dir by dir and the first hit
wins, so a consumer that lists its own directory before another one shadows a view
by simply naming a file the same.

A view may carry TYPED FORMS: `demo.warning.view` beside `demo.view`. The decorator
carrier (below) selects one with `type:`. Within ONE directory the typed file beats
the default; ACROSS directories, path order outranks specificity (an earlier dir's
`demo.view` beats a later dir's `demo.warning.view`). An unknown type lands on the
default form, never on an error. One asymmetry to know: the LAST directory is read
unconditionally rather than existence-checked, so a view found nowhere fails with a
real path (which the caller turns into the raw block on screen).

A typed form is for a different SHAPE, and for nothing else. A view that only changes
COLOUR under a kind needs no second file: it spends the tone slot (below), which is
what keeps a near-copy of a template from existing per colour.

## Template anatomy

- A line starting with `#` (leading whitespace allowed) is a template comment,
  dropped at parse time. There is no way to render a literal leading `#`.
- `@map <name> <value>=<tag> ...` declares an enum-to-style table, e.g.
  `@map verdicts ok=pass fail=fail`. Pairs missing either side are skipped.
- `@fields <list> <field> <field> ...` declares that items of `<list>` split into
  named fields (see the data format below).
- `@tone <tag>` declares the class this template's tone slot holds by DEFAULT, e.g.
  `@tone key`. One tag name and nothing else on the line. A carrier that names a
  class outranks it (see the tone slot below).
- Every other line is body, rendered in order.

## The data a block carries

The block format is flat and line-oriented; values are OPAQUE to end of line, so
colons, backticks and brackets inside a value are just text. The parser is TOTAL:
it never throws, and an unrecognised line is ignored.

```
key: value        -> scalar field, the rest of the line verbatim
key:              -> opens a list field named key
- item            -> appends an item to the currently open list
```

Keys match `[A-Za-z_][\w-]*`. For a list declared as an object list (the view's
`@fields`), each `- item` splits into the declared fields: every LEADING field takes
one whitespace-delimited token, the LAST field takes the remaining text verbatim.
Leading fields are ids and enums; the last field is the prose.

Reading rules the engine applies when a directive consumes a field:

- A scalar field reads as a list of one where a list is expected.
- A whitespace-only field reads as empty, indistinguishable from never written.
- A missing field substitutes as the empty string (or as spaces, inside a padded
  column), never as an error.

## Directives

### `@each <field> [label="..."] [bullet="..."] [cap="n/d"] ... @end`

Repeats its inner lines once per item of `<field>`. Attribute values are QUOTED,
and the strictness is deliberate: anything left over on the line after the known
attributes makes the whole line TEXT, not a loop.

- `label="CHECKS"`: the label renders on the FIRST item (via `${#label}`), spaces of
  the same width on every later one, so a section names itself once. The label
  column is as wide as the WIDEST label any `@each` in the template declares.
- `bullet="- "`: an item marker, substituted per item (so `bullet="R${#} "` numbers
  rows), exposed as `${#bullet}`, and carrying the hanging-indent boundary so a
  wrapped item aligns under its own text instead of under its bullet.
- `cap="1/3"`: clamps the measured width of every LEADING column of the loop at
  `floor(width * n / d)`. A value past the cap is cut on an ellipsis; the cut is
  markup-aware (a `{{tag}}` is never cut open, a code span keeps its backticks) and
  closes whatever style it interrupted. Only capped columns ever truncate: an
  uncapped column is measured over its values, so nothing exceeds it.

Column alignment inside a loop is automatic: each field of an object list becomes a
padded column, except the LAST field (the prose tail), emitted verbatim.

### `@box ... @endbox`, with `@head`, `@right`, `@foot`, `@frame`, `@rule`

`@box` frames its inner lines: the box sizes to its CONTENT (a one-line block stays
one line wide), wraps long lines at the width ceiling, and collapses blank runs so
an unconditional separator in the template only shows between sections that actually
rendered. Boxes do not nest.

- `@head <text>`: the title row, first inside the border (substitutions allowed).
- `@right <text>`: a badge set into the TOP border (substitutions allowed).
- `@foot <field>`: names a FIELD (it does not carry text); its items render in a
  zone under a full-width rule at the bottom, blank items dropped.
- `@frame <field> <key>=<tone> ...`: the border's colour follows a field's value,
  so the state that picks a badge picks the border too. An unlisted value keeps the
  default grey.
- `@rule [prefix]`: an inner division, drawn to the border; the prefix takes
  substitutions, and the rule survives only between two lines that actually
  printed.

### `@aside <view> [top|bottom] ... @endaside`

Lays a SECOND column to the LEFT of every line up to `@endaside`. The column's
content is the named view, resolved through the same ordered search path as any
other view (shadowing included), and nothing else: a region NAMES its content and
cannot carry it inline, which is the whole point of the primitive (raw art stays out
of a readable template).

```
@box
The health check, at the full content width.
@rule
@aside tayo
 {{cyan}}LEARN  {{/}}  {{cyan}}▎{{/}} the first section, beside the picture
@endaside
@endbox
```

- The named view is read as PLAIN ROWS: no directive in it is honoured and no
  substitution runs over it, so a file carrying `@box`, `@each`, `@map` or `@foot`
  shows those lines as text. Art meant for a region therefore ships frameless.
- The region spends the aside's own printed width plus FIVE columns before the main
  flow: two spaces, the separator, two spaces. With a 28-cell picture that is 33
  columns, and the main flow gets whatever is left of the box's content width.
- Below **40 printed columns of box content** for the main flow (the box's width
  ceiling less its 4 columns of border, not the terminal's width), the aside and its
  separator are DROPPED whole and the flow takes the full width. A picture is
  decoration; prose squeezed beside one is not readable.
- The two columns CENTRE against each other, and an odd padding row goes below.
  `@aside <view> top` and `@aside <view> bottom` pin the shorter column to that edge
  instead. Anything else after the name makes the line plain text.
- A view that resolves NOWHERE degrades to the full-width main flow: a decoration
  never takes its box down.
- An aside row is emitted verbatim, never wrapped, split or restyled: every composed
  line is built to fit the box already, which is what keeps the wrapper from breaking
  a picture on the spaces its transparent pixels are made of.
- A BLANK main-flow line survives inside a region (the composed line still carries
  the separator, so the box has no blank run to collapse). Outside a region, blank
  collapsing is unchanged.
- Regions do not nest, they carry no `@rule` (an inner rule is filled to the border,
  which means nothing across two columns), and the column is always on the left.

## Substitutions

`${...}` resolves against the block's fields (plus the loop's bookkeeping):

- `${field}`: the value. Dotted paths (`${a.b}`) resolve into nested data.
- `${field:mapname}`: the value looked up in an `@map` table. On the map, it
  renders as a chip: the value UPPERCASED inside the mapped tag's colours, padded so
  chips align down the column. Off the map, plain text, padded to the same cell.
- `${.}`: the current item of the enclosing `@each` (an object item re-serialises
  as `key: value, ...` prose).
- `${#}`: the current item's 1-based index.
- `${#label}`: the loop's label column (see `label=`). Outside a labelled loop it
  is spaces of the label column's width, so a non-list line can align with one.
- `${#bullet}`: the loop's item marker (see `bullet=`). Empty outside one.

## Inline styling

`{{tag}}` opens a style, `{{/}}` resets. An UNKNOWN tag name stays on screen
verbatim (it is text, not markup), and every width measurement agrees with that.

This is the VIEW language, and it is spoken in a `.view` file only. A tag written in a
MESSAGE is inert, in its prose and inside a block's data alike: `{{warn}}` typed by the
model prints as those eight characters, and it is measured as eight columns because
that is what it costs. Only the template you wrote opens a style. That is what keeps
presentation on disk, where you can read it and change it, instead of in whatever a
model happened to emit.

The one thing a message still influences is the tone SLOT (below), which names a class
the template chose to spend. It cannot invent a style the template did not ask for.

The built-in vocabulary (`style.ts`):

- Weight: `b`, `dim`.
- Colours: `red`, `green`, `yellow`, `cyan`, `orange`, `gold`.
- Semantic foreground: `pass`, `warn`, `fail`, `high`, `med`, `low`, `key`.
- Carrier names, aliases of the above: `warning` (= `warn`), `error` (= `fail`),
  `success` (= `pass`), `info` (= `key`). They exist so a kind a carrier names
  dresses a view with no template of its own.
- Filled chips: `chip`, `title`, `pass_bg`, `warn_bg`, `fail_bg`, `high_bg`,
  `med_bg`, `low_bg`, `warning_bg`, `error_bg`, `success_bg`, `info_bg`.
- Furniture: `box_rule`, `box_title`; `code` is the inline-code colour.
- The tone slot: `tone`, `tone_bg` (below).

A host adds its own tags process-wide with `extendTags` (see the integration
reference); a host's registration SHADOWS a built-in name, the last word going to
the screen's owner, under the same law that lets a views dir shadow a bundled
view. Inline backtick code spans (`` `like this` ``) render on every view in
Claude Code's native inline-code colour; the backticks cost no width.

### The tone slot

`{{tone}}` and `{{tone_bg}}` are the one pair of tags whose colour the RENDER decides
instead of the template. A view writes them where its accent goes; a carrier names the
class that fills them, like sticking a class on it. Same template, any colour, no
second file:

```
@tone key
@each rows
{{tone}}${label}{{/}}  ${content}
@end
```

The class is a palette tag NAME (`warn`, `dim`, `gold`, a host's own tag, or a carrier
name above). Resolution, most explicit first:

1. `tone:` on the decorator line;
2. the block's own `tone` field (the fenced block's way in: it carries no attributes);
3. the kind, from `type:` on the decorator or a `type` field;
4. the template's `@tone`;
5. otherwise the neutral (`key`).

Every candidate is checked against the palette and an unknown name falls THROUGH to
the next one, so a typo costs a colour, never the render. `{{tone_bg}}` spends the
class's `_bg` chip, or its foreground when the palette has no chip for it.

## The carriers

### The fenced block

````
```view:demo
key: value
```
````

The engine replaces the whole block with the named view's render. While the block
is still STREAMING (opening fence seen, closing fence not yet), it is withheld from
the screen and revealed rendered when it closes. On any failure (unknown view,
zero fields parsed from a non-empty body, render error) the raw block shows,
fences included: fail-open, never a blank.

The block carries no attributes, so a `tone` or `type` FIELD is how it names the class
filling the tone slot. They stay ordinary fields: a template that never spends the slot
and never prints them renders exactly as it did without them.

### The decorator line

```
@{view:<name>}
@{view:<name>, type:<kind>}
@{view:<name>, tone:<tag>}
@{view:<name> type:<kind> tone:<tag>}
```

Alone on its line (surrounding whitespace allowed), directly above a two-column
pipe table: header row MANDATORY (its cells may be empty, `| | |`), then the
delimiter row, then at least one data row. The zone ends by markdown's own block
rule, at the first line that no longer starts with a pipe.

A decorator with NO payload at all summons the view with no data: how a static
view is asked for (`@{view:welcome}` alone is the whole health check). A
data-driven view summoned bare renders nothing, and the hollow-render guard
shows the raw line instead. A payload that exists but is not the supported
table shape still fails open.

- The payload stays plain markdown, so the FALLBACK is native: wherever the hook
  does not run, the reader gets an ordinary table under one extra line.
- The template receives `rows`, a list of `{ label, content }`. An empty label
  cell continues the label above (one row per item).
- A cell may carry an escaped pipe (`\|`) and authored `**bold**` spans (rendered
  as bold, per span; nothing is added the message did not carry).
- `type:` names the KIND of content (`warning`, `error`, `success`; think markdown
  admonitions). It selects a typed form when one exists (above), reaches the template
  as the `type` field (so `@frame type warning=fail` colours a border from it), and
  fills the tone slot when the palette knows the name.
- `tone:` names the LOOK: a palette tag stuck on this render, no file, no semantics,
  and it outranks the kind. A look wearing a semantic name (`type:even`) would lie to
  the model about what the content IS, which is why the two words stay apart.
- Both attributes are OPTIONAL, come in any order, and are separated by a comma,
  whitespace, or both. Any OTHER attribute makes the line prose. The token must begin
  `@{view:` exactly, which keeps PowerShell's `@{Name='x'}` and a quoted mention
  inside a sentence from engaging.
- Streaming is withheld from the decorator line, anchored, and revealed when the
  zone's end is known. Fail-open on every path (unknown template, malformed
  payload, a template that reads none of the rows): the raw markdown shows,
  decorator line included.
