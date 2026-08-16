// The SessionStart hook, from the file an install actually copies. A suite for a PATH rather than for a
// module, so it lives here: hooks/steering.mjs is not under src/, has no build behind it, and is reached
// by Claude Code alone.
//
// It catches a DELIVERY failure, which no other gate sees. Every way of getting the one contract wrong
// (`hookSpecificOutput.additionalContext` on stdout) is SILENT: the file moves and the hook says nothing,
// the contributor's note rides into the context, a missing file takes the session start with it.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { steeringPayload, pluginRoot } from "../../hooks/steering.mjs";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const EVENT = "SessionStart";
const OPT_OUT_ENV = "CC_VIEWS_STEERING";
const PROJECT_DIR_ENV = "CLAUDE_PROJECT_DIR";
const NO_MERMAID_ENV = "CC_VIEWS_NO_MERMAID";
const PKG_PATH = ["node_modules", "@tayomi", "cc-views"];
const AGENT_DIR = "agent";
const STEERING_FILE = "steering.md";
const PLUGIN_DIR = ".claude-plugin";
const PLUGIN_MANIFEST = "plugin.json";
const MANIFEST = "package.json";
/** Nothing this package ships, so a text carrying it can only have come from the install below. */
const INSTALLED_TEXT = "Draw only what the installed engine resolves.";
/** A view name the shipped copy teaches, which is how a briefing is told from the install's. */
const OWN_TEXT = "@{view:columns}";

/** An install of the engine under `dir`, shipping `text`, or shipping no steering file at all when null. */
function installEngine(dir: string, text: string | null): void {
  const installed = path.join(dir, ...PKG_PATH);
  fs.mkdirSync(text === null ? installed : path.join(installed, AGENT_DIR), { recursive: true });
  if (text !== null) fs.writeFileSync(path.join(installed, AGENT_DIR, STEERING_FILE), text);
}

/** A project with the engine installed `depth` directories ABOVE the one the session opened. */
function projectWithEngine(depth: number, text: string | null = INSTALLED_TEXT): { root: string; opened: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-install-"));
  installEngine(root, text);
  const opened = path.join(root, ...Array<string>(depth).fill("pkg"));
  fs.mkdirSync(opened, { recursive: true });
  return { root, opened };
}

/** The payload parsed, which is also the assertion that one was emitted at all. */
const injected = async (
  root: string,
  env?: NodeJS.ProcessEnv,
): Promise<{ hookEventName: string; additionalContext: string }> => {
  const raw = await steeringPayload(root, env);
  expect(raw).not.toBeNull();
  return (JSON.parse(raw as string) as Record<string, never>)["hookSpecificOutput"];
};

/** The env a session would carry, reduced to the one variable under test. */
const withOptOut = (value: string): NodeJS.ProcessEnv => ({ [OPT_OUT_ENV]: value });

