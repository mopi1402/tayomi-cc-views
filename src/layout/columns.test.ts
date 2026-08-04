// The cell width of every leading column of a list, measured over the items ACTUALLY rendered.
//
// Two rules compose here and their interaction is the whole module: a mapped column is at least its longest key plus
// the chip's padding, and an off-map value may raise it past that bound. Get the second wrong and a list holding one
// unmapped value shifts every column to its right.
//
// A TEXT column is measured on a third rule, and it has to be a third: what occupies the cell is the WORD that comes
// out, never the key that chose it, so a column of `warning` keys holding `⚠ WARNING` words is nine columns wide and
// not seven.

import { describe, it, expect } from "vitest";
import { DEFAULT_KEY } from "../data/language.js";
import { CHIP_CHROME } from "../style.js";
import { columnWidths, hollowFields } from "./columns.js";
import { STYLE_TABLE, TEXT_TABLE, type Tables } from "./../scope.js";
import { printedWidth } from "./measure.js";

const WARNING = "⚠ WARNING";
const NOTE = "ⓘ NOTE";
const MAPS: Tables = {
  states: { kind: STYLE_TABLE, entries: { ok: "success", failing: "error" } },
  kinds: { kind: TEXT_TABLE, entries: { ok: WARNING, [DEFAULT_KEY]: NOTE } },
};
const LONGEST_KEY = "failing".length;
const CHIPPED = LONGEST_KEY + CHIP_CHROME;

const FIELDS = ["state", "text"];
/** The template line that renders the column through its @map. */
const MAPPED = ["${state:states} ${text}"];
/** The same, through the @text table beside it. */
const WORDED = ["${state:kinds} ${text}"];
const UNMAPPED = ["${state} ${text}"];

const item = (state: string): Record<string, string> => ({ state, text: "prose" });

describe("a mapped column", () => {
  it("reserves its longest key plus the chip's own padding, whatever the items hold", () => {
    expect(columnWidths([item("ok")], FIELDS, MAPPED, MAPS)).toEqual({ state: CHIPPED });
  });

  it("reserves it even for an empty list, so a section keeps its shape", () => {
    expect(columnWidths([], FIELDS, MAPPED, MAPS)).toEqual({ state: CHIPPED });
  });

  it("widens for an OFF-MAP value: alignment wins over the chip's bound", () => {
    const long = "x".repeat(CHIPPED + 3);
    expect(columnWidths([item("ok"), item(long)], FIELDS, MAPPED, MAPS)).toEqual({
      state: long.length,
    });
  });

  it("is NOT widened by a mapped value, which the chip's own bound already covers", () => {
    expect(columnWidths([item("failing")], FIELDS, MAPPED, MAPS)).toEqual({ state: CHIPPED });
  });

  it("measures an off-map value TRIMMED, the same value the chip lookup would see", () => {
    expect(columnWidths([item("  ok  ")], FIELDS, MAPPED, MAPS)).toEqual({ state: CHIPPED });
  });
});

describe("a text column", () => {
  it("is as wide as the WORD it renders, never as the key that chose it", () => {
    // The key is two columns narrower than its word here, which is the whole point: a cell measured on `ok` would cut
    // `⚠ WARNING` on an ellipsis it never earned.
    expect(columnWidths([item("ok")], FIELDS, WORDED, MAPS)).toEqual({
      state: printedWidth(WARNING),
    });
  });

  it("counts the reserved entry for an item carrying no value at all", () => {
    expect(columnWidths([{ text: "prose" }], FIELDS, WORDED, MAPS)).toEqual({
      state: printedWidth(NOTE),
    });
  });

  it("counts an OFF-MAP token at the width it ECHOES, which is uppercase", () => {
    const off = "deploy";
    expect(columnWidths([item(off)], FIELDS, WORDED, MAPS)).toEqual({ state: off.length });
  });

  it("reserves nothing for a chip, because a text table never draws one", () => {
    expect(columnWidths([], FIELDS, WORDED, MAPS)).toEqual({ state: 0 });
  });
});

describe("an unmapped column", () => {
  it("is exactly its widest value, reserving nothing for a chip it never draws", () => {
    expect(columnWidths([item("ok"), item("longer")], FIELDS, UNMAPPED, MAPS)).toEqual({
      state: "longer".length,
    });
  });

  it("is zero when every item leaves the field empty", () => {
    expect(columnWidths([{ text: "prose" }], FIELDS, UNMAPPED, MAPS)).toEqual({ state: 0 });
  });

  it("renders through no map when the template names one the view never declared", () => {
    const widths = columnWidths([item("ok")], FIELDS, ["${state:absent}"], MAPS);
    expect(widths).toEqual({ state: "ok".length });
  });
});

describe("what is never measured", () => {
  it("leaves the LAST declared field out: the prose tail is never padded", () => {
    const widths = columnWidths([item("ok")], FIELDS, UNMAPPED, MAPS);
    expect(Object.keys(widths)).toEqual(["state"]);
  });

  it("measures nothing for a list whose items do not split into fields", () => {
    expect(columnWidths(["a string item"], undefined, UNMAPPED, MAPS)).toEqual({});
  });

  it("measures nothing for a single-field list, which has no leading column", () => {
    expect(columnWidths([item("ok")], ["only"], UNMAPPED, MAPS)).toEqual({});
  });

  it("skips an item that is not an object, rather than counting its text", () => {
    const widths = columnWidths(["a very long plain string"], FIELDS, UNMAPPED, MAPS);
    expect(widths).toEqual({ state: 0 });
  });
});

describe("the columns the data never had", () => {
  const WIDE = ["state", "extra", "text"];

  it("names the field NOT ONE item carries", () => {
    expect([...hollowFields([item("ok")], WIDE)]).toEqual(["extra"]);
  });

  it("keeps a field ONE item carries, so ragged data still lines up", () => {
    // The measure is over the whole list on purpose: a column a single row fills is a column every row must hold open,
    // or that row's cells slide left past the ones above it.
    const items = [item("ok"), { ...item("failing"), extra: "here" }];
    expect(hollowFields(items, WIDE).has("extra")).toBe(false);
  });

  it("counts a field carried EMPTY as carried: absent and blank are not the same answer", () => {
    expect(hollowFields([{ ...item("ok"), extra: "" }], WIDE).size).toBe(0);
  });

  it("names nothing for a list that declares no fields at all", () => {
    expect(hollowFields(["a string item"], undefined).size).toBe(0);
  });

  it("skips an item that is not an object, rather than reading a field off it", () => {
    expect([...hollowFields(["a string item"], WIDE)]).toEqual(WIDE);
  });
});
