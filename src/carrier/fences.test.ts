// Where a carrier must not look, pinned on the shape alone.
//
// This module answers ONE question, so everything here is a span: which characters of a text sit inside a fenced block,
// and which of those blocks is the block carrier's own. What the carriers DO with the answer is their sidecars'
// business, not this one's.
//
// The fences are spelled here rather than imported from the production constant: a test sharing the spelling of what it
// measures cannot catch a drift in it.

import { describe, it, expect } from "vitest";
import { fenceAt, fenceSpans } from "./fences.js";

const TICKS = "```";
const LONGER = "````";
/** The info string that makes a fence the block carrier's, spelled independently too. */
const CARRIER = "view:demo";

const lines = (...rows: string[]): string => rows.join("\n");
/** The text a span covers, which is the only way to assert a span without arithmetic. */
const spanned = (text: string, i = 0): string => {
  const s = fenceSpans(text)[i];
  return s === undefined ? "" : text.slice(s.start, s.end);
};

describe("an ordinary fence", () => {
  it("covers its opening line, its body and its closing line", () => {
    const text = lines("before", TICKS, "body", TICKS, "after");
    expect(spanned(text)).toBe(lines(TICKS, "body", TICKS) + "\n");
    expect(fenceSpans(text)).toHaveLength(1);
  });

  it("is not a carrier, whatever its info string", () => {
    expect(fenceSpans(lines(TICKS + "ts", "x", TICKS))[0].carrier).toBe(false);
  });

  it("opens under an indent, which markdown allows", () => {
    expect(fenceSpans(lines("  " + TICKS, "x", "  " + TICKS))).toHaveLength(1);
  });

  it("runs to the end of the text when it never closes", () => {
    const text = lines("before", TICKS, "still typing");
    expect(spanned(text)).toBe(lines(TICKS, "still typing"));
  });
});

describe("a carrier fence", () => {
  it("is a span like any other, and says so", () => {
    const [span] = fenceSpans(lines(TICKS + CARRIER, "k: v", TICKS));
    expect(span.carrier).toBe(true);
  });

  it("stops being one the moment it is quoted inside a longer fence", () => {
    // The whole point: documentation about this package shows a working block, and the OUTERMOST fence is what decides.
    // One span, and it is not the carrier's.
    const text = lines(LONGER, TICKS + CARRIER, "k: v", TICKS, LONGER);
    const spans = fenceSpans(text);
    expect(spans).toHaveLength(1);
    expect(spans[0].carrier).toBe(false);
    expect(spanned(text)).toContain(CARRIER);
  });
});

describe("what closes a fence, and what does not", () => {
  it("takes a longer run as a close", () => {
    expect(fenceSpans(lines(TICKS, "x", LONGER))).toHaveLength(1);
    expect(spanned(lines(TICKS, "x", LONGER))).toBe(lines(TICKS, "x", LONGER));
  });

  it("does NOT take a shorter run as a close", () => {
    // The near-miss the nesting rests on: inside a ````, a ``` is body.
    const text = lines(LONGER, TICKS, "x", TICKS, LONGER);
    expect(fenceSpans(text)).toHaveLength(1);
    expect(spanned(text)).toBe(text);
  });

  it("does NOT take a run carrying an info string as a close", () => {
    // Without this, the ```view: line being SHOWN would close the block showing it.
    const text = lines(TICKS, TICKS + CARRIER, "x", TICKS);
    expect(spanned(text)).toBe(lines(TICKS, TICKS + CARRIER, "x", TICKS));
  });

  it("ignores a run shorter than three, which is inline code", () => {
    expect(fenceSpans(lines("a ``b`` c", "``", "d"))).toHaveLength(0);
  });
});

describe("placing an offset", () => {
  const text = lines("before", TICKS, "inside", TICKS, "after");
  const at = (needle: string): number => text.indexOf(needle);

  it("finds the fence a body offset falls in", () => {
    expect(fenceAt(fenceSpans(text), at("inside"))).toBeDefined();
  });

  it("finds it for the opening line itself, which is where a carrier match starts", () => {
    expect(fenceAt(fenceSpans(text), at(TICKS))).toBeDefined();
  });

  it("finds nothing on either side of it", () => {
    expect(fenceAt(fenceSpans(text), at("before"))).toBeUndefined();
    expect(fenceAt(fenceSpans(text), at("after"))).toBeUndefined();
  });

  it("finds nothing at all in a text carrying no fence", () => {
    expect(fenceSpans(lines("just", "prose"))).toEqual([]);
  });
});
