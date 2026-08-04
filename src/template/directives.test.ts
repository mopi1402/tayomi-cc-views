// The .view language's directives, driven at their own edge.
//
// Half of these cases are NEAR-MISSES, and that is deliberate: every matcher here was written in two steps rather than
// as one regex precisely so a malformed line falls through to the BODY, where an author sees it printed and fixes it. A
// matcher that half-accepted would swallow the line, and everything under it, in silence.

import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ASIDE,
  BARE,
  BULLET_REF,
  BOX,
  EACH,
  END,
  ENDASIDE,
  ENDBOX,
  FOOT,
  FRAME,
  HEAD,
  INDEX_REF,
  ITEM_REF,
  LABEL_REF,
  FROM,
  RIGHT,
  RULE,
  TEXT,
  TONE,
  USE,
} from "../data/language.js";
import { VIEW_EXT } from "../data/markup.js";
import { HANG_MARK, RULE_MARK } from "../layout/marks.js";
import { fillTone, renderTags, tagMark } from "../style.js";
import { renderBody } from "./directives.js";
import { TEXT_TABLE, type Scope, type Tables } from "../scope.js";

const LIMIT = 60;
const NO_TABLES: Tables = {};
const NO_LISTS = {};
const TOP_LEFT = "╭";

/**
 * One view-language expression. Written through a helper because `${...}` is JS's own interpolation: spelled inline in
 * a template literal, JS eats it before the engine ever sees it.
 */
const ref = (name: string): string => "${" + name + "}";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-directives-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const view = (name: string, body: string): string => {
  fs.writeFileSync(path.join(dir, name + VIEW_EXT), body);
  return name;
};

const render = (
  body: string[],
  scope: Scope = {},
  tables: Tables = NO_TABLES,
  lists: Record<string, string[]> = NO_LISTS
): string[] => renderBody(body, scope, tables, lists, LIMIT, dir);

const text = (body: string[], scope: Scope = {}): string => render(body, scope).join("\n");

describe("a plain line", () => {
  it("is substituted and emitted, one line in and one out", () => {
    expect(render([`said: ${ref("said")}`], { said: "x" })).toEqual(["said: x"]);
  });
});

describe("@each", () => {
  const SCOPE = { note: ["one", "two"] };
  const ITEM = ref(ITEM_REF);

  it("emits its inner lines once per item", () => {
    expect(render([`${EACH} note`, ITEM, END], SCOPE)).toEqual(["one", "two"]);
  });

  it("counts the items from one", () => {
    const line = `${ref(INDEX_REF)}. ${ITEM}`;
    expect(render([`${EACH} note`, line, END], SCOPE)).toEqual(["1. one", "2. two"]);
  });

  it("emits nothing for a field the block never set, rather than an empty row", () => {
    expect(render([`${EACH} absent`, ITEM, END], SCOPE)).toEqual([]);
  });

  it("reads a LONE value as the list of one it obviously is", () => {
    expect(render([`${EACH} note`, ITEM, END], { note: "only" })).toEqual(["only"]);
  });

  it("reads a blank field as empty, indistinguishable from one never written", () => {
    expect(render([`${EACH} note`, ITEM, END], { note: "   " })).toEqual([]);
  });

  it("puts an item's own fields in scope, so a template names them directly", () => {
    // Items arrive already split: the field parsing is view-data.ts's, not this layer's.
    const line = `${ref("state")}/${ref("msg")}`;
    const rows = [{ state: "ok", msg: "all good" }];
    expect(render([`${EACH} rows`, line, END], { rows })).toEqual(["ok/all good"]);
  });

  it("runs to its @end and leaves what follows outside the loop", () => {
    expect(render([`${EACH} note`, ITEM, END, "after"], SCOPE)).toEqual(["one", "two", "after"]);
  });

  it("swallows the rest of the template when its @end is missing, visibly not silently", () => {
    expect(render([`${EACH} note`, ITEM, "tail"], SCOPE)).toEqual(["one", "tail", "two", "tail"]);
  });

  // Where the two halves of a text table MEET, and the only place they can be caught disagreeing: columns.ts measures
  // the cell over the WORDS and substitute.ts spends it, and this layer is what hands the same registry to both.
  // Measured on one side and spent on the other is how a column silently decouples, so the alignment is asserted on the
  // rendered rows rather than on either half's arithmetic.
  it("aligns a text table's column on the WORDS it renders, not on their keys", () => {
    const tables: Tables = {
      kinds: { kind: "text", entries: { warning: "WARNING!", "*": "NOTE" } },
    };
    const rows = [{ k: "warning", t: "a" }, { k: "deploy", t: "b" }, { t: "c" }];
    const out = render([`${EACH} rows`, `${ref("k:kinds")}|${ref("t")}`, END], { rows }, tables, {
      rows: ["k", "t"],
    });
    // A declared word, an off-map key echoed uppercase, and the reserved entry for the row that carried nothing: three
    // different widths, one column.
    expect(out).toEqual(["WARNING!|a", "DEPLOY  |b", "NOTE    |c"]);
  });
});

