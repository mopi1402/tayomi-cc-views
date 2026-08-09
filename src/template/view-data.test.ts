// The flat data format's parser, at its own edge rather than through a render.
//
// It is the one module a MESSAGE drives directly: every line it reads was written by a model, so the shapes that must
// NOT parse matter as much as the ones that must. And it has a second reader that never draws (a host's gate hook
// judging the same block), so a shape that changes meaning here changes a verdict somewhere else.

import { describe, it, expect } from "vitest";
import { inertData, namedFields, parseData } from "./view-data.js";
import {
  FIELD_CONTENT,
  FIELD_HEAD,
  FIELD_LABEL,
  FIELD_ROWS,
  FIELD_TONE,
  FIELD_TYPE,
  MIDDLE_FIELDS,
} from "../data/language.js";
import { ITEM_MARK } from "../data/markup.js";
import { inert } from "../style.js";

const EMPTY = {};

describe("a scalar field", () => {
  it("takes the rest of its line, verbatim", () => {
    expect(parseData("said: it works")).toEqual({ said: "it works" });
  });

  it("keeps a colon inside the value, which is the reason this is not YAML", () => {
    expect(parseData("said: fix: the parser")).toEqual({ said: "fix: the parser" });
  });

  it("keeps the characters another format reserves", () => {
    const prose = "`code`, [a](b), {braces}, #hash, - dash";
    expect(parseData(`said: ${prose}`)).toEqual({ said: prose });
  });

  it("eats exactly one space after the colon, so an indent inside a value survives", () => {
    expect(parseData("said:x")).toEqual({ said: "x" });
    expect(parseData("said: x")).toEqual({ said: "x" });
    expect(parseData("said:  x")).toEqual({ said: " x" });
  });

  it("drops the trailing blanks a model leaves behind", () => {
    expect(parseData("said: it works   ")).toEqual({ said: "it works" });
  });

  it("accepts a word, an underscore and a dash in a key, and nothing else", () => {
    expect(parseData("my-field_2: x")).toEqual({ "my-field_2": "x" });
    expect(parseData("2fields: x")).toEqual(EMPTY); // a key never opens on a digit
    expect(parseData(" said: x")).toEqual(EMPTY); // nor after an indent
  });

  it("lets a later line overwrite an earlier one, last written wins", () => {
    expect(parseData("said: first\nsaid: second")).toEqual({ said: "second" });
  });
});

describe("a list field", () => {
  it("is opened by a key with no value and filled by the dashes under it", () => {
    expect(parseData("note:\n- one\n- two")).toEqual({ note: ["one", "two"] });
  });

  it("accepts an indented item, since a model writes the format as markdown", () => {
    expect(parseData("note:\n  - one")).toEqual({ note: ["one"] });
  });

  it("is closed by the next scalar, so an orphan dash below it is dropped", () => {
    expect(parseData("note:\n- one\nsaid: x\n- stray")).toEqual({
      note: ["one"],
      said: "x",
    });
  });

  it("stays empty when the block declares it and writes nothing under it", () => {
    expect(parseData("note:")).toEqual({ note: [] });
  });

  it("ignores a dash arriving before any key opened a list", () => {
    expect(parseData("- one")).toEqual(EMPTY);
  });

  it("wants the space after the dash: a bare hyphen is prose", () => {
    expect(parseData("note:\n-one")).toEqual({ note: [] });
  });
});

describe("an @fields list", () => {
  const FIELDS = { rows: ["state", "speed", "text"] };

  it("gives each leading field one token and the LAST one the rest of the line", () => {
    expect(parseData("rows:\n- ok fast all of it went well", FIELDS)).toEqual({
      rows: [{ state: "ok", speed: "fast", text: "all of it went well" }],
    });
  });

  it("leaves the tail opaque, colons and all: only the leading fields are split", () => {
    const item = parseData("rows:\n- ok fast fix: the parser", FIELDS).rows as object[];
    expect(item[0]).toEqual({ state: "ok", speed: "fast", text: "fix: the parser" });
  });

  it("blanks the fields an item ran out of tokens for, rather than dropping the item", () => {
    expect(parseData("rows:\n- ok", FIELDS)).toEqual({
      rows: [{ state: "ok", speed: "", text: "" }],
    });
  });

  it("leaves an UNDECLARED list as plain strings", () => {
    expect(parseData("other:\n- ok fast all good", FIELDS)).toEqual({
      other: ["ok fast all good"],
    });
  });
});

