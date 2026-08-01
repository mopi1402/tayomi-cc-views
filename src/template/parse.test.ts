// The template parser: what a template DECLARES about itself, resolved before a
// single field value is known.
//
// Every declaration here is matched against a near-miss as well as a hit. A directive
// that half-matches must fall through to the BODY, where an author sees it printed and
// fixes their line; a parser that swallowed it would delete the line in silence.

import { describe, it, expect } from "vitest";
import { BOX, EACH, FIELDS, MAP, TONE } from "../data/language.js";
import { parseTemplate } from "./parse.js";
import { tagMark } from "../style.js";

const lines = (...rows: string[]): string => rows.join("\n");

describe("@map", () => {
  it("builds the enum table its pairs declare", () => {
    const t = parseTemplate(`${MAP} states ok=success fail=error`);
    expect(t.maps.states).toEqual({ ok: "success", fail: "error" });
  });

  it("accepts the columns an author aligns its pairs in", () => {
    const t = parseTemplate(`${MAP} states   ok=success    fail=error`);
    expect(t.maps.states).toEqual({ ok: "success", fail: "error" });
  });

  it("skips a pair missing either half, and keeps the ones around it", () => {
    const t = parseTemplate(`${MAP} states ok=success lonely =orphan fail=error`);
    expect(t.maps.states).toEqual({ ok: "success", fail: "error" });
  });

  it("leaves a line naming a table but declaring nothing in the BODY", () => {
    const line = `${MAP} states`;
    expect(parseTemplate(line)).toMatchObject({ maps: {}, body: [line] });
  });

  it("does not consume the line: a declaration never renders", () => {
    expect(parseTemplate(`${MAP} states ok=success`).body).toEqual([]);
  });
});

describe("@fields", () => {
  it("declares the names an item of that list splits into, in order", () => {
    const t = parseTemplate(`${FIELDS} rows state speed text`);
    expect(t.objectLists.rows).toEqual(["state", "speed", "text"]);
  });

  it("leaves a line naming a list but no field in the BODY", () => {
    const line = `${FIELDS} rows`;
    expect(parseTemplate(line)).toMatchObject({ objectLists: {}, body: [line] });
  });
});

describe("@tone", () => {
  it("names the class the template's tone slot holds by default", () => {
    expect(parseTemplate(`${TONE} warning`).tone).toBe("warning");
  });

  it("tolerates the trailing blanks an editor leaves", () => {
    expect(parseTemplate(`${TONE} warning   `).tone).toBe("warning");
  });

  it("takes ONE word: anything after it makes the line body, not a tone", () => {
    const line = `${TONE} warning and more`;
    expect(parseTemplate(line)).toMatchObject({ tone: undefined, body: [line] });
  });

  it("is undefined when the template declares none, so a carrier decides alone", () => {
    expect(parseTemplate(`${BOX}`).tone).toBeUndefined();
  });
});

describe("the body", () => {
  it("keeps every remaining line, in order and verbatim", () => {
    const t = parseTemplate(lines(BOX, "  ${said}", "", "text"));
    expect(t.body).toEqual([BOX, "  ${said}", "", "text"]);
  });

  it("drops a template comment, indented or not", () => {
    expect(parseTemplate(lines("# a note", "   # indented", "kept")).body).toEqual(["kept"]);
  });

  it("reads a template saved on Windows as the same lines as one saved here", () => {
    const crlf = parseTemplate(`${MAP} states ok=success\r\n\r\nbody\r\n`);
    expect(crlf.maps.states).toEqual({ ok: "success" });
    expect(crlf.body).toEqual(["", "body", ""]);
  });
});

describe("the label column", () => {
  const each = (field: string, label: string): string => `${EACH} ${field} label="${label}"`;

  it("is as wide as the WIDEST label declared, so one long name shifts nothing", () => {
    const t = parseTemplate(lines(each("a", "SAID"), each("b", "REMINDER"), each("c", "DID")));
    expect(t.labelWidth).toBe("REMINDER".length);
  });

  it("is zero when no @each names a section", () => {
    expect(parseTemplate(`${EACH} rows`).labelWidth).toBe(0);
  });

  it("measures what the label PRINTS, not what it spells", () => {
    // A label may carry a tag; the tag costs no column and must not widen the gutter.
    const dressed = `${tagMark("b")}SAID${tagMark("/")}`;
    expect(parseTemplate(each("a", dressed)).labelWidth).toBe("SAID".length);
  });

  it("ignores a label declaration that is not attached to an @each", () => {
    expect(parseTemplate('some text label="WIDE"').labelWidth).toBe(0);
  });

  it("needs whitespace before the declaration, so a glued one is not a label", () => {
    expect(parseTemplate(`${EACH} rowslabel="WIDE"`).labelWidth).toBe(0);
  });
});
