## target

Make the NEWEST registered engine the one that draws, whatever order Claude Code calls the hooks in. More than one MessageDisplay hook can be registered and they chain, the second receiving the first's output and the FIRST to run consuming the zone (`docs/caveats.md`, measured 2026-07-31). The order is not ours, so today a plugin carrying an older engine silently draws over a newer one in a dev checkout, and the only cure is a publish plus a plugin bump for every change: a treadmill that re-breaks the moment anything is not published. Measured 2026-08-10 on this machine: the plugin's `2.0.0-rc.2` drew a table the local checkout renders correctly, character for character the older engine's output. The half that already works is the other order, where an engine handed an already drawn message rewrites nothing. So one thing is missing, and only one: an engine that knows it is not the newest must decline to consume the zone, leaving the text for the one that is.

## non-goals

- No change to what a SINGLE engine renders. Where only one is registered the screen is byte-identical to today, and that is the case every existing test covers.
- No reading of Claude Code's settings, plugin manifests or hook registrations. The engine never learns that format: it moves, it is not ours, and `docs/caveats.md` already names the dispatcher as the boundary. Each engine reports for itself and for nothing else.
- No influence on the ORDER. Which hook runs first stays Claude Code's, and this ticket only changes which one consumes.
- No negotiation per message, no lock, no IPC, no daemon. One file per engine, written once per process.
- No abstention in the LIBRARY. `renderView`, `traceView`, `slice` and the pipeline are untouched: a host that calls the engine directly is never silenced by something else registered on the machine.
- No tie-break between equal versions. The same version is the same code, so both drawing and the first winning is exactly what happens today and costs nothing.
- No repair of an older engine's rendering. An engine that is alone still draws, however old.
- No new runtime dependency, semver comparison included.

## hard-constraints

- The seam is the hook edge, `handleMessageDisplay` in `src/hook/runner.ts`, and nowhere else. It already answers null for "nothing to say" and a yield IS that answer: the raw delta stands and the next hook in the chain receives it untouched.
- The decision is taken once per PROCESS and holds for the whole flush. An engine that yielded one delta and drew the next would tear a single message across two renders, which is worse than either engine drawing it whole.
- The registry is one FILE PER ENGINE in a directory, never a shared JSON document. Up to three flushes are in flight at once and a shared document has no writer that wins; the per-message stream state in `src/platform/stream-state.ts` is already built this way and this follows it.
- That directory is MACHINE-WIDE and fixed, never under a host's own `stateDir`. `RenderOptions.stateDir` exists precisely so a host does not share scratch with another host, and a registry that honoured it would put two engines in two directories where neither ever sees the other.
- An engine writes ONLY its own entry, keyed on the resolved filesystem path of the module it is running from. Two installs are two paths and two entries; the same install running again rewrites one. The entry carries that path and `ENGINE_VERSION` from `src/data/engine.ts`, which is the number the code that draws answers with.
- The write happens BEFORE the decision, so an engine that yields is still visible to its peers on the next flush. An engine that only announced itself when it drew would vanish from the registry the moment it started yielding, and the two would take turns.
- Yield only on a STRICTLY greater peer version, compared as semver with a prerelease ordered below its release: `2.0.1-rc.0` is below `2.0.1` and above `2.0.0`. Equal or lower means draw.
- A peer is trusted only if the path it recorded still EXISTS, checked with one stat. An engine that was uninstalled must not go on silencing the ones left behind, and without this check a single stale entry costs a full expiry of raw screens.
- Entries expire on mtime and are swept best-effort, the way `sweepStale` already sweeps stream state. Both engines rewrite their entry on every flush, so a peer that stops running goes stale on its own.
- Every read and every write is TOTAL. An unreadable directory, a malformed entry, a version that does not parse, a stat that throws: all of them mean DRAW, never yield and never throw. This runs on every flush of every message, and the failure mode of a yield is a blank where a view was.
- An env var turns the yield off, spelled from the `ENV_PREFIX` in `src/data/markup.ts` like `CC_VIEWS_WIDTH` and `CC_VIEWS_THEME` beside it. Off means draw, so the escape hatch can never be the thing that silences a screen.
- The mechanism lives in the engine that YIELDS, which no already-installed engine can be taught retroactively. It therefore reaches a consumer only by one publish and one bump, and `docs/contributing/manual-checks.md` says so: the last time that chain is needed for this reason, since from then on any newer engine wins on its own.
- `docs/caveats.md` "Two engines can draw the same message" is REWRITTEN, not deleted. The chaining is unchanged and still true; what changes is which of the two consumes, and a caveat that outlives its cause is worse than no caveat because a reader trusts it.
- The new module answers for itself with a sidecar beside it, and every near-miss gets a case as much as the hit: a peer with a LOWER version does not silence, a peer whose recorded path is gone does not silence, an expired entry does not silence, an unreadable registry does not silence, and the env var off does not silence. A suite that only ever proves the yield cannot tell it apart from an engine that never draws.
- One end-to-end case in `tests/`, driving two versions through the edge rather than the module: the older yields with the newer present, and draws alone. The unit cases prove the rule, this proves the seam is the one the hook actually crosses.

