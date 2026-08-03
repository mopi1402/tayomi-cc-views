// The composition graph, driven at the only edge that proves anything about it.
//
// A table describing an engine is worth nothing until the engine is shown READING it. So the cases below do not check
// that the entries say what they say, which would restate the file. They TAKE A WORD OUT and show the render change,
// which is the only observation that separates a load-bearing table from a description sitting beside the code.

import { describe, it, expect } from "vitest";
import { BOX, ENDBOX, HEAD, RULE, EACH, END } from "./language.js";
import { CLOSES, IN_BOX, IN_EACH, READS, TOP, readsHere } from "./grammar.js";
import { renderBody } from "../template/directives.js";
import { RULE_MARK } from "../layout/marks.js";
import type { Scope, Tables } from "../scope.js";

const LIMIT = 60;
const NO_TABLES: Tables = {};
const TITLE = "a title";

const render = (body: string[], scope: Scope = {}, lists: Record<string, string[]> = {}): string[] =>
  renderBody(body, scope, NO_TABLES, lists, LIMIT, "");

/** A word taken out of an entry, put back whatever the assertion does, since the table is module state. */
function without(container: keyof typeof READS, word: string, run: () => void): void {
  const table = READS as Record<string, readonly string[]>;
  const saved = table[container];
  table[container] = saved.filter((w) => w !== word);
  try {
    run();
  } finally {
    table[container] = saved;
  }
}

describe("the table is what the engine reads", () => {
  it("stops reading @head inside a box the moment @box's entry no longer names it", () => {
    // The whole contract of this file in one case. With the word in place the title is chrome and never appears as a
    // line of the body; with it gone the SAME template prints it, because nothing matched it and it fell through.
    const template = [BOX, `${HEAD} ${TITLE}`, "the body", ENDBOX];
    expect(render(template).some((l) => l.includes(`${HEAD} ${TITLE}`))).toBe(false);
    without(IN_BOX, HEAD, () => {
      expect(render(template).some((l) => l.includes(`${HEAD} ${TITLE}`))).toBe(true);
    });
  });

  it("stops honouring @rule in a loop the moment @each's entry no longer names it", () => {
    const template = [`${EACH} notes`, "${.}", RULE, END];
    const scope = { notes: ["one", "two"] };
    expect(render(template, scope)).toEqual(["one", RULE_MARK, "two", RULE_MARK]);
    without(IN_EACH, RULE, () => {
      // Not a mark any more: the line went to substitution, which is what every other directive in a loop body does.
      expect(render(template, scope)).toEqual(["one", RULE, "two", RULE]);
    });
  });
});

describe("what the entries hold", () => {
  it("gives a bare container no chrome word at all, which is what parts it from a box", () => {
    // Stated as a COMPARISON rather than as an empty array, so it fails if the box's own entry is what emptied.
    expect(READS[IN_BOX].length).toBeGreaterThan(0);
    expect(READS["box-bare"]).toHaveLength(0);
  });

  it("answers no for a word a container does not read", () => {
    // The near-miss of `readsHere`: a matcher that answered yes to everything would pass every case above.
    expect(readsHere(IN_BOX, HEAD)).toBe(true);
    expect(readsHere(TOP, HEAD)).toBe(false);
    expect(readsHere(IN_EACH, BOX)).toBe(false);
  });

  it("closes every opener with @end, bare or carrying the opener's own name", () => {
    // The two shapes the language actually has: a REGION closes on its own name (@endbox), a LOOP on the bare @end,
    // which is why @end can never collide with the two terminators above it.
    expect(CLOSES[BOX]).toBe(ENDBOX);
    expect(CLOSES[EACH]).toBe(END);
    for (const [open, close] of Object.entries(CLOSES)) {
      expect(close === END || close === END + open.slice(1)).toBe(true);
    }
  });
});
