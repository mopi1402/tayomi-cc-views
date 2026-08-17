# Writing a `.view`, the short version

Every form and every edge: [architecture/view-language.md](architecture/view-language.md). For a machine:
`agent/catalogue.json`. For THIS install's views and tags: `cc-views dict`. To find out why one draws
nothing: `cc-views check <view> '<block>'`, which names the shape the view takes, then the line that
failed. Write that block as a MODEL would, decorator and all: only a decorated block names a payload
shape. A whole directory of `<view>.md` samples at once: `cc-views check --all <dir>`.

## A whole view, both halves

A TEMPLATE dresses the data, a BLOCK carries it. `views/deploy.view`:

```
@map states ok=success fail=error
@fields checks state name
@box
@head ${title}
@each checks label="CHECKS" bullet="- "
${state:states} ${name}
@end
@endbox
```

and the block that feeds it:

````
```view:deploy
title: staging
checks:
- ok migrations applied
- fail smoke suite, 2 red
```
````

## Three rules that break a first attempt

1. **Directives sit at column 0.** An indented `@box` is plain text, not a directive.
2. **Whitespace in the body is content.** The engine will not tidy it.
3. **Nothing throws.** A bad view, an unknown directive or a hollow render shows the RAW block instead.

## The data block

Flat, line-oriented, values opaque to end of line (a colon or a backtick inside a value is just text).

| Line | Meaning |
| --- | --- |
| `key: value` | a scalar field |
| `key:` | opens a list field |
| `- item` | appends to the open list |
| `  k: v` | indented: turns the key above into a mapping. One level, and what `@use ... from` reads. |

A missing field renders empty, never as an error, and a scalar reads as a list of one where a list is
expected. Under `@fields <list> a b c` each item splits: leading fields take one token, the LAST takes the rest.

## Directives

| Directive | What it does |
| --- | --- |
| `@box ... @endbox` | frames its lines, sizes to CONTENT, wraps, collapses blank runs. No nesting. |
| `@box bare ... @endbox` | same machinery, no outline: a frameless template that still wraps. |
| `@head <text>` | the title row, first line inside the border. |
| `@right <text>` | a badge set into the top border. |
| `@foot <field>` | names a FIELD; its items land in a zone at the bottom, absent when the field is. |
| `@frame <field> k=<tone>` | the border colour follows a field's value. |
| `@rule [prefix]` | an inner division; survives only between two lines that printed. |
| `@each <field> ... @end` | repeats per item. `label="..."`, `bullet="- "`, `cap="1/3"`, values QUOTED. |
| `@aside <view> ... @endaside` | a second column on the left, holding a named view read as plain rows. |
| `@use <view> [from <field>]` | draws a named view HERE, rendered, with its own tables and tone. `from` feeds it one field; without it the view inherits your scope. |
| `@map <name> v=<tag>` | value to STYLE (a chip). Pairs split on whitespace. |
| `@text <name> v="..."` | value to WORD. Pairs QUOTED. `*="..."` serves the absent value. |
| `@fields <list> a b c` | declares that items of `<list>` split into named fields. |
| `@tone <tag>` | the class the tone slot holds by default. |
| `# comment` | dropped at parse time. |

## Substitutions

| Form | Resolves to |
| --- | --- |
| `${field}` | the value; dotted paths (`${a.b}`) reach nested data |
| `${field:table}` | the value through a `@map` (a chip) or a `@text` (a word) |
| `${.}` | the current `@each` item |
| `${#}` | its 1-based index |
| `${#label}` | the loop's label column (spaces outside one, so a line can align with it) |
| `${#bullet}` | the loop's item marker |
| `${#hang}` | the wrap boundary, for a line with no `@each` to declare a `bullet=` on |
| `${#fold}` | where the fold starts painting; left of it the prefix is voided, style and all |
| `${#tail}` | closing furniture: drawn while the line fits, dropped and squared to the width when it folds |

