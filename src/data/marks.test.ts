// The invariant the whole reserved alphabet rests on. It is checked here rather than trusted, because both properties
// it buys are silent when they break: a forgeable mark lets data drive the layout, and a mark that costs a column skews
// every frame.

import { describe, it, expect } from "vitest";
import { CONTROL_MARKS, RESUME_MARK, SPAN_MARK, dropControl, hasControlMark } from "./marks.js";
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

  it("hold BOTH marks of a span, which is what puts them under every rule above", () => {
    // Enrolment is the whole test story for these two: out of the list they cost nothing to leave a render, and none of
    // the assertions here would look at them. They are named as a PAIR because that is how they are written, and one
    // enrolled without the other would pass every rule above while the screen kept a stray code.
    expect(CONTROL_MARKS).toContain(RESUME_MARK);
    expect(CONTROL_MARKS).toContain(SPAN_MARK);
  });

  it("come OFF a message's text, the one direction a code must never travel", () => {
    // "No message can type one" is a property of a keyboard, not of the channel: a payload is JSON and JSON spells any
    // code point. Since one of these resolves to a style, a byte the model emitted would close a colour the template
    // opened.
    const typed = CONTROL_MARKS.join("x");
    expect(dropControl(typed)).toBe("x".repeat(CONTROL_MARKS.length - 1));
    expect(hasControlMark(dropControl(typed))).toBe(false);
    expect(dropControl("plain text")).toBe("plain text");
  });
});
