// box.test.ts only ever feeds the framer a mark in first position, so `startsWith` and
// `includes` pass it alike. The distinction bites here or nowhere.

import { describe, it, expect } from "vitest";
import { HANG_MARK, RULE_MARK, isRule } from "./marks.js";
import { CONTROL_MARKS } from "../data/marks.js";

const LABEL = "CHECKS";
const TEXT = "a value the message supplied";

describe("the question the framer asks of a line", () => {
  it("answers yes to the code in FIRST position, bare or carrying its label", () => {
    expect(isRule(RULE_MARK)).toBe(true);
    expect(isRule(RULE_MARK + LABEL)).toBe(true);
  });

  it("answers no to a code the line merely CONTAINS", () => {
    expect(isRule(TEXT + RULE_MARK)).toBe(false);
    expect(isRule(`${TEXT}${RULE_MARK}${LABEL}`)).toBe(false);
  });

  it("answers no to the OTHER channel, which travels on a line the same way", () => {
    expect(isRule(HANG_MARK + LABEL)).toBe(false);
  });

  it("answers no to an unmarked line, blank or written", () => {
    expect(isRule("")).toBe(false);
    expect(isRule(TEXT)).toBe(false);
  });
});

describe("the two codes those channels are spelled with", () => {
  it("are the reserved ones, never a second spelling free to drift", () => {
    expect(CONTROL_MARKS).toContain(RULE_MARK);
    expect(CONTROL_MARKS).toContain(HANG_MARK);
  });
});
