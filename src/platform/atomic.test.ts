// What the atomic write owes its two writers: the target appears whole, parents included, and the intermediate never
// survives, because a register directory is LISTED by its readers and a lingering .part would be read as a claim.

import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeAtomic } from "./atomic.js";

const BODY = "whole";
const AGAIN = "rewritten";

const dirs: string[] = [];
const mkdir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-atomic-"));
  dirs.push(dir);
  return dir;
};
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe("writeAtomic", () => {
  it("writes the body whole, making the parents on the way", () => {
    const target = path.join(mkdir(), "deep", "er", "entry");
    writeAtomic(target, BODY);
    expect(fs.readFileSync(target, "utf8")).toBe(BODY);
  });

  it("leaves NO intermediate beside the target, which its readers would list as an entry", () => {
    const dir = mkdir();
    writeAtomic(path.join(dir, "entry"), BODY);
    expect(fs.readdirSync(dir)).toEqual(["entry"]);
  });

  it("replaces an existing target, the rewrite every announce is", () => {
    const target = path.join(mkdir(), "entry");
    writeAtomic(target, BODY);
    writeAtomic(target, AGAIN);
    expect(fs.readFileSync(target, "utf8")).toBe(AGAIN);
  });
});