describe(`${HEAD} inside a loop`, () => {
  // Its own container, its own meaning: the line that HEADS the list, drawn once and spending the loop's own column
  // widths, which is the only reason it cannot be written above the loop instead.
  const FIELDS = ["k", "v"];
  const LISTS = { rows: FIELDS };
  const LINE = `${ref("k")}|${ref("v")}`;
  const LOOP = [`${EACH} rows`, `${HEAD} ${LINE}`, LINE, END];
  const ROWS = [{ k: "a", v: "1" }, { k: "b", v: "2" }];

  it("draws ONCE above the items, never as a line of one", () => {
    const out = render(LOOP, { rows: ROWS, head: { k: "K", v: "V" } }, NO_TABLES, LISTS);
    expect(out).toEqual(["K|V", "a|1", "b|2"]);
  });

  it("draws NOTHING when the scope carries no head, and the items are untouched", () => {
    // What makes one template answer both: a payload that headed nothing leaves the list starting at its first row.
    expect(render(LOOP, { rows: ROWS }, NO_TABLES, LISTS)).toEqual(["a|1", "b|2"]);
  });

  it("joins the MEASUREMENT even though it is not iterated, so a long header still fits", () => {
    // The head's own cell is what sets the column here: measured over the items alone, the header would overflow into
    // the column beside it and every row below would be one width, the header another.
    const LONG = "a header longer than any value";
    const out = render(LOOP, { rows: ROWS, head: { k: LONG, v: "V" } }, NO_TABLES, LISTS);
    for (const line of out) expect(line.indexOf("|")).toBe(LONG.length);
  });

  it("honours a rule among its lines, which the loop's own rule cannot place", () => {
    // A loop's @rule falls BETWEEN items, so nothing there can draw under the header itself.
    const out = render(
      [`${EACH} rows`, `${HEAD} ${LINE}`, `${HEAD} ${RULE}`, LINE, END],
      { rows: ROWS, head: { k: "K", v: "V" } },
      NO_TABLES,
      LISTS
    );
    expect(out).toEqual(["K|V", RULE_MARK, "a|1", "b|2"]);
  });

  it("refuses a head that is a LIST, rather than spreading its indices as field names", () => {
    expect(render(LOOP, { rows: ROWS, head: ["K", "V"] }, NO_TABLES, LISTS)).toEqual(["a|1", "b|2"]);
  });

  it("prints a near-miss as a line of the item, the way every other matcher here does", () => {
    // No space after the word, so it is not the directive: the author sees it repeated per row and fixes it.
    const out = render([`${EACH} rows`, `${HEAD}${LINE}`, END], { rows: ROWS, head: { k: "K", v: "V" } }, NO_TABLES, LISTS);
    expect(out).toEqual([`${HEAD}a|1`, `${HEAD}b|2`]);
  });
});

