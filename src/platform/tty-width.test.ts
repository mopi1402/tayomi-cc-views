// Where a render's width comes from, resolved ONCE and handed down as a value.
//
// The resolution ORDER is the contract: an explicit number outranks the operator's env
// var, which outranks any probing. That order is what lets a render oracle pin a width
// so a verdict never depends on the window the suite ran in, and it is asserted here
// rather than trusted, because every layer below takes the answer on faith.
//
// What the probe ANSWERS is deliberately not asserted: it shells out to `ps` and walks
// the process tree, so the number is the machine's and not a fact a test can state.
// What IS asserted is every rule around it, through the options.width FUNCTION, the
// seam that stands in for the probe.

import { describe, it, expect, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WIDTH_ENV } from "../data/markup.js";
import { maxBoxWidth } from "./tty-width.js";

// The bounds tty-width.ts keeps private, restated here as the numbers a caller can
// actually observe: a width outside them comes back clamped, never as it was asked.
const MIN_WIDTH = 40;
const MAX_FORCED = 400;
const MAX_PROBED = 180;
const TTY_MARGIN = 4;

const ORDINARY = 72;
const dirs: string[] = [];
const stateDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-width-"));
  dirs.push(dir);
  return dir;
};
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

/** No probe may ever run: a null source still falls through, so give it a real one. */
const source = (cols: number | null) => ({ width: () => cols, stateDir: stateDir() });

const clearEnv = (): void => {
  delete process.env[WIDTH_ENV];
};
beforeEach(clearEnv);
afterAll(clearEnv);

describe("an explicit number", () => {
  it("wins outright: it is a ceiling written in code", () => {
    process.env[WIDTH_ENV] = "999";
    expect(maxBoxWidth({ width: ORDINARY })).toBe(ORDINARY);
  });

  it("is taken as it is, with no terminal margin removed from it", () => {
    expect(maxBoxWidth({ width: ORDINARY })).toBe(ORDINARY);
  });

  it("is clamped up to the minimum, so a box is never too narrow to draw", () => {
    expect(maxBoxWidth({ width: 1 })).toBe(MIN_WIDTH);
  });

  it("is clamped down to the forced ceiling", () => {
    expect(maxBoxWidth({ width: 10_000 })).toBe(MAX_FORCED);
  });
});

describe("the operator's env var", () => {
  it("is used when no number was written in code", () => {
    process.env[WIDTH_ENV] = String(ORDINARY);
    expect(maxBoxWidth()).toBe(ORDINARY);
  });

  it("is clamped by the same bounds as an explicit number", () => {
    process.env[WIDTH_ENV] = "1";
    expect(maxBoxWidth()).toBe(MIN_WIDTH);
  });

  it("is read from the name the caller names, so a host may keep its own", () => {
    const OWN = "SOME_HOST_WIDTH";
    process.env[OWN] = String(ORDINARY);
    try {
      expect(maxBoxWidth({ widthEnv: OWN })).toBe(ORDINARY);
    } finally {
      delete process.env[OWN];
    }
  });

  it("falls through when it is not a usable number", () => {
    for (const bad of ["", "wide", "0", "-5"]) {
      process.env[WIDTH_ENV] = bad;
      expect(maxBoxWidth(source(ORDINARY))).toBe(ORDINARY - TTY_MARGIN);
    }
  });

  it("outranks a width SOURCE, which stands in for the probe rather than for a ceiling", () => {
    process.env[WIDTH_ENV] = String(ORDINARY);
    expect(maxBoxWidth(source(999))).toBe(ORDINARY);
  });
});

describe("a width source", () => {
  it("is treated exactly like probed columns: a margin comes off it", () => {
    expect(maxBoxWidth(source(ORDINARY))).toBe(ORDINARY - TTY_MARGIN);
  });

  it("is clamped down to the probed ceiling, narrower than the forced one", () => {
    expect(maxBoxWidth(source(10_000))).toBe(MAX_PROBED);
  });

  it("is clamped up to the minimum, margin or no margin", () => {
    expect(maxBoxWidth(source(MIN_WIDTH))).toBe(MIN_WIDTH);
  });

  it("falls THROUGH to the probe when it yields nothing, rather than short-circuiting", () => {
    // The probe's answer is the machine's, so what is stated is that both paths agree.
    expect(maxBoxWidth(source(null))).toBe(maxBoxWidth({ stateDir: stateDir() }));
  });

  it("falls through rather than throwing when it fails, like the probe it replaces", () => {
    const throwing = {
      width: () => {
        throw new Error("no tty");
      },
      stateDir: stateDir(),
    };
    expect(maxBoxWidth(throwing)).toBe(maxBoxWidth({ stateDir: stateDir() }));
  });
});

describe("whatever the machine answers", () => {
  it("stays inside the probed bounds, terminal or no terminal", () => {
    const w = maxBoxWidth({ stateDir: stateDir() });
    expect(w).toBeGreaterThanOrEqual(MIN_WIDTH);
    expect(w).toBeLessThanOrEqual(MAX_PROBED);
  });
});
