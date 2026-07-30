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

## Template anatomy

- A line starting with `#` (leading whitespace allowed) is a template comment,
  dropped at parse time. There is no way to render a literal leading `#`.
- `@map <name> <value>=<tag> ...` declares an enum-to-style table, e.g.
  `@map verdicts ok=pass fail=fail`. Pairs missing either side are skipped.
- `@fields <list> <field> <field> ...` declares that items of `<list>` split into
  named fields (see the data format below).
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
The built-in vocabulary (`style.ts`):

- Weight: `b`, `dim`.
- Colours: `red`, `green`, `yellow`, `cyan`, `orange`, `gold`.
- Semantic foreground: `pass`, `warn`, `fail`, `high`, `med`, `low`, `key`.
- Filled chips: `chip`, `title`, `pass_bg`, `warn_bg`, `fail_bg`, `high_bg`,
  `med_bg`, `low_bg`.
- Furniture: `box_rule`, `box_title`; `code` is the inline-code colour.

A host adds its own tags process-wide with `extendTags` (see the integration
reference). Inline backtick code spans (`` `like this` ``) render on every view in
Claude Code's native inline-code colour; the backticks cost no width.

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

### The decorator line

```
@{view:<name>}
@{view:<name>, type:<kind>}
```

Alone on its line (surrounding whitespace allowed), directly above a two-column
pipe table: header row MANDATORY (its cells may be empty, `| | |`), then the
delimiter row, then at least one data row. The zone ends by markdown's own block
rule, at the first line that no longer starts with a pipe.

- The payload stays plain markdown, so the FALLBACK is native: wherever the hook
  does not run, the reader gets an ordinary table under one extra line.
- The template receives `rows`, a list of `{ label, content }`. An empty label
  cell continues the label above (one row per item).
- A cell may carry an escaped pipe (`\|`) and authored `**bold**` spans (rendered
  as bold, per span; nothing is added the message did not carry).
- `type:` names the KIND of content (`warning`, `error`, `success`; think markdown
  admonitions), resolved as a typed form (above). It is the only attribute: an
  unknown attribute makes the line prose, as does a space before the comma. The
  token must begin `@{view:` exactly, which keeps PowerShell's `@{Name='x'}` and
  a quoted mention inside a sentence from engaging.
- Streaming is withheld from the decorator line, anchored, and revealed when the
  zone's end is known. Fail-open on every path (unknown template, malformed
  payload, a template that reads none of the rows): the raw markdown shows,
  decorator line included.
