// The one place on disk this subsystem writes, and the one property that matters:
// TOTALITY. Both things it holds are caches rather than records, so a failure costs a
// re-probe or a message rendered from scratch. A throw here would reach a display hook,
// where the price is the screen.

import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SCRATCH_DIR } from "../data/markup.js";
import { DEFAULT_STATE_DIR, writeScratch } from "./scratch.js";

const CONTENT = "cached";
const dirs: string[] = [];
const tmp = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-scratch-"));
  dirs.push(dir);
  return dir;
};
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe("writeScratch", () => {
  it("writes the file", () => {
    const file = path.join(tmp(), "cache.json");
    writeScratch(file, CONTENT);
    expect(fs.readFileSync(file, "utf8")).toBe(CONTENT);
  });

  it("creates the directories on the way, however deep", () => {
    const file = path.join(tmp(), "a", "b", "c", "cache.json");
    writeScratch(file, CONTENT);
    expect(fs.readFileSync(file, "utf8")).toBe(CONTENT);
  });

  it("overwrites, since what it holds is a cache and never a record", () => {
    const file = path.join(tmp(), "cache.json");
    writeScratch(file, "stale");
    writeScratch(file, CONTENT);
    expect(fs.readFileSync(file, "utf8")).toBe(CONTENT);
  });

  it("swallows a write it cannot make, rather than reaching a display hook", () => {
    const blocked = path.join(tmp(), "file");
    fs.writeFileSync(blocked, "a file, not a directory");
    // The parent of the target is a FILE, so mkdirSync cannot make the path.
    expect(() => writeScratch(path.join(blocked, "cache.json"), CONTENT)).not.toThrow();
  });
});

describe("the default state dir", () => {
  it("sits under the machine's temp dir, named for the package", () => {
    expect(DEFAULT_STATE_DIR).toBe(path.join(os.tmpdir(), SCRATCH_DIR));
  });
});