## acceptance

1. Given two engines registered and the OLDER called first, When a message carrying a view is flushed, Then the older answers nothing and the newer draws it, whichever order the dispatcher chose.
2. Given a single engine registered, When any message is flushed, Then it draws exactly what it draws today, byte for byte, no registry on disk changing that.
3. Given a peer entry naming a version LOWER than the running engine's, When a flush arrives, Then the running engine draws, a peer being a reason to yield only when it is strictly newer.
4. Given a peer entry whose recorded path no longer exists on disk, When a flush arrives, Then the running engine draws, an uninstalled engine silencing nobody.
5. Given a peer entry older than the expiry, When a flush arrives, Then the running engine draws, and the expired entry is swept best-effort on the way past.
6. Given a registry directory that cannot be read, or an entry that is malformed, or a version that does not parse, When a flush arrives, Then the running engine draws and nothing throws, a failure to read the registry never costing a screen.
7. Given the opt-out env var set, When a flush arrives with a strictly newer peer registered, Then the running engine draws, the escape hatch being incapable of causing a silence.
8. Given an engine that yielded on one flush, When the next flush of the same message arrives, Then its entry is still in the registry with a fresh timestamp, so the two never take turns.
9. Given a host calling `renderView` or `traceView` directly, When any peer is registered at any version, Then the render happens, the library answering to nobody's registry.

## tasks

- Add `src/platform/peers.ts`: announce this engine (its resolved module path and `ENGINE_VERSION`) as one file in a fixed machine-wide directory, read the peers, and answer whether a strictly newer one is present and trustworthy. Announce before answering. (AC: 1, 3, 8)
- Trust a peer only after one stat on the path it recorded, and expire entries on mtime with a best-effort sweep in the shape `sweepStale` already uses. (AC: 4, 5)
- Make every path total: an unreadable directory, a malformed entry, an unparsable version and a failing stat all answer "no newer peer", never a throw. (AC: 6)
- Add the comparison of two versions to the same module, prereleases ordered below their release, with no new dependency. (AC: 3)
- Spell the directory name and the opt-out env var in `src/data/markup.ts`, derived from `VIEWS` and `ENV_PREFIX` beside the ones already there. (AC: 7)
- Call it from `handleMessageDisplay` in `src/hook/runner.ts` and return null when it yields, once per process and before any rendering. Leave `renderView`, `traceView`, `slice` and the pipeline untouched. (AC: 1, 2, 9)
- Add `src/platform/peers.test.ts` covering the newer peer, the lower peer, the gone path, the expired entry, the unreadable registry, the env var off, and the announce-before-answer order. (AC: 3, 4, 5, 6, 7, 8)
- Add an end-to-end case in `tests/` driving two versions through `handleMessageDisplay`: the older yields with the newer announced, and draws once it is alone. (AC: 1, 2)
- Rewrite the "Two engines can draw the same message" entry in `docs/caveats.md`: the chaining is unchanged, which one consumes is not. (AC: 1)
- Note in `docs/contributing/manual-checks.md` that a consumer needs one publish and one bump to receive this, and that it is the last time that chain is needed for this reason. (AC: 1)

## done-when

```yaml
# The new module's own contract: who is newer, whose path is gone, what expired, what is unreadable.
- id: peers-tests
  verify: pnpm vitest run src/platform/peers.test.ts
  pass-if: exit == 0
# The seam itself: the edge yields with a newer peer registered and draws without one.
- id: runner-tests
  verify: pnpm vitest run src/hook/runner.test.ts
  pass-if: exit == 0
# A new module arrives and must answer for itself.
- id: sidecars
  verify: pnpm check:sidecars
  pass-if: exit == 0
# The no-regression floor: one engine alone renders exactly as it does today.
- id: suite-green
  verify: pnpm test
  pass-if: exit == 0
# The env var and the directory name are language, so they come from src/data/.
- id: vocabulary
  verify: pnpm check:vocabulary
  pass-if: exit == 0
- id: typecheck
  verify: pnpm typecheck
  pass-if: exit == 0
- id: lint
  verify: pnpm lint
  pass-if: exit == 0
# Gates the tarball: the packaged binary must still draw when it is the only engine on the machine.
- id: pack-renders
  verify: pnpm verify:pack
  pass-if: exit == 0
```
