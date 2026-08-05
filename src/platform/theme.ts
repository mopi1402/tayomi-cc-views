// Which theme Claude Code is drawing in, which this process cannot see. It matters to the two things this engine draws
// with no colour of their own: an inline code span, which the host resolves through its `permission` palette slot
// (different pixels under each of the six themes), and the neutral pill, a SURFACE that has to turn over with the
// terminal.
//
// Claude Code itself answers `kln ?? COLORFGBG ?? "dark"`, where `kln` is the terminal background it read over OSC 11 at
// startup. That first source is out of reach: it lives in the host's memory, never on disk (probed 2026-08-04), and
// re-asking the terminal means writing the query onto the tty the host reads in raw mode, where the answer lands in
// whichever of the two reads first. So the sources below are the DELIBERATE ones, plus the host's own last two.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { THEME_ENV } from "../data/markup.js";

/** Every theme Claude Code ships. `auto` is deliberately absent: it names a DETECTION, never a palette. */
export const THEMES = ["light", "light-ansi", "light-daltonized", "dark", "dark-ansi", "dark-daltonized"] as const;

export type Theme = (typeof THEMES)[number];

/** What the host itself falls back to, so an engine that knows nothing draws what the host draws. */
export const DEFAULT_THEME: Theme = "dark";

// Every name the host ships is a SIDE, then a variant. The side is the only part of a name this engine reasons about,
// and deriving it rather than listing the light ones is what keeps a seventh theme from needing an edit here.
const LIGHT_SIDE = "light";
const DARK_SIDE = "dark";
const SIDE_SEP = "-";

/** The two themes a background LUMINANCE can name: it separates light from dark and says nothing finer. */
const BY_BACKGROUND: Record<string, Theme> = { [LIGHT_SIDE]: LIGHT_SIDE, [DARK_SIDE]: DARK_SIDE };

export const isLight = (theme: Theme): boolean => theme.split(SIDE_SEP)[0] === LIGHT_SIDE;

/**
 * The same theme on the OTHER side, its variant kept: a colour drawn on a fill that opposes the terminal needs the
 * value the host would have used had the terminal been that way round. Tabled rather than spelled from the name, so the
 * type proves the pairing is total.
 */
const COUNTERPART: Record<Theme, Theme> = {
  light: "dark",
  "light-ansi": "dark-ansi",
  "light-daltonized": "dark-daltonized",
  dark: "light",
  "dark-ansi": "light-ansi",
  "dark-daltonized": "light-daltonized",
};

export const counterpart = (theme: Theme): Theme => COUNTERPART[theme];

// The host's own config, under the host's own names. Read and never written, and only for this one key.
const CONFIG_DIR_ENV = "CLAUDE_CONFIG_DIR";
const CONFIG_DIR = ".claude";
const SETTINGS_FILE = "settings.json";
const THEME_KEY = "theme";

// The background the TERMINAL declares, in the ancient `fg;bg` form. Claude Code reads the last field as a base-sixteen
// slot and calls 0..6 and 8 dark, which is that palette's own dark half plus its grey.
const BACKGROUND_ENV = "COLORFGBG";
const FIELD_SEP = ";";
const SLOT_FIRST = 0;
const SLOT_LAST = 15;
const DARK_SLOT_LAST = 6;
const DARK_SLOT_GREY = 8;

/**
 * Whether a base-sixteen SLOT is on the dark side, read exactly as the host reads it. Exported because the same
 * question is asked of an ink written as a slot, whose pixels belong to the theme and can never be measured.
 */
export const slotIsDark = (slot: number): boolean => slot <= DARK_SLOT_LAST || slot === DARK_SLOT_GREY;

const isTheme = (v: unknown): v is Theme => THEMES.includes(v as Theme);

/** A name only where it is one THIS version knows: an unknown word falls through to the next source, never to a guess. */
const named = (v: unknown): Theme | undefined => (isTheme(v) ? v : undefined);

function fromSettings(env: NodeJS.ProcessEnv): Theme | undefined {
  const dir = env[CONFIG_DIR_ENV] ?? path.join(os.homedir(), CONFIG_DIR);
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(dir, SETTINGS_FILE), "utf8");
  } catch {
    return undefined; // no host config, or none this process may read
  }
  try {
    const settings = JSON.parse(raw) as Record<string, unknown>;
    // `auto` arrives here like any other word and is not a theme name, so it falls through with no case of its own.
    return named(settings[THEME_KEY]);
  } catch {
    return undefined; // a half-written config is not a theme
  }
}

function fromBackground(env: NodeJS.ProcessEnv): Theme | undefined {
  const declared = env[BACKGROUND_ENV];
  if (declared === undefined) return undefined;
  const field = declared.split(FIELD_SEP).at(-1);
  // An EMPTY field is not a slot, and `Number("")` is zero: read as a number it would declare the darkest background
  // there is. The host guards the same case for the same reason.
  if (field === undefined || field === "") return undefined;
  const slot = Number(field);
  if (!Number.isInteger(slot) || slot < SLOT_FIRST || slot > SLOT_LAST) return undefined;
  return BY_BACKGROUND[slotIsDark(slot) ? DARK_SIDE : LIGHT_SIDE];
}

/**
 * The active theme, most deliberate source first: this engine's own env var, then the theme the host's config NAMES,
 * then the background the terminal declares, then the host's own fallback. Pure in its environment, so the whole chain
 * is drivable from a test without a process to spawn.
 */
export function activeTheme(env: NodeJS.ProcessEnv = process.env): Theme {
  return named(env[THEME_ENV]) ?? fromSettings(env) ?? fromBackground(env) ?? DEFAULT_THEME;
}