describe("an @each declaration", () => {
  const SCOPE = { note: ["one", "two"] };
  const ITEM = ref(ITEM_REF);

  it("names the section on the FIRST item and blanks the column on the others", () => {
    const line = `${ref(LABEL_REF)}${ITEM}`;
    const out = render([`${EACH} note label="SAID"`, line, END], {
      ...SCOPE,
      __labelWidth: "SAID".length + 1,
    });
    expect(out).toEqual(["SAID one", "     two"]);
  });

  it("hangs a bullet, the boundary appended once so a wrap knows where it ends", () => {
    const line = `${ref(BULLET_REF)}${ITEM}`;
    const out = render([`${EACH} note bullet="- "`, line, END], SCOPE);
    expect(out).toEqual([`- ${HANG_MARK}one`, `- ${HANG_MARK}two`]);
  });

  it("substitutes inside the bullet, so a marker may carry the item's rank", () => {
    const line = `${ref(BULLET_REF)}${ITEM}`;
    const decl = `${EACH} note bullet="${ref(INDEX_REF)}. "`;
    expect(render([decl, line, END], SCOPE)).toEqual([
      `1. ${HANG_MARK}one`,
      `2. ${HANG_MARK}two`,
    ]);
  });

  it("caps a column to a fraction of the width", () => {
    const line = `[${ref("wide")}]`;
    const wide = "a-very-long-value-here";
    const scope = { rows: [{ state: "ok", wide, text: "tail" }] };
    const lists = { rows: ["state", "wide", "text"] };
    const capped = render([`${EACH} rows cap="1/10"`, line, END], scope, NO_TABLES, lists);
    const uncapped = render([`${EACH} rows`, line, END], scope, NO_TABLES, lists);
    expect(uncapped[0]).toContain(wide);
    expect(capped[0].length).toBeLessThan(uncapped[0].length);
  });
});

describe("an @each that half-matches", () => {
  const SCOPE = { note: ["one"] };
  const ITEM = ref(ITEM_REF);
  /** A rejected declaration leaves three ORDINARY lines: the loop never opened. */
  const asText = (line: string): string[] => render([line, ITEM, END], SCOPE);

  it("is TEXT when it carries a declaration the language does not know", () => {
    const line = `${EACH} note colour="red"`;
    expect(asText(line)).toEqual([line, "", END]);
  });

  it("is TEXT when a known declaration has a value of the wrong shape", () => {
    const line = `${EACH} note cap="soon"`;
    expect(asText(line)).toEqual([line, "", END]);
  });

  it("is TEXT when a declaration is glued to the field with no space", () => {
    const line = `${EACH} notebullet="- "`;
    expect(asText(line)).toEqual([line, "", END]);
  });

  it("accepts the declarations in either order, and both at once", () => {
    expect(render([`${EACH} note bullet="- " label="L"`, ITEM, END], SCOPE)).toEqual(["one"]);
  });
});

describe("@rule", () => {
  it("marks a division, the marker invisible to the screen but not to the frame", () => {
    expect(render([RULE])).toEqual([RULE_MARK]);
  });

  it("carries a prefix, substituted like any other line", () => {
    const out = render([`${RULE} ${ref("label")}`], { label: "CHECKS" });
    expect(out).toEqual([RULE_MARK + "CHECKS"]);
  });

  it("is TEXT when the word merely starts the line", () => {
    const line = `${RULE}s are not directives`;
    expect(render([line])).toEqual([line]);
  });

  it("is the ONE directive an @each body honours, once per item", () => {
    // A divider BETWEEN items can only be placed by the loop, and the collapsing in the container is what then drops
    // the one trailing the last. Everything else inside an @each is a line of the item and belongs to substitution.
    const out = render([`${EACH} note`, ref(ITEM_REF), RULE, END], { note: ["a", "b"] });
    expect(out).toEqual(["a", RULE_MARK, "b", RULE_MARK]);
  });

  it("takes its prefix from the ITEM's scope inside a loop, not from the block's", () => {
    const out = render([`${EACH} note`, ref(ITEM_REF), `${RULE} ${ref(INDEX_REF)}`, END], {
      note: ["a", "b"],
    });
    expect(out).toEqual(["a", RULE_MARK + "1", "b", RULE_MARK + "2"]);
  });
});