## Colour

`{{tag}}` opens a style, `{{/}}` resets. An unknown tag prints verbatim and is measured as text. A tag
written in a MESSAGE is inert: only the template you wrote opens a style.

- Weight: `b`, `dim`. Base colours (follow the user's theme): `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`.
- Named indices (same pixels everywhere): `orange`, `gold`, `purple`, `violet`, `pink`, `teal`, `aqua`, `lime`, `brown`, `navy`, `salmon`, `mint`.
- Semantic: `pass`, `warn`, `fail`, `high`, `med`, `low`, `key`, plus the carrier aliases `warning`, `error`, `success`, `info`.
- Furniture: `box_rule`, `box_title`, `code`. Any colour also has a `<name>_bg` chip and a `<name>_cap`, the foreground painting that chip.

`{{tone}}`, `{{tone_bg}}` and `{{tone_cap}}` hold the accent the RENDER picks, most explicit first: `tone:` on
the decorator, the block's `tone` field, the kind (`type:`), the template's `@tone`, then neutral. An unknown
name falls through to the next, so a typo costs a colour and never the render.

## The two carriers

A fenced block whose info string is `view:<name>` carries fields, as above. A decorator line dresses plain
markdown, which still reads where the hook does not run:

```
@{view:banner}
> [!WARNING]
> two flaky suites, publication is blocked
```

- `@{view:<name>}` sits alone on its line, directly above its payload. Attributes: `type:` (the KIND of
  content, may select a typed file `demo.warning.view`) and `tone:` (the LOOK only, and it outranks the kind).
- The FIRST line decides the shape: a leading pipe is a table, a leading `>` a blockquote (reaching the
  template as `content` and `flow`), an exact ` ```mermaid ` a diagram source (drawn, then as `content`).
  A table ends on the first non-pipe line, a quote needs a blank line under it or the end of the message,
  a fence runs to its closing ` ``` `.
- ONE view, ONE shape: each template accepts a single payload form (the `payload` column below), and any
  other shape under its decorator fails open, the zone showing exactly as written. A template never DECLARES
  that form: it is scored on the names the BLOCK carries, the fields an `@each` splits its own list into
  being the author's vocabulary and no evidence. `cc-views check <view>` prints the one it resolved to.
- A table reaches the template as `rows`, a list of `{ label, content }`. Its header row is dropped, EXCEPT
  in `box`, where the header IS the frame: first cell the title, last cell a badge.
- A quote's first line may be a kind marker, `[!TOKEN]` alone, one uppercase run. It arrives LOWERCASED in
  the `type` field. No space, no glyph, no second word, or it is not a marker.
- A quote's body reaches the template as `content`, LINE FOR LINE, and as `flow`, the same body with those
  breaks spent as spaces. `quote` spends `content` and draws two `>` lines as two lines; `banner` spends
  `flow`, one band being one paragraph.
- No payload at all (blank line under the decorator, or end of message) asks for a static view: `@{view:welcome}`.

## The bundled views

A view named `demo` is the file `demo.view`, searched through `viewsPath` in order, FIRST HIT WINS, so a
file of the same name in an earlier directory shadows any of these.

| View | Payload | Draws |
| --- | --- | --- |
| `columns` | table | each row split into two to four columns |
| `lines` | table | each row ruled under the one above |
| `box` | table | a framed block, the header row carrying its title and badge |
| `banner` | quote | one alert band, its kind taken from a `[!KIND]` first line |
| `quote` | quote | one sentence set apart, colour only |
| `mermaid` | fence | the diagram a ` ```mermaid ` fence holds, drawn in the terminal |
| `hr` | none | a rule on its own |

`@{view:welcome}` takes no payload and checks your wiring. `mermaid` takes the fence and NOTHING else:
where the hook does not run, the fence stays a diagram that draws itself, which is the whole reason
that carrier was chosen.
