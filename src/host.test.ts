// The strict pair and the strict line, spelled ONCE for both carriers: each pass reports an outcome and draws the
// host's replacement through these, so what is pinned here is the one spelling the two must share.

import { describe, it, expect } from "vitest";
import { failedOutcome, okOutcome, strictLine } from "./host.js";
import { renderTags, tagMark } from "./style.js";

describe("the strict outcome", () => {
  it("says ok as one claim, the error field closed with it", () => {
    expect(okOutcome()).toEqual({ ok: true, error: null });
  });

  it("reports an Error by its own message", () => {
    expect(failedOutcome(new Error("went wrong"))).toEqual({ ok: false, error: "went wrong" });
  });

  it("reports a bare reason as text, a throw being anything at all in JavaScript", () => {
    expect(failedOutcome("payload refused")).toEqual({ ok: false, error: "payload refused" });
  });
});

describe("the strict view's replacement line", () => {
  it("resolves the host's tags: a host is a program, not a message", () => {
    const line = `${tagMark("fail")}the view did not render`;
    expect(strictLine({ failedLine: line })).toBe(renderTags(line));
    expect(strictLine({ failedLine: line })).not.toContain(tagMark("fail"));
  });
});
