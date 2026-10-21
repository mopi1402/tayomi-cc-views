import { describe, it, expect } from "vitest";
import { ENTRYPOINT_ENV, drawsAnsi } from "./surface.js";

const launchedBy = (entrypoint: string): NodeJS.ProcessEnv => ({ [ENTRYPOINT_ENV]: entrypoint });

describe("drawsAnsi", () => {
  it.each(["claude-desktop", "claude-desktop-3p", "local-agent"])("is false under the desktop app (%s)", (name) => {
    expect(drawsAnsi(launchedBy(name))).toBe(false);
  });

  it("is true in the terminal", () => {
    expect(drawsAnsi(launchedBy("cli"))).toBe(true);
  });

  it("is true with no entrypoint at all, so a host launching the hook itself keeps its render", () => {
    expect(drawsAnsi({})).toBe(true);
  });

  it("is true for a name only NEAR a desktop one", () => {
    expect(drawsAnsi(launchedBy("claude-desktop-beta"))).toBe(true);
    expect(drawsAnsi(launchedBy("Claude-Desktop"))).toBe(true);
  });
});