describe("@box", () => {
  it("frames what it encloses, and leaves what follows outside the frame", () => {
    const out = render([BOX, "inside", ENDBOX, "outside"]);
    expect(out[0]).toContain(TOP_LEFT);
    expect(out[out.length - 1]).toBe("outside");
  });

  it("puts @head on the title row and @right into the top rule", () => {
    const out = text([BOX, `${HEAD} the title`, `${RIGHT} badge`, "body", ENDBOX]);
    expect(out).toContain("the title");
    expect(out).toContain("badge");
  });

  it("fills the foot zone from the FIELD it names, never from text on its line", () => {
    const out = text([BOX, "body", `${FOOT} cause`, ENDBOX], { cause: "the reason" });
    expect(out).toContain("the reason");
  });

  it("leaves the zone out when the block never set the field", () => {
    const zone = [BOX, "body", `${FOOT} cause`, ENDBOX];
    expect(render(zone, {}).length).toBeLessThan(render(zone, { cause: "x" }).length);
  });

  it("takes its outline's tone from the state @frame reads", () => {
    const body = [BOX, `${FRAME} state ok=success fail=error`, "body", ENDBOX];
    expect(text(body, { state: "fail" })).toContain("{{error}}");
    expect(text(body, { state: "ok" })).toContain("{{success}}");
  });

  it("keeps the default grey for a state the @frame never listed", () => {
    const body = [BOX, `${FRAME} state ok=success`, "body", ENDBOX];
    expect(text(body, { state: "unlisted" })).toContain("{{dim}}");
  });

  it("frames the rest of the template when its @endbox is missing", () => {
    const out = render([BOX, "inside", "still inside"]);
    expect(out[0]).toContain(TOP_LEFT);
    expect(out.join("\n")).toContain("still inside");
  });

  it("renders a directive nested inside it", () => {
    const out = text([BOX, `${EACH} note`, ref(ITEM_REF), END, ENDBOX], { note: ["a", "b"] });
    expect(out).toContain("a");
    expect(out).toContain("b");
  });
});

describe(`@box ${BARE}`, () => {
  const BARE_BOX = `${BOX} ${BARE}`;

  it("runs the body and draws no outline at all", () => {
    const out = render([BARE_BOX, "inside", ENDBOX, "outside"]);
    expect(out).toEqual(["inside", "outside"]);
    expect(out.join("\n")).not.toContain(TOP_LEFT);
  });

  it("wraps what it encloses, which is the whole reason it exists", () => {
    // The claim that parts it from a plain body line: outside a container nothing wraps at all.
    const long = "word ".repeat(40);
    expect(render([BARE_BOX, long, ENDBOX]).length).toBeGreaterThan(1);
    expect(render([long])).toHaveLength(1);
  });

  it("fills an @rule to the body it divides, where a bare line could only guess", () => {
    const out = render([BARE_BOX, "a line", RULE, "another line", ENDBOX]);
    expect(out[1]).toContain("─");
    expect(out[1]).not.toContain(RULE_MARK);
  });

  it("does NOT read @head, @right, @foot or @frame, which print where the author can see them", () => {
    // They have no border to hang on here, and this is already what they do outside any box: the failure mode being
    // refused is the silent one, a title swallowed by a container that had nowhere to put it.
    const chrome = [`${HEAD} a title`, `${RIGHT} badge`, `${FOOT} cause`, `${FRAME} state ok=success`];
    const out = render([BARE_BOX, ...chrome, "body", ENDBOX], { cause: "the reason" });
    expect(out).toEqual([...chrome, "body"]);
  });

  it("prints as text on a token it does not know, rather than quietly framing", () => {
    // The near-miss that matters most: a typo must never render a box the author did not ask for.
    const typo = `${BOX} bear`;
    const out = render([typo, "inside", ENDBOX]);
    expect(out[0]).toBe(typo);
    expect(out.join("\n")).not.toContain(TOP_LEFT);
  });

  it("prints as text when the token is not set off by a space", () => {
    const glued = `${BOX}${BARE}`;
    expect(render([glued, "inside", ENDBOX])[0]).toBe(glued);
  });

  it("prints as text when anything trails the token", () => {
    const trailed = `${BOX} ${BARE} and more`;
    expect(render([trailed, "inside", ENDBOX])[0]).toBe(trailed);
  });
});