describe("the SessionStart hook the plugin ships", () => {
  it("answers from THIS repo, under the event name Claude Code injects on", async () => {
    // The root it resolves on its own, and not one a test made up: a hook that answered only for a path
    // handed to it would pass here and find nothing in the copy an install runs it from.
    expect(pluginRoot()).toBe(REPO);
    expect((await injected(pluginRoot())).hookEventName).toBe(EVENT);
  });

  it("carries the words a session needs, and NOT the note addressed to whoever edits the file", async () => {
    // The note opens the file, so it would ride at the head of every session's context: the one place a
    // reader would take "written for an agent, gated by check-steering" as an instruction to follow.
    const { additionalContext } = await injected(pluginRoot());
    expect(additionalContext).toContain("@{view:columns}");
    expect(additionalContext).not.toContain("<!--");
    expect(additionalContext).not.toContain("check-steering");
    expect(additionalContext.startsWith("Draw")).toBe(true);
  });

  it("says nothing at all once the opt-out is set, whichever way a reader spells no", async () => {
    // An install whose own views are the ones to reach for: the skill stays, the briefing goes. Every spelling is
    // pinned rather than one, since a value that quietly kept injecting would look exactly like a working opt-out.
    for (const value of ["off", "0", "false", "no", "OFF", " off "]) {
      await expect(steeringPayload(pluginRoot(), withOptOut(value))).resolves.toBeNull();
    }
  });

  it("keeps the text for any other value, `on` first of all, which must never read as off", async () => {
    for (const value of ["on", "1", "true", "", "yes"]) {
      await expect(steeringPayload(pluginRoot(), withOptOut(value))).resolves.not.toBeNull();
    }
  });

  it("reads the INSTALLED engine's copy rather than the one it ships itself", async () => {
    // The desync this ends: a plugin updates on its own track, so its own text names views the engine beside it may
    // never have heard of. The install's copy is the only one that answers for what will actually draw.
    const { root, opened } = projectWithEngine(0);
    try {
      const env = { [PROJECT_DIR_ENV]: opened };
      expect((await steeringPayload(pluginRoot(), env))?.includes(INSTALLED_TEXT)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("finds an install hoisted to a workspace root, above the directory the session opened", async () => {
    const { root, opened } = projectWithEngine(2);
    try {
      const env = { [PROJECT_DIR_ENV]: opened };
      expect((await steeringPayload(pluginRoot(), env))?.includes(INSTALLED_TEXT)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps its OWN copy where no install is in reach, a consumer holding the engine in its tree", async () => {
    // Silence would be the worse answer: that install draws perfectly, and only the briefing would be missing.
    const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-bare-"));
    try {
      const { additionalContext } = await injected(pluginRoot(), { [PROJECT_DIR_ENV]: nowhere });
      expect(additionalContext).toContain(OWN_TEXT);
      expect(additionalContext).not.toContain(INSTALLED_TEXT);
    } finally {
      fs.rmSync(nowhere, { recursive: true, force: true });
    }
  });

  it("keeps its OWN copy where the install is a version too old to ship the text", async () => {
    // The upgrade this makes safe: a plugin updates while the engine beside it stays on a version that predates the
    // file. Nothing to read there is not a reason to say nothing.
    const { root, opened } = projectWithEngine(0, null);
    try {
      const { additionalContext } = await injected(pluginRoot(), { [PROJECT_DIR_ENV]: opened });
      expect(additionalContext).toContain(OWN_TEXT);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("stops at the NEAREST install, never briefing off a farther one the session would not resolve", async () => {
    // A workspace pinning an old engine under a root that hoists a new one. Node resolves the near copy, so the far
    // one's text would name views the engine actually drawing has never held.
    const { root, opened } = projectWithEngine(2);
    installEngine(opened, null);
    try {
      const { additionalContext } = await injected(pluginRoot(), { [PROJECT_DIR_ENV]: opened });
      expect(additionalContext).toContain(OWN_TEXT);
      expect(additionalContext).not.toContain(INSTALLED_TEXT);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("says NOTHING rather than throwing when the copy arrived without the file", async () => {
    // The failure this makes safe: a hook that throws blocks the start of every session of every install.
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-steering-"));
    try {
      // The project named too, so no install anywhere can answer for the copy this is about.
      await expect(steeringPayload(empty, { [PROJECT_DIR_ENV]: empty })).resolves.toBeNull();
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("the version drift the hook reports", () => {
  /** The drift alone is on trial here, so the diagram notice is switched OFF rather than asserted around. */
  const DIAGRAM_OFF = { [NO_MERMAID_ENV]: "1" };

  /** A plugin copy saying `version`, standing in for the one Claude Code cached. */
  function pluginSaying(version: string | null): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-plugin-"));
    fs.mkdirSync(path.join(root, PLUGIN_DIR), { recursive: true });
    if (version !== null) {
      fs.writeFileSync(
        path.join(root, PLUGIN_DIR, PLUGIN_MANIFEST),
        JSON.stringify({ name: "cc-views", version }),
      );
    }
    return root;
  }

  /** An install saying `version`, beside the project the session opened. */
  function projectSaying(version: string | null): string {
    const opened = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-proj-"));
    installEngine(opened, INSTALLED_TEXT);
    if (version !== null) {
      fs.writeFileSync(
        path.join(opened, ...PKG_PATH, MANIFEST),
        JSON.stringify({ name: "@tayomi/cc-views", version }),
      );
    }
    return opened;
  }

  /** A directory whose OWN manifest says `name`, an engine checkout at `PKG_NAME` and a plain consumer at anything else. */
  function checkoutOf(name: string, version: string): string {
    const opened = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-checkout-"));
    fs.writeFileSync(path.join(opened, MANIFEST), JSON.stringify({ name, version }));
    return opened;
  }

  /** The message shown to the USER, or null where the hook reports none. */
  async function warned(plugin: string | null, engine: string | null): Promise<string | null> {
    const root = pluginSaying(plugin);
    const opened = projectSaying(engine);
    try {
      const raw = await steeringPayload(root, { [PROJECT_DIR_ENV]: opened, ...DIAGRAM_OFF });
      const payload = JSON.parse(raw as string) as { systemMessage?: string };
      return payload.systemMessage ?? null;
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(opened, { recursive: true, force: true });
    }
  }

  it("names BOTH numbers when they differ, which is the whole point of reporting one", async () => {
    const message = await warned("1.0.29", "1.0.27");
    expect(message).toContain("1.0.29");
    expect(message).toContain("1.0.27");
  });

  it("says nothing where they agree, so a good install never carries a warning", async () => {
    expect(await warned("1.0.29", "1.0.29")).toBeNull();
  });

  it("counts the engine's OWN checkout, which installs nothing and is where a bump is made", async () => {
    // The session a contributor opens: the copy that draws is the working tree, so a bump landing with no
    // `plugin update` behind it is silent in the one repo where it was just typed.
    const root = pluginSaying("1.0.29");
    const opened = checkoutOf("@tayomi/cc-views", "1.0.30");
    try {
      const { systemMessage } = JSON.parse(
        (await steeringPayload(root, { [PROJECT_DIR_ENV]: opened, ...DIAGRAM_OFF })) as string,
      ) as { systemMessage: string };
      expect(systemMessage).toContain("1.0.29");
      expect(systemMessage).toContain("1.0.30");
      expect(systemMessage).toContain("plugin update");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(opened, { recursive: true, force: true });
    }
  });

  it("says nothing for a checkout of anything ELSE, which every consumer's own manifest is", async () => {
    // The near miss the walk must not take: a project has a package.json too, and its version names another package.
    const root = pluginSaying("1.0.29");
    const opened = checkoutOf("some-consumer", "9.9.9");
    try {
      await expect(steeringPayload(root, { [PROJECT_DIR_ENV]: opened })).resolves.toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(opened, { recursive: true, force: true });
    }
  });

  it("prefers the INSTALL over the checkout it sits in, the sandbox under this repo being one", async () => {
    // Both answer at the same hop, and the installed copy is the one node resolves, so it is the one that draws.
    const root = pluginSaying("1.0.29");
    const opened = projectSaying("1.0.27");
    fs.writeFileSync(path.join(opened, MANIFEST), JSON.stringify({ name: "@tayomi/cc-views", version: "1.0.30" }));
    try {
      const { systemMessage } = JSON.parse(
        (await steeringPayload(root, { [PROJECT_DIR_ENV]: opened, ...DIAGRAM_OFF })) as string,
      ) as { systemMessage: string };
      expect(systemMessage).toContain("1.0.27");
      expect(systemMessage).not.toContain("1.0.30");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(opened, { recursive: true, force: true });
    }
  });

  it("says nothing where either number is unreadable, a bundled engine being the normal case", async () => {
    expect(await warned(null, "1.0.27")).toBeNull();
    expect(await warned("1.0.29", null)).toBeNull();
  });

  it("DRAWS the notice with the installed engine, which a drift proves is there to draw it", async () => {
    // The bare sentence is the fallback and passes every other case here, so only a real dist tells the two apart.
    if (!fs.existsSync(path.join(REPO, "dist"))) throw new Error("this case needs a built dist: run pnpm build");
    const root = pluginSaying("1.0.29");
    const opened = projectSaying("1.0.27");
    try {
      fs.symlinkSync(path.join(REPO, "dist"), path.join(opened, ...PKG_PATH, "dist"), "dir");
      const payload = JSON.parse((await steeringPayload(root, { [PROJECT_DIR_ENV]: opened, ...DIAGRAM_OFF })) as string) as {
        systemMessage: string;
      };
      expect(payload.systemMessage).toContain("WARNING");
      expect(payload.systemMessage).not.toContain("@{");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(opened, { recursive: true, force: true });
    }
  });

  it("still brings the briefing along, the two answers riding one payload", async () => {
    const root = pluginSaying("1.0.29");
    const opened = projectSaying("1.0.27");
    try {
      const payload = JSON.parse((await steeringPayload(root, { [PROJECT_DIR_ENV]: opened, ...DIAGRAM_OFF })) as string) as {
        systemMessage?: string;
        hookSpecificOutput?: { additionalContext: string };
      };
      expect(payload.systemMessage).toBeTruthy();
      expect(payload.hookSpecificOutput?.additionalContext).toBe(INSTALLED_TEXT);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(opened, { recursive: true, force: true });
    }
  });
});

describe("the half of the briefing an install can turn off", () => {
  // The mermaid half, wrapped in markers so a session that has said no is never taught a view it does not want. There
  // is nothing left to probe: the renderer is a dependency of the engine, so an install that resolves the view draws
  // it, and the switch is the whole question.
  const NO_MERMAID_ENV = "CC_VIEWS_NO_MERMAID";
  const NEEDS_OPEN = "<!-- needs:diagram -->";
  const NEEDS_CLOSE = "<!-- /needs:diagram -->";
  const DIAGRAM_HALF = "the half the switch takes out";
  const ALWAYS = "the half that always holds";
  const MARKED = `${ALWAYS}\n\n${NEEDS_OPEN}\n${DIAGRAM_HALF}\n${NEEDS_CLOSE}\n\nand the rest`;

  /** Both halves of one answer: what the session reads, and what the user is shown. */
  async function answered(
    env: NodeJS.ProcessEnv = {},
  ): Promise<{ context: string; notice: string | null }> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-draws-"));
    installEngine(root, MARKED);
    try {
      const raw = await steeringPayload(pluginRoot(), { ...env, [PROJECT_DIR_ENV]: root });
      const payload = JSON.parse(raw as string) as {
        systemMessage?: string;
        hookSpecificOutput?: { additionalContext: string };
      };
      return { context: payload.hookSpecificOutput?.additionalContext ?? "", notice: payload.systemMessage ?? null };
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  it("keeps it by default, and says nothing at all", async () => {
    const { context, notice } = await answered();
    expect(context).toContain(DIAGRAM_HALF);
    expect(notice).toBeNull();
  });

  it("drops it and stays QUIET once the switch is set", async () => {
    // Someone who has said no is owed neither the view nor a word about it.
    const { context, notice } = await answered({ [NO_MERMAID_ENV]: "1" });
    expect(context).toContain(ALWAYS);
    expect(context).not.toContain(DIAGRAM_HALF);
    expect(notice).toBeNull();
  });

  it("takes the MARKERS out either way, machinery being no part of a briefing", async () => {
    for (const env of [{}, { [NO_MERMAID_ENV]: "1" }]) {
      const { context } = await answered(env);
      expect(context).not.toContain(NEEDS_OPEN);
      expect(context).not.toContain(NEEDS_CLOSE);
    }
  });
});
