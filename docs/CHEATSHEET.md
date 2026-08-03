# Writing a `.view`, the short version

Everything here is stable across installs. What is NOT here, because it depends on the host and would go
stale in a file: the tags a host added with `extendTags`, and which views your `viewsPath` already
resolves. Run `cc-views dict` for those, which prints THIS install's own answer as JSON.

Working through an agent? The `write-view` skill carries this procedure, installed from the repo with
`/plugin marketplace add mopi1402/tayomi-cc-views` or `npx skills add`. It points back here.

Written one and it draws nothing? Run `cc-views check <view> '<block>'`, which renders it against a
sample block and answers with the reason, naming the template line. It is silent when there is none,
non-zero on an error, and zero on a warning. The block also reads from a pipe.

Reading this as a machine? Take `agent/catalogue.json` instead: the same language, generated from the
tables the engine executes and gated at the byte, with every view's path, declarations and expected
payload. This page is the human short version. The full boundary of the language, every form and every
edge, is [architecture/view-language.md](architecture/view-language.md); this page is the part you need
to write your first one.

## A whole view, both halves

The template, `views/deploy.view`, dresses the data. The block, written by the agent, carries it.

`views/deploy.view`
```
@map states ok=success fail=error
@fields checks state name
@tone key
@box
@head {{box_title}}${title}{{/}}
@right deploy
@each checks label="CHECKS" bullet="- "
${state:states} ${name}
@end
@endbox
```

The block the agent writes
````
```view:deploy
title: staging
checks:
- ok migrations applied
- fail smoke suite, 2 red
```
````

## The three rules that break a first attempt

1. **Directives sit at column 0.** An indented `@box` is plain text, not a directive.
2. **Whitespace in the body is content.** It is what aligns your columns; the engine will not tidy it.
3. **Nothing throws.** A bad view, an unknown directive or a hollow render shows the RAW block instead.
   Fail-open means your mistake is visible on screen, never a blank.

## The data block

Flat, line-oriented, values opaque to end of line (a colon or a backtick inside a value is just text).

| Line | Meaning |
| --- | --- |
| `key: value` | a scalar field |
| `key:` | opens a list field |
| `- item` | appends to the open list |
| `  k: v` | indented: turns the key above into a mapping. One level, and what `@use ... from` reads. |

A missing field renders empty, never as an error. A scalar reads as a list of one where a list is expected.
With `@fields <list> a b c`, each item splits: every leading field takes one token, the LAST takes the rest.

## Directives

| Directive | What it does |
| --- | --- |
| `@box ... @endbox` | frames its lines, sizes to CONTENT, wraps, collapses blank runs. No nesting. |
| `@box bare ... @endbox` | same machinery, no outline. What a frameless template needs to still wrap. |
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

## Colour

`{{tag}}` opens a style, `{{/}}` resets. An unknown tag prints verbatim and is measured as text. A tag
written in a MESSAGE is inert: only the template you wrote opens a style.

- Weight: `b`, `dim`. Base colours (follow the user's theme): `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`.
- Named indices (same pixels everywhere): `orange`, `gold`, `purple`, `violet`, `pink`, `teal`, `aqua`, `lime`, `brown`, `navy`, `salmon`, `mint`.
- Semantic: `pass`, `warn`, `fail`, `high`, `med`, `low`, `key`, plus the carrier aliases `warning`, `error`, `success`, `info`.
- Furniture: `box_rule`, `box_title`, `code`.
- Any colour has a `<name>_bg` chip and a `<name>_cap` (the foreground painting that chip, for a glyph drawn AGAINST it).

**The tone slot.** Write `{{tone}}`, `{{tone_bg}}`, `{{tone_cap}}` where your accent goes, and the RENDER
decides the colour: same template, any colour, no second file. Resolution, most explicit first: `tone:` on
the decorator, the block's `tone` field, the kind (`type:`), the template's `@tone`, then neutral. An
unknown name falls through to the next, so a typo costs a colour and never the render.

## The two carriers

A fenced block, which carries fields:

````
```view:demo
key: value
```
````

Or a decorator line, which dresses plain markdown so it still reads where the hook does not run:

```
@{view:banner}
> [!WARNING]
> two flaky suites, publication is blocked
```

- `@{view:<name>}` sits alone on its line, directly above its payload. Attributes: `type:` (the KIND of
  content, may select a typed file `demo.warning.view`) and `tone:` (the LOOK only, and it outranks the kind).
- Two payload shapes, decided by the FIRST line: a leading pipe is a table (reaching the template as `rows`,
  a list of `{ label, content }`), a leading `>` is a blockquote (reaching it as `content`).
- A quote's first line may be a kind marker, `[!TOKEN]` alone, one uppercase run. It arrives LOWERCASED in
  the `type` field. No space, no glyph, no second word, or it is not a marker.
- A quote must be followed by a blank line or end the message.
- No payload at all (blank line under the decorator, or end of message) asks for a static view: `@{view:welcome}`.

## Where the file goes

A view named `demo` is the file `demo.view`, searched through `viewsPath` in order, FIRST HIT WINS. So you
shadow any view, bundled ones included, by naming a file the same in a directory listed earlier.

Bundled and shadowable: `banner`, `columns`, `hr`, `lines`, `quote`, `tayo`, `welcome`.

Run `@{view:welcome}` to check your wiring: it is the health check and its own commented tutorial.
