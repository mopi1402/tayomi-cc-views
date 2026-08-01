# Architecture: the five decisions that carry the engine

Design prose, meant to be read with the code open. The normative references are
[view-language.md](view-language.md) and [display-host.md](display-host.md); this
document explains why the engine has this shape, and what each decision cost or
avoided.

## 1. The layer chain

`style ← layout ← template ← carrier ← pipeline`: each layer imports only leftward.

- `style.ts` is the leaf: the ANSI vocabulary, with no notion of geometry or data.
- `layout/` measures and frames.
- `template/` parses and substitutes.
- `carrier/` recognises the zones of a message.
- `pipeline.ts` is the only piece that sees everything, and composes in the only
  safe order.

`scope.ts` lives at the root, next to `style.ts`, because two layers that must not
depend on each other both consume it: the substituter and the column measurer.

Three rules complete the chain, enforced by a gate in the host repo: one `main()`
per process (an edge module imported into a bundle once stole another hook's
stdin), the edge is a leaf (nothing imports `hook/runner.ts`), and no cycles. The
practical payoff: every storey can be tested without erecting the storeys above it.

## 2. Streaming as a pure slice

MessageDisplay delivers a message flush by flush, and the flushes are CONCURRENT.
`slice()` is a PURE function of the text accumulated before the flush and the
flush's delta: it recomputes the transformation of the whole message, then emits
only the newly revealed slice. No offset survives between two flushes. The previous
version kept one, and three in-flight flushes lost updates on that shared state.
Paying a second transformation per flush is the price of convergence: the
concatenated slices equal the target, whatever the interleaving.

Retention follows the same logic. A zone still arriving (an open fence, a decorated
zone whose end is unknown) is cut from the output before the carrier sees it, then
revealed fully rendered on the final delta.

> A delta already shown can never be taken back.

That constraint dictates the whole design, and it leaves an accepted residue: a
marker cut mid-way (`{{sta`, `@{view:ta`) can reach the screen raw before it
completes.

## 3. The width polyfill

The hook process cannot see the terminal: its stdout is a pipe, the environment
carries no size, `/dev/tty` answers ENXIO. Yet the box must wrap its own content,
otherwise the terminal folds long lines as it pleases and shreds the frame. The
answer is an assumed polyfill: walk the ancestor chain with `ps`, open the tty of
the `claude` process, read its columns, and cache the result (3 s TTL) because the
probe costs ~25 ms and the hook runs on every delta.

The resolution order makes every stage skippable:

1. a number in the options (an oracle's forced ceiling),
2. the environment variable (the operator's ceiling),
3. a source function,
4. the probe,
5. 100 by default.

The reopening trigger is documented: the day the hook payload carries the terminal
size, it becomes one more source, zero API change.

## 4. The decorator's trade

The fenced block has a structural flaw: reread from the transcript (where the hook
does not run), it turns back into a wall of code. The decorator flips the deal. The
payload IS ordinary markdown (a two-column table), and a single line above it names
the template and the semantic type. Fallback becomes native by construction: at
worst, the reader sees a normal table under one extra line.

Two principles follow.

- **Commitment is on INTENT, never on shape**: an undecorated table, whatever it
  looks like, crosses the screen byte for byte (the lesson of the withdrawn POC,
  which captured tables by their shape).
- **Fail-open is total**, decorator line included: the screen shows exactly what
  the transcript holds, even in the hollow-template case where no field is read
  (a blank where content should be would be worse than the raw text).

## 5. The process-global palette

The `{{tag}}` vocabulary is not a per-call option but a process-global registry
(`extendTags`), and that is a coherence choice, not a convenience: the layout
leaves MEASURE through this vocabulary (a known tag weighs zero columns, an unknown
tag is text) while the renderer RESOLVES it. Two distinct sets would make every
width a lie. The registry is additive only: redefining an existing tag raises an
error, because a shadow would change the language under the feet of every template
already written.
