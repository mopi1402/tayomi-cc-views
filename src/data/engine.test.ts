// The gate on a number that is spelled twice: here and in package.json. It lives in this sidecar and NOWHERE else, the
// same rule read by two scripts being the drift it exists to stop (scripts/sync-version.mjs).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { ENGINE_NAME, ENGINE_VERSION, engineBadge } from "./engine.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
  name: string;
  version: string;
};

describe("the engine's identity", () => {
  it("is the package's own, or a render signs a version nobody shipped", () => {
    expect(ENGINE_NAME).toBe(pkg.name);
    expect(ENGINE_VERSION).toBe(pkg.version);
  });

  it("shows as one badge, the form a reader compares by eye", () => {
    expect(engineBadge()).toBe(`${pkg.name} v${pkg.version}`);
  });
});
