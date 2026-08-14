// What the flight recorder owes: a line that carries its event and words, an append that never rewrites history, a
// rotation that keeps one previous generation instead of growing, and silence on any failure. The near-miss matters
// most here: a journal that can throw costs the render it exists to explain.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JOURNAL_CAP_BYTES, journal, journalPath } from "./journal.js";
import { SELF } from "./peers.js";
import { DEBUG_ENV } from "../data/markup.js";

function freshDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-journal-"));
}

// The recorder speaks only under the operator's flag: every case below runs with it raised, except the one
// proving the default silence.
beforeEach(() => {
  vi.stubEnv(DEBUG_ENV, "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the journal line", () => {
  it("records the event with its words, stamped by time, pid and engine version", () => {
    const dir = freshDir();
    journal("flush", { msg: "m1", role: "assembler", final: true }, dir);
    const body = fs.readFileSync(journalPath(dir), "utf8");
    expect(body).toContain("flush");
    expect(body).toContain("msg=m1");
    expect(body).toContain("role=assembler");
    expect(body).toContain("final=true");
    expect(body).toContain(`pid=${process.pid}`);
    expect(body).toContain(`v=${SELF.version}`);
  });

  it("appends: two events are two lines, in the order they happened", () => {
    const dir = freshDir();
    journal("first", {}, dir);
    journal("second", {}, dir);
    const lines = fs.readFileSync(journalPath(dir), "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("first");
    expect(lines[1]).toContain("second");
  });
});

describe("the cap", () => {
  it("rotates past the cap, keeping the previous generation whole", () => {
    const dir = freshDir();
    fs.mkdirSync(path.dirname(journalPath(dir)), { recursive: true });
    fs.writeFileSync(journalPath(dir), "x".repeat(JOURNAL_CAP_BYTES + 1), "utf8");
    journal("after-rotation", {}, dir);
    const kept = fs.readFileSync(path.join(path.dirname(journalPath(dir)), "log.1"), "utf8");
    expect(kept).toHaveLength(JOURNAL_CAP_BYTES + 1);
    const fresh = fs.readFileSync(journalPath(dir), "utf8");
    expect(fresh).toContain("after-rotation");
    expect(fresh.length).toBeLessThan(JOURNAL_CAP_BYTES);
  });
});

describe("the silence", () => {
  it("never throws where it cannot write, a FILE squatting the journal's directory", () => {
    const dir = freshDir();
    fs.writeFileSync(path.join(dir, "journal"), "", "utf8"); // the directory cannot be created
    expect(() => journal("unwritable", {}, dir)).not.toThrow();
  });

  it("writes NOTHING without the debug flag, an empty flag included: health owes the machine no writes", () => {
    const dir = freshDir();
    vi.stubEnv(DEBUG_ENV, "");
    journal("unheard", {}, dir);
    vi.unstubAllEnvs();
    journal("unheard", {}, dir);
    expect(fs.existsSync(journalPath(dir))).toBe(false);
  });
});
