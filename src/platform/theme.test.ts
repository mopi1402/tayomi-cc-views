// The resolution ORDER, and every way a source declines to answer. The near-misses carry this suite: each source is
// reached only when the ones above it fall through, so a test feeding valid input alone cannot tell a working chain
// apart from one whose first source swallows everything.

import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { THEME_ENV } from "../data/markup.js";
import {
  DEFAULT_THEME,
  THEMES,
  activeTheme,
  counterpart,
  isLight,
  slotIsDark,
  type Theme,
} from "./theme.js";

const CONFIG_DIR_ENV = "CLAUDE_CONFIG_DIR";
const SETTINGS_FILE = "settings.json";
const BACKGROUND_ENV = "COLORFGBG";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

/** A host config dir carrying exactly `body`, or none at all where `body` is null. */
function configDir(body: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-theme-"));
  dirs.push(dir);
  if (body !== null) fs.writeFileSync(path.join(dir, SETTINGS_FILE), body);
  return dir;
}

const settings = (theme: string): string => JSON.stringify({ theme });

/**
 * An env with NO host config to find, so a source under test is the only one that can answer. Without this the
 * developer's own `~/.claude/settings.json` would reach in and decide half of these cases.
 */
const env = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  [CONFIG_DIR_ENV]: configDir(null),
  ...extra,
});

describe("the theme a view's code span follows", () => {
  it("takes this engine's own env var above everything else", () => {
    const forced: Theme = "light-daltonized";
    const resolved = activeTheme(
      env({
        [THEME_ENV]: forced,
        [CONFIG_DIR_ENV]: configDir(settings("dark-ansi")),
        [BACKGROUND_ENV]: "0;15",
      }),
    );
    expect(resolved).toBe(forced);
  });

  it("takes the theme the host's config NAMES when no env var forces one", () => {
    const chosen: Theme = "light";
    expect(activeTheme(env({ [CONFIG_DIR_ENV]: configDir(settings(chosen)) }))).toBe(chosen);
  });

  it("reads the terminal's declared background only once the config has declined", () => {
    // `auto` is what a host writes when it means "ask the terminal", and it is the case that made this module: it must
    // fall THROUGH rather than resolve, or the source below is never reached.
    const auto = configDir(settings("auto"));
    expect(activeTheme({ [CONFIG_DIR_ENV]: auto, [BACKGROUND_ENV]: "0;15" })).toBe("light");
    expect(activeTheme({ [CONFIG_DIR_ENV]: auto, [BACKGROUND_ENV]: "15;0" })).toBe("dark");
  });

  it("falls back to what the host itself falls back to when nothing answers", () => {
    expect(activeTheme(env())).toBe(DEFAULT_THEME);
  });

  it("answers with a theme this version knows, whatever it was handed", () => {
    for (const theme of THEMES) {
      expect(activeTheme(env({ [THEME_ENV]: theme }))).toBe(theme);
    }
  });
});

describe("a source that declines rather than guesses", () => {
  it("ignores an env var naming no theme this version knows", () => {
    expect(activeTheme(env({ [THEME_ENV]: "solarized" }))).toBe(DEFAULT_THEME);
    expect(activeTheme(env({ [THEME_ENV]: "" }))).toBe(DEFAULT_THEME);
  });

  it("ignores a config naming no theme this version knows", () => {
    expect(activeTheme({ [CONFIG_DIR_ENV]: configDir(settings("solarized")) })).toBe(DEFAULT_THEME);
  });

  it("survives a config that is absent, unreadable or half written", () => {
    expect(activeTheme({ [CONFIG_DIR_ENV]: configDir(null) })).toBe(DEFAULT_THEME);
    expect(activeTheme({ [CONFIG_DIR_ENV]: configDir("{ not json") })).toBe(DEFAULT_THEME);
    expect(activeTheme({ [CONFIG_DIR_ENV]: configDir("null") })).toBe(DEFAULT_THEME);
    expect(
      activeTheme({
        [CONFIG_DIR_ENV]: path.join(os.tmpdir(), "cc-views-absent-dir"),
      }),
    ).toBe(DEFAULT_THEME);
  });

  it("ignores a background slot outside the base-sixteen range, or no number at all", () => {
    // Nothing sits below this source but the fallback, so a decline here can only be READ as the fallback. What the
    // cases still pin is that none of them resolves the other way, which is what a bare `Number("")` would do.
    for (const declared of ["0;16", "0;-1", "0;", "", "0;white"]) {
      expect(activeTheme(env({ [BACKGROUND_ENV]: declared }))).toBe(DEFAULT_THEME);
    }
  });

  it("reads the LAST field, which is the background wherever the terminal puts it", () => {
    // `fg;bg` and `fg;default;bg` are both written in the wild, and a lone field is still the last one.
    expect(activeTheme(env({ [BACKGROUND_ENV]: "0;default;15" }))).toBe("light");
    expect(activeTheme(env({ [BACKGROUND_ENV]: "15" }))).toBe("light");
  });

  it("calls the dark half of the base-sixteen palette dark, its grey included", () => {
    const dark = [0, 1, 2, 3, 4, 5, 6, 8];
    for (let slot = 0; slot <= 15; slot++) {
      expect(activeTheme(env({ [BACKGROUND_ENV]: `15;${slot}` }))).toBe(dark.includes(slot) ? "dark" : "light");
    }
  });
});

// What a colour drawn on a surface has to ask, once it stops asking about the terminal. The sweeps read THEMES rather
// than a list of their own: a seventh theme must fail here, not pass by being unmentioned.
describe("the side a theme is on, and the theme on the other side", () => {
  it("puts every theme on exactly one side", () => {
    const light = THEMES.filter(isLight);
    expect(light.length + THEMES.filter((t) => !isLight(t)).length).toBe(THEMES.length);
    // Both sides are populated, or a "side" is a word for nothing and every pairing below is trivially satisfied.
    expect(light.length).toBeGreaterThan(0);
    expect(light.length).toBeLessThan(THEMES.length);
  });

  it("crosses the side and comes back, whatever it was handed", () => {
    for (const theme of THEMES) {
      expect(isLight(counterpart(theme))).toBe(!isLight(theme));
      expect(counterpart(counterpart(theme))).toBe(theme);
    }
  });

  it("keeps the VARIANT, which is the whole reason it is a pairing and not two fixed names", () => {
    // An ansi or daltonized reader went out of their way not to be shown the other palette, and a band is no place to
    // hand it to them anyway.
    expect(counterpart("light")).toBe("dark");
    expect(counterpart("light-ansi")).toBe("dark-ansi");
    expect(counterpart("light-daltonized")).toBe("dark-daltonized");
  });

  it("reads a base-sixteen slot the way the host reads it, grey and boundary included", () => {
    // The sweep above proves the WHOLE range through COLORFGBG; what this pins is the exported predicate's own edges,
    // now that a chip's ink is read through it and never reaches that path.
    expect([slotIsDark(6), slotIsDark(7), slotIsDark(8), slotIsDark(9)]).toEqual([true, false, true, false]);
  });
});
