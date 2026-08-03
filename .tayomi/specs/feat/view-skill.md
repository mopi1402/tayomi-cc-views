## target

Ship `write-view`, the skill that turns a sentence into a working `.view`, from THIS repo, distributed through the plugin and marketplace manifests the ecosystem already reads. Writing a template by hand is the adoption wall named in ROADMAP.md: the language is small but strict in ways a human trips on (directives at column 0, body whitespace is content), and nothing today walks an agent from "I want a deploy report with a title and status chips" to a file the resolution order will find. The reference half already exists and is what makes this cheap: `agent/catalogue.json` states the language generated from the tables the engine executes, `cc-views dict` states what THIS install resolves, and `cc-views check` states whether what was just written draws. The skill spends those three and restates none of them, which is the only way it cannot drift from the engine it describes.

## non-goals

- The skill restates no grammar, no directive list and no tag list: anything a reader needs about the language is read from `agent/catalogue.json` or from `cc-views dict`, and a second telling here is exactly the drift this package spent two contracts removing.
- No engine change and no new language surface: this contract adds a document, two manifests and the gate that keeps them honest.
- No install command of our own: `/plugin marketplace add` and `npx skills add` already carry a skill from a git repo into where an agent discovers it, and a third mechanism here would be one more thing to keep in step for no reader.
- The skill does NOT ride in the npm tarball. `docs/CHEATSHEET.md` ships because it is the one doc an agent resolves BY PATH through `node_modules`; a skill is discovered by convention instead, so a copy under `node_modules` is discovered by nothing and would be weight with no reader.
- The skill is not a second checker: it tells the agent to run `cc-views check` and to act on the verdict, and it never re-implements the judgement.
- No skill for anything but writing a view: the engine's other commands are documented where they already are.

## hard-constraints

- The skill is `skills/write-view/SKILL.md`, frontmatter carrying `name` and `description`, the description written as the TRIGGER (when to reach for it), which is what a model reads to decide whether it applies.
- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` sit at the repo root and name this repo as the plugin's source, so a human installs with `/plugin marketplace add` and never by copying files.
- The manifests change nothing the tarball carries: what npm delivers is decided by the package `files` alone, and this contract does not touch it.
- Every directive and every tag name the skill spells is one the catalogue carries, checked by a gate rather than by a reader.
- The skill names the LIVE reference and never a copy of it: the words come from `cc-views dict` and the verdict from `cc-views check`.

## acceptance

1. Given the repo, When the gate reads the manifests, Then both parse, they name a plugin sourced from this repo, and `skills/write-view/SKILL.md` exists carrying a `name` and a `description` in its frontmatter.
2. Given the skill's text, When the gate runs, Then every `@word` and every `{{tag}}` it spells is one `agent/catalogue.json` carries, and a word the language does not define fails the gate.
3. Given the skill's text, When the gate runs, Then it names `cc-views dict` and `cc-views check`, since a skill that stopped pointing at the live reference has become the second telling this contract exists to prevent.
4. Given the packed tarball, When its listing is read, Then it carries no `skills/` entry, `docs/CHEATSHEET.md` remaining the one doc that rides to an agent through `node_modules`.
5. Given a fresh reader of `README.md`, When they look for the skill, Then both install routes are named, and so is the command that tells them whether the view they wrote actually draws.

## tasks

- Add `skills/write-view/SKILL.md`: the trigger-shaped frontmatter, the path from a sentence to a template, the carrier line the agent then writes, where the file goes for the resolution order to find it, and the instruction to verify with `cc-views check` and act on its verdict. (AC: 1, 2, 3)
- Add `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, naming this repo as the plugin source so the skill installs from git. (AC: 1)
- Add `scripts/check-skill.mjs`: the manifests parse and resolve to a skill with its frontmatter, every word the skill spells exists in `agent/catalogue.json`, the live reference is named, and the README carries both install routes. Chain it into `pnpm verify`. (AC: 1, 2, 3, 5)
- Assert in `scripts/verify-pack.mjs` that no `skills/` entry rides in the tarball, beside the bans already written there per entry. (AC: 4)
- Point `README.md` and `docs/CHEATSHEET.md` at the skill and at the two install routes, beside the `dict` and `check` lines already there. (AC: 5)

## done-when

```yaml
# Bites on ABSENCE today, and afterwards it is what stops the skill drifting from the engine and from its own delivery: the manifests resolve, every word it spells is read back against the generated catalogue, and the pointers to the live reference are still there.
- id: skill-gate
  verify: node scripts/check-skill.mjs
  pass-if: exit == 0
# TWO things, because `pnpm verify:pack` alone passes today and would prove nothing: the skill exists in the tree, and the tarball still refuses to carry it. It is the only check that runs against what npm would actually deliver.
- id: skill-not-packed
  verify: node -e "require('node:fs').accessSync('skills/write-view/SKILL.md')" && pnpm verify:pack
  pass-if: exit == 0
```

## clarifications

- Placement, decided by the human on 2026-08-03: the skill lives in THIS repo rather than in the TAYOMI plugin or a separate project, so the document that teaches the language ships and versions with the engine that defines it.
- Delivery, decided on 2026-08-03 and REVERSING the same day's earlier decision: the human handed over kepano/obsidian-skills, where a repo carries `.claude-plugin/plugin.json` and `marketplace.json` and installs with `/plugin marketplace add` or `npx skills add`. The earlier plan, a `cc-views skill` command copying the file into `.claude/skills/`, was written without knowing that mechanism existed: it would have been a module, a sidecar and a CLI dispatch reimplementing what the ecosystem already carries.
- Out of the tarball, decided on 2026-08-03: `verify-pack.mjs` ships `docs/CHEATSHEET.md` as the ONE documentation exception because an agent resolves it BY PATH through `node_modules`. A skill is discovered by convention and never by path, so the same reasoning that lets the cheatsheet in keeps the skill out.
- The skill spends the catalogue rather than repeating it, decided on 2026-08-03: the same rule the engine holds itself to. A skill restating the grammar would be a second telling free to be complete and wrong, which is what `agent/catalogue.json` and `cc-views dict` were built to remove.
