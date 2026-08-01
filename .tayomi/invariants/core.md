## target

The @tayomi/cc-views package stays releasable: types, tests and lint verify green on every stop.

## non-goals

## hard-constraints

## done-when

```yaml
# TypeScript compiles cleanly across the whole project, tests included (tsc --noEmit).
- id: typecheck-green
  verify: pnpm typecheck
  pass-if: exit == 0
# The vitest suite passes; the behaviour the tests pin down stays intact.
- id: tests-pass
  verify: pnpm test
  pass-if: exit == 0
# ESLint over src/**/*.ts stays clean with zero warnings tolerated, security plugin enabled.
- id: lint-clean
  verify: pnpm lint
  pass-if: exit == 0
```