describe("the parser's totality", () => {
  it("ignores a line matching nothing, so a render never blanks on stray prose", () => {
    expect(parseData("said: x\njust prose\n\n   \nnote: y")).toEqual({
      said: "x",
      note: "y",
    });
  });

  it("never throws, whatever the block holds", () => {
    for (const text of ["", "\n\n", ":::", "- ", "{{warn}}", "a".repeat(1000)]) {
      expect(() => parseData(text)).not.toThrow();
    }
  });
});

describe("inertData", () => {
  const MARKUP = "{{warn}}danger{{/}}";

  it("neutralises the markup a message wrote, so its braces cannot open a colour", () => {
    expect(inertData({ said: MARKUP }).said).toBe(inert(MARKUP));
  });

  it("reaches a string inside a list and inside a nested object", () => {
    const out = inertData({ note: [MARKUP], row: { text: MARKUP } });
    expect(out.note).toEqual([inert(MARKUP)]);
    expect(out.row).toEqual({ text: inert(MARKUP) });
  });

  it("leaves what is not a string exactly as it was", () => {
    expect(inertData({ n: 3, nil: null, no: false })).toEqual({ n: 3, nil: null, no: false });
  });

  it("is NOT part of parseData: the gate hook reads the block as it was typed", () => {
    expect(parseData(`said: ${MARKUP}`)).toEqual({ said: MARKUP });
  });
});


// The SECOND way in: a two-column table has to reach a template as the very fields a fenced block writes, or the
// same view could not be spent from both carriers.
describe("a two-column table read as named fields", () => {
  /** A row as the CARRIER builds it: the first cell names, the last fills. Spelled from the anchors it lands in. */
  const row = (label: string, content: string): Record<string, string> => ({
    [FIELD_LABEL]: label,
    [FIELD_CONTENT]: content,
  });
  /** One item cell, written the way an author types it under a bullet. */
  const item = (text: string): string => `${ITEM_MARK} ${text}`;
  const table = (...rows: Record<string, string>[]): Record<string, unknown> => ({
    [FIELD_ROWS]: rows,
  });
  /** What the fold added, the payload's own fields taken back off. */
  const derived = (
    payload: Record<string, unknown>,
    lists?: Record<string, string[]>
  ): Record<string, unknown> => {
    const out = { ...namedFields(payload, lists) };
    for (const key of Object.keys(payload)) delete out[key];
    return out;
  };

  it("takes the first cell as the NAME and the second as a scalar value", () => {
    expect(derived(table(row("said", "it works")))).toEqual({ said: "it works" });
  });

  it("lowercases and trims the name, so a table may caption its rows in prose", () => {
    expect(derived(table(row("  Said  ", "it works")))).toEqual({ said: "it works" });
  });

  it("appends an item to that field's list when the value opens with a dash", () => {
    expect(derived(table(row("note", item("one")), row("note", item("two"))))).toEqual({
      note: ["one", "two"],
    });
  });

  it("continues the field above on an EMPTY first cell, the rule the whole engine prints by", () => {
    expect(derived(table(row("note", item("one")), row("", item("two"))))).toEqual({
      note: ["one", "two"],
    });
  });

  it("lets a continuation overwrite a scalar, last written winning as it does in a block", () => {
    expect(derived(table(row("said", "first"), row("", "second")))).toEqual({ said: "second" });
  });

  it("keeps a scalar against a LATER item, which the block also drops once no list is open", () => {
    // `- x` under `note: prose` appends nothing in a block; the table's twin must not turn the prose into a list.
    expect(derived(table(row("note", "prose"), row("", item("x"))))).toEqual({ note: "prose" });
    expect(derived(table(row("note", "prose"), row("note", item("x"))))).toEqual({ note: "prose" });
  });

  it("derives NO dressing word: kind and tone ride the decorator line, said on purpose there", () => {
    // A row labelled `type` or `tone` is ordinary content, and deriving it would repaint the whole view.
    expect(
      derived(table(row(FIELD_TYPE, "warning"), row(FIELD_TONE, "fail"), row("said", "x")))
    ).toEqual({ said: "x" });
  });

  it("derives NO carrier-owned word either: a row labelled rows or head cannot occupy the slot", () => {
    // The precedence below only protects a key the payload actually carries, and a table whose header row is blank
    // carries no `head`: a derived one would stand unopposed, a STRING where a template reads the header row object.
    expect(
      derived(table(row(FIELD_ROWS, "stolen"), row(FIELD_HEAD, "stolen"), row("said", "x")))
    ).toEqual({ said: "x" });
  });

  it("drops a continuation with no field above it to continue", () => {
    expect(derived(table(row("", "orphan"), row("said", "x")))).toEqual({ said: "x" });
  });

  it("wants the space after the dash: a bare hyphen is a scalar, exactly as it is prose in a block", () => {
    expect(derived(table(row("note", `${ITEM_MARK}one`)))).toEqual({ note: `${ITEM_MARK}one` });
  });

  it("splits an item through the view's own @fields, the reason this runs where the template is known", () => {
    const lists = { note: ["state", "text"] };
    expect(derived(table(row("note", item("ok all good"))), lists)).toEqual({
      note: [{ state: "ok", text: "all good" }],
    });
    // The same list, UNDECLARED, stays plain strings: the split is the template's business and never this reader's.
    expect(derived(table(row("note", item("ok all good"))))).toEqual({ note: ["ok all good"] });
  });

  it("SKIPS a row whose name is not a legal field name, and reads the rest", () => {
    for (const illegal of ["2fields", "a field", "{{warn}}", ITEM_MARK]) {
      expect(derived(table(row(illegal, "x"), row("said", "kept")))).toEqual({ said: "kept" });
    }
  });

  it("leaves the field above a skipped row OPEN, an unreadable row being ignored and nothing more", () => {
    expect(derived(table(row("said", "first"), row("2fields", "x"), row("", "second")))).toEqual({
      said: "second",
    });
  });

  it("never throws, whatever a row holds", () => {
    for (const rows of [[], [row("", "")], [{}], [{ [FIELD_LABEL]: "a" }], ["a string"], null, 3]) {
      expect(() => namedFields({ [FIELD_ROWS]: rows })).not.toThrow();
    }
  });
});

