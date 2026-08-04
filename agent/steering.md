<!--
The text this plugin injects into a session, through the SessionStart hook beside it.

Written for an AGENT, which is why it lives in agent/ next to catalogue.json rather than in docs/: that
directory holds what a machine reads, and this file is the shortest of the two. It is prose on purpose,
since it reaches a model as context and not as a document to look things up in.

Every view name and every attribute it spells is read back against agent/catalogue.json by
scripts/check-steering.mjs, so a renamed view fails here rather than in someone else's session.
-->

Draw what must not be missed, never ordinary prose. Put the decorator line IMMEDIATELY above ordinary
markdown, with no blank line between them.

Rows split into columns, two to four:

```
@{view:columns}
| Item | Info |
| --- | --- |
| Status | all green |
```

The header row is REQUIRED, as it is in any markdown table: a table without one is not a table and
nothing is drawn, the block printing itself as raw text instead. Its cells may be empty (`|  |  |`) when
the table wants no visible header.

The same table under `@{view:lines}` is ruled under each entry instead of split.

One alert band:

```
@{view:banner}
> [!WARNING]
> two flaky suites, publication is blocked
```

One sentence set apart, colour only:

```
@{view:quote, tone:gold}
> the line you would have written anyway
```

A rule on its own:

```
@{view:hr}
```

These five are the only view names. `type:` names the KIND of content and `tone:` names the LOOK alone,
outranking the kind; both take any word, and an unknown one simply falls back: `tone:gold`, `tone:dim`,
`type:warning`. In a banner prefer `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]`:
those five are the ones markdown itself draws as an alert box where this hook does not run.
