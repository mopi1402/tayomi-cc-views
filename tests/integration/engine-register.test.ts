// Which engine DRAWS when two are installed, end to end: a real bundled template, through the real hook edge, with the
// machine's engine register the only thing that differs between the two runs. A suite for a PATH, so it lives here.
//
// It exists because the unit cases prove the RULE and cannot prove the seam: the register is consulted by one line in
// runner.ts, and a refactor that dropped that line would leave every peers.test.ts case green while the older engine
// went back to drawing over the newer one on screen.

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleMessageDisplay } from "../../src/hook/runner.js";
import { announce, peersDir } from "../../src/platform/peers.js";
import { ENGINE_VERSION } from "../../src/data/engine.js";
import { SCRATCH_DIR } from "../../src/data/markup.js";
import { ANSI_RE } from "../../src/style.js";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUNDLED = path.join(REPO, "views");

/** The register and the message state both live under the temp dir, and neither may be the machine's own. */
const home = fs.mkdtempSync(path.join(os.tmpdir(), `${SCRATCH_DIR}-register-`));
const stateDir = path.join(home, "state");
const options = { viewsPath: [BUNDLED], width: 60, stateDir };

/** Derived from the running engine, so a version bump can never turn the newer peer into an older one. */
const NEWER = `${Number(ENGINE_VERSION.split(".")[0]) + 1}.0.0`;

const SENTENCE = "la ligne que tu aurais ecrite de toute facon";
/** A view BOTH engines have, which is the only kind a stand-aside applies to. */
const SHARED = "quote";
const MESSAGE = [`@{view:${SHARED}, tone:gold}`, `> ${SENTENCE}`].join("\n");

/** Another engine on the machine, real file behind it, declaring the views it can draw. */
function otherEngine(version: string, views: string[]): string {
  const at = path.join(home, `engine-${version}-${n}.js`);
  fs.writeFileSync(at, "", "utf8");
  announce(peersDir(), { path: at, version, views });
  return at;
}

const newerThan = (...views: string[]): string => otherEngine(NEWER, views);

let n = 0;
const flush = async (): Promise<string | null> =>
  handleMessageDisplay(
    { message_id: `register-${process.pid}-${n++}`, index: 0, delta: MESSAGE, final: true },
    undefined,
    options
  );

const drawn = (envelope: string | null): string =>
  envelope === null
    ? ""
    : (JSON.parse(envelope) as { hookSpecificOutput: { displayContent: string } })
        .hookSpecificOutput.displayContent.replace(ANSI_RE, "");

beforeEach(() => {
  fs.rmSync(path.join(home, SCRATCH_DIR), { recursive: true, force: true });
  vi.stubEnv("TMPDIR", home);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

describe("two engines, one screen", () => {
  it("draws the view where this engine is the only one registered", async () => {
    const out = drawn(await flush());
    expect(out).toContain(SENTENCE);
    // The decorator itself is CONSUMED, which is what proves a render happened rather than the raw text passing.
    expect(out).not.toContain("@{view:");
  });

  it("leaves the zone whose view a NEWER engine ALSO has, exactly as written", async () => {
    newerThan(SHARED);
    // Not rewritten at all: the decorator and its payload reach the next hook in the chain character for character, and
    // the newer engine is the one that consumes them.
    expect(drawn(await flush())).toBe(MESSAGE);
  });

  // The case the per-message stand-down used to lose, and the reason the decision is per zone: an engine that went
  // silent for the whole message took this second zone down with it, and nobody else had the view to draw it.
  it("still draws, in that same message, the view the newer engine does NOT have", async () => {
    newerThan(SHARED);
    const out = drawn(
      await handleMessageDisplay(
        {
          message_id: `mixed-${process.pid}-${n++}`,
          index: 0,
          delta: [MESSAGE, "", "@{view:welcome}"].join("\n"),
          final: true,
        },
        undefined,
        options
      )
    );
    // Theirs is left alone...
    expect(out).toContain(`@{view:${SHARED}, tone:gold}`);
    // ...and ours is drawn in the very same flush.
    expect(out).toContain("Welcome!");
  });

  it("draws a view they BOTH have when the other engine is OLDER", async () => {
    otherEngine("0.0.1", [SHARED]);
    expect(drawn(await flush())).toContain(SENTENCE);
  });

  it("goes back to drawing the moment that engine is gone", async () => {
    const at = newerThan(SHARED);
    expect(drawn(await flush())).toBe(MESSAGE);
    fs.rmSync(at);
    expect(drawn(await flush())).toContain(SENTENCE);
  });
});