describe("what the named reading must NOT touch", () => {
  it("reads NO other arity: a wider row has columns to keep and no cell to spare for a name", () => {
    // A three-column row, spelled through the middle name the carrier gives it, so widening the ceiling moves this
    // fixture with it rather than leaving a literal behind.
    const payload = {
      [FIELD_ROWS]: [
        { [FIELD_LABEL]: "said", [MIDDLE_FIELDS[0]]: "middle", [FIELD_CONTENT]: "it works" },
      ],
    };
    expect(namedFields(payload)).toEqual(payload);
  });

  it("reads nothing at all where the rows are plain strings, as a fenced list carries them", () => {
    const payload = { [FIELD_ROWS]: ["one", "two"] };
    expect(namedFields(payload)).toEqual(payload);
  });

  it("hands the very same object back when there is nothing to derive", () => {
    const payload = { said: "x" };
    expect(namedFields(payload)).toBe(payload);
  });

  it("writes UNDER the payload's own fields, never over them", () => {
    // A table labelling a row `rows` or `head` changes nothing about what any existing view draws: that precedence is
    // what lets the whole corpus move onto the decorator without one template changing.
    const rows = [
      { [FIELD_LABEL]: FIELD_ROWS, [FIELD_CONTENT]: "stolen" },
      { [FIELD_LABEL]: FIELD_HEAD, [FIELD_CONTENT]: "stolen" },
    ];
    const head = { [FIELD_LABEL]: "L", [FIELD_CONTENT]: "C" };
    const out = namedFields({ [FIELD_ROWS]: rows, [FIELD_HEAD]: head });
    expect(out[FIELD_ROWS]).toBe(rows);
    expect(out[FIELD_HEAD]).toBe(head);
  });
});

describe("an indented pair", () => {
  it("becomes a mapping under the key above, which is what @use ... from reads", () => {
    expect(parseData("alert:\n  type: warning\n  content: blocked\n")).toEqual({
      alert: { type: "warning", content: "blocked" },
    });
  });

  it("keeps the block's own fields beside it, list and scalar alike", () => {
    expect(parseData("alert:\n  type: warning\nsaid: plain\nrows:\n- one\n")).toEqual({
      alert: { type: "warning" },
      said: "plain",
      rows: ["one"],
    });
  });

  it("leaves a key followed by nothing the empty LIST it has always been", () => {
    expect(parseData("rows:\n")).toEqual({ rows: [] });
    expect(parseData("rows:\n- one\n")).toEqual({ rows: ["one"] });
  });

  it("counts no DEPTH: the indent says `not the block`, and every pair joins the one open mapping", () => {
    expect(parseData("a:\n  b: 1\n    c: 2\n")).toEqual({ a: { b: "1", c: "2" } });
  });

  it("is not claimed by prose, whose words carry no key before the colon", () => {
    // The reason this format is not YAML: a value is opaque, so a sentence indented under a key stays ignored rather
    // than reading as a mapping.
    expect(parseData("content:\n  two flaky suites: publication is blocked\n")).toEqual({
      content: [],
    });
  });

  it("stays out of a list that already has items", () => {
    expect(parseData("rows:\n- one\n  k: v\n")).toEqual({ rows: ["one"] });
  });
});
