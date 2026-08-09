---
name: write-view
description: Write, choose or repair a `.view` template for @tayomi/cc-views, the engine that renders a Claude Code message as a framed terminal view. Use when the user wants a report, banner, status list or table drawn instead of printed as plain text, when a `view:` block renders as raw text instead of drawing, or when they ask to restyle what an agent outputs. Covers picking a bundled view over writing one, writing the template, writing the block that feeds it, and verifying the result with `cc-views check`.
---

# Writing a .view

A view is two halves that live apart: a TEMPLATE file dressing the data, and a BLOCK in the message
carrying it. Get the halves confused and nothing draws.

Work in this order. Steps 1 and 5 are the ones that are skipped and the ones that cost the most.

## 1. Ask the engine what already exists

```
cc-views dict
```

It prints THIS install's own answer as JSON: every directive with what it takes, every tag name, and
every view the search path resolves, in resolution order, each with the fields it `spends` and the
`payload` it expects. Read it before writing anything.

A view whose `spends` already covers the fields you have is a view you do not have to write. The
bundled ones cover most asks: `banner` and `quote` over a markdown quote, `columns` and `lines` over a
markdown table, `box` over a table whose header row is a title and a badge rather than column names,
`hr` on its own line. If one fits, go straight to step 4 and write no file at all.

## 2. Read the language, never infer it

The generated reference ships inside the package, dumped from the tables the engine executes:

```
node_modules/@tayomi/cc-views/agent/catalogue.json
```

Every directive with what it takes, what it opens and what closes it, the containers each is read
in, the two carriers and the data block's line forms, every tag name with the suffixes a colour
derives, and every view this package ships. It cannot drift from the engine: a word taken out of the
table stops being read, and the render changes with it.

Beside it, `docs/CHEATSHEET.md` is the same language written for a human, and carries the worked
example the JSON has no room for. Read one of the two rather than guessing a directive that reads
plausibly, and read one of the two rather than trusting this file, which teaches the PROCEDURE and
not the grammar.

Three rules break most first attempts, and none of them announces itself:

1. A directive sits at **column 0**. An indented `@box` is plain text.
2. Whitespace in the body is **content**. It is what aligns columns, and the engine will not tidy it.
3. Nothing throws. A broken template shows the **raw block** instead, so a mistake looks like a
   message that simply did not get dressed.

## 3. Put the file where resolution will find it

A view named `deploy` is the file `views/deploy.view` at the project root. Names resolve through the
search path in order and the FIRST HIT WINS, so a file of your own named after a bundled view shadows
it. Never edit a template inside `node_modules`: the next install overwrites it.

Keep the template free of decisions the data should make. Use `{{tone}}` where the accent goes and let
the carrier pick the colour, rather than writing one view per colour.

## 4. Write the block that feeds it

Fenced, when the message carries fields:

````
```view:deploy
title: staging
checks:
- ok migrations applied
```
````

Or a decorator line, when the payload should still read where this engine does not run:

```
@{view:banner}
> [!WARNING]
> two flaky suites, publication is blocked
```

Write DATA in the block, never presentation: a tag written in a message is inert on purpose, and the
template you wrote is the only thing allowed to open a colour.

## 5. Verify before handing it back

```
cc-views check deploy 'title: staging'
```

It renders the view against that sample and answers with the reason it will not draw, naming the
template line. Silence means it draws. Non-zero is an error to fix. A warning is zero and is yours to
judge: a field that arrived and is read nowhere may be a view narrowing what it shows on purpose.

Do not hand back a template you have not run this on. The engine never throws at runtime, so an
untested view fails silently in front of the user rather than in front of you.
