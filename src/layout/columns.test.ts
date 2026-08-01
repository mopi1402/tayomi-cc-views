// The cell width of every leading column of a list, measured over the items ACTUALLY
// rendered.
//
// Two rules compose here and their interaction is the whole module: a mapped column is
// at least its longest key plus the chip's padding, and an off-map value may raise it
// past that bound. Get the second wrong and a list holding one unmapped value shifts
// every column to its right.

import { describe, it, expect } from "vitest";
import { CHIP_CHROME } from "../style.js";
import { columnWidths } from "./columns.js";
import type { Maps } from "../scope.js";

const MAPS: Maps = { states: { ok: "success", failing: "error" } };
const LONGEST_KEY = "failing".length;
const CHIPPED = LONGEST_KEY + CHIP_CHROME;

const FIELDS = ["state", "text"];
/** The template line that renders the column through its @map. */
const MAPPED = ["${state:states} ${text}"];
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
