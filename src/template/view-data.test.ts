// The flat data format's parser, at its own edge rather than through a render.
//
// It is the one module a MESSAGE drives directly: every line it reads was written by a model, so the shapes that must
// NOT parse matter as much as the ones that must. And it has a second reader that never draws (a host's gate hook
// judging the same block), so a shape that changes meaning here changes a verdict somewhere else.

import { describe, it, expect } from "vitest";
import { inertData, parseData } from "./view-data.js";
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
