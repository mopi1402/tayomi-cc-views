// The invariant the whole reserved alphabet rests on. It is checked here rather than
// trusted, because both properties it buys are silent when they break: a forgeable
// mark lets data drive the layout, and a mark that costs a column skews every frame.

import { describe, it, expect } from "vitest";
import { CONTROL_MARKS, hasControlMark } from "./marks.js";
import { displayWidth } from "../layout/width.js";

const C0_CEILING = 0x20;

describe("the reserved control marks", () => {
  it("are C0 controls, so no message can type one and none costs a column", () => {
    for (const mark of CONTROL_MARKS) {
      expect(mark).toHaveLength(1); // a spelling, not a code, is forgeable text
      expect(mark.codePointAt(0)).toBeLessThan(C0_CEILING);
      expect(displayWidth(mark)).toBe(0);
    }
  });

  it("claim each code once, so no two channels collide", () => {
    expect(new Set(CONTROL_MARKS).size).toBe(CONTROL_MARKS.length);
  });

  it("are detected together, so a render can assert none survived", () => {
    expect(hasControlMark("plain text")).toBe(false);
    for (const mark of CONTROL_MARKS) {
      expect(hasControlMark(`before${mark}after`)).toBe(true);
    }
  });
});