describe("@aside", () => {
  const ART = view("art", "  /\\\n /  \\\n");
  const FLOW = "the flow";

  it("puts the named view's body in a column beside the flow", () => {
    const out = renderTags(text([`${ASIDE} ${ART}`, FLOW, ENDASIDE]));
    expect(out).toContain("/\\");
    expect(out).toContain(FLOW);
  });

  it("accepts an alignment word, and centres when none is given", () => {
    for (const align of ["", " top", " bottom"]) {
      const out = text([`${ASIDE} ${ART}${align}`, FLOW, ENDASIDE]);
      expect(out).toContain(FLOW);
      expect(out).not.toContain(ASIDE);
    }
  });

  it("is TEXT for a token that is not an alignment word, and swallows nothing", () => {
    const line = `${ASIDE} ${ART} sideways`;
    const out = render([line, FLOW, ENDASIDE]);
    expect(out[0]).toBe(line);
    expect(out).toContain(FLOW);
  });

  it("yields no column when the named view resolves nowhere, never losing the flow", () => {
    expect(text([`${ASIDE} no_such_view`, FLOW, ENDASIDE])).toContain(FLOW);
  });
});

describe(USE, () => {
  // A copy, and the sanctioned kind: style.ts keeps the slot's name private on purpose.
  const TONE_SLOT = "tone";
  const OWN = "red";
  const CALLER = "green";
  const SAID = "said";
  const TABLE = "kinds";

  const toned = view("toned", `${TONE} ${OWN}\n${tagMark(TONE_SLOT)}${ref("content")}`);
  // A table under a name the CALLER also declares, with a different word behind it.
  const worded = view("worded", `${TEXT} ${TABLE} a="ALPHA"\n${ref(`k:${TABLE}`)}`);
  const echo = view("echo", ref("content"));

  it("draws the named view in place, fed the field it was pointed at", () => {
    const out = render([`${USE} ${toned} ${FROM} ${SAID}`], { said: { content: "hi" } });
    expect(out).toEqual([`${tagMark(OWN)}hi`]);
  });

  it("inherits the caller's own scope when it names no field", () => {
    expect(render([`${USE} ${echo}`], { content: "inherited" })).toEqual(["inherited"]);
  });

  it("keeps its OWN tone, leaving the caller's later pass nothing to fill", () => {
    const out = render([`${USE} ${toned} ${FROM} ${SAID}`], { said: { content: "hi" } }).join("\n");
    expect(out).not.toContain(tagMark(TONE_SLOT));
    expect(fillTone(out, CALLER)).toBe(out);
  });

  it("resolves through the INCLUDED view's tables, never the caller's of the same name", () => {
    const callerTables: Tables = { [TABLE]: { kind: TEXT_TABLE, entries: { a: "CALLER" } } };
    const out = render([`${USE} ${worded} ${FROM} ${SAID}`], { said: { k: "a" } }, callerTables);
    expect(out).toEqual(["ALPHA"]);
  });

  describe("draws ITSELF when it cannot draw the view", () => {
    // None of these lines spends a slot, so the line printed IS the line written.
    const cases: Array<[string, string, Scope]> = [
      ["the name resolves nowhere", `${USE} no_such_view ${FROM} ${SAID}`, { said: { content: "x" } }],
      ["the field is absent", `${USE} ${echo} ${FROM} no_such_field`, { said: { content: "x" } }],
      ["the field holds a plain string", `${USE} ${echo} ${FROM} ${SAID}`, { said: "flat" }],
      ["the field holds a list", `${USE} ${echo} ${FROM} ${SAID}`, { said: ["one"] }],
      ["the tail is neither empty nor a from", `${USE} ${echo} with ${SAID}`, { said: { content: "x" } }],
      ["the word carries no name at all", USE, {}],
      [`the ${FROM} carries no field`, `${USE} ${echo} ${FROM}`, {}],
    ];
    it.each(cases)("%s", (_label, line, scope) => {
      expect(render([line], scope)).toEqual([line]);
    });
  });

  it("stops a view that includes itself, and prints the line that would repeat", () => {
    const line = `${USE} selfie`;
    view("selfie", `top\n${line}`);
    expect(render([line])).toEqual(["top", line]);
  });

  it("stops a cycle that runs through a second view", () => {
    view("ping", `P\n${USE} pong`);
    view("pong", `Q\n${USE} ping`);
    expect(render([`${USE} ping`])).toEqual(["P", "Q", `${USE} ping`]);
  });
});
