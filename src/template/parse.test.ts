// The template parser: what a template DECLARES about itself, resolved before a single field value is known.
//
// Every declaration here is matched against a near-miss as well as a hit. A directive that half-matches must fall
// through to the BODY, where an author sees it printed and fixes their line; a parser that swallowed it would delete
// the line in silence.

import { describe, it, expect } from "vitest";
import {
  BOX,
  DEFAULT_KEY,
  DIAGRAM,
  EACH,
  END,
  ENGINE_REF,
  FIELD_CONTENT,
  FIELD_HEAD,
  FIELD_ROWS,
  FIELD_TYPE,
  FIELDS,
  FOOT,
  INDEX_REF,
  ITEM_REF,
  MAP,
  PAYLOAD_FENCE,
  PAYLOAD_QUOTE,
  PAYLOAD_TABLE,
  RIGHT,
  TEXT,
  TONE,
} from "../data/language.js";
import { parseTemplate } from "./parse.js";
import { STYLE_TABLE, TEXT_TABLE } from "../scope.js";
import { tagMark } from "../style.js";

const lines = (...rows: string[]): string => rows.join("\n");

/** A declared table as the struct holds it: the kind is half of what was declared. */
const styled = (entries: Record<string, string>): unknown => ({ kind: STYLE_TABLE, entries });
const worded = (entries: Record<string, string>): unknown => ({ kind: TEXT_TABLE, entries });

describe("@map", () => {
  it("builds the enum table its pairs declare", () => {
    const t = parseTemplate(`${MAP} states ok=success fail=error`);
    expect(t.tables.states).toEqual(styled({ ok: "success", fail: "error" }));
  });

  it("accepts the columns an author aligns its pairs in", () => {
    const t = parseTemplate(`${MAP} states   ok=success    fail=error`);
    expect(t.tables.states).toEqual(styled({ ok: "success", fail: "error" }));
  });

  it("skips a pair missing either half, and keeps the ones around it", () => {
    const t = parseTemplate(`${MAP} states ok=success lonely =orphan fail=error`);
    expect(t.tables.states).toEqual(styled({ ok: "success", fail: "error" }));
  });

  it("leaves a line naming a table but declaring nothing in the BODY", () => {
    const line = `${MAP} states`;
    expect(parseTemplate(line)).toMatchObject({ tables: {}, body: [line] });
  });

  it("does not consume the line: a declaration never renders", () => {
    expect(parseTemplate(`${MAP} states ok=success`).body).toEqual([]);
  });
});

// @text is where a naive reuse of @map's reader would break, and break QUIETLY: the pairs are quote-aware because a
// text value has spaces by definition, where a tag name never does. Every case below is one a whitespace splitter would
// get wrong.
describe("@text", () => {
  it("builds the enum-to-word table its pairs declare", () => {
    const t = parseTemplate(`${TEXT} kinds warning="WARNING" error="ERROR"`);
    expect(t.tables.kinds).toEqual(worded({ warning: "WARNING", error: "ERROR" }));
  });

  it("keeps a value's SPACES and its glyph, which is what the quotes are for", () => {
    const t = parseTemplate(`${TEXT} kinds warning="⚠ WARNING" ok="✔ all good here"`);
    expect(t.tables.kinds).toEqual(worded({ warning: "⚠ WARNING", ok: "✔ all good here" }));
  });

  it("declares the reserved entry like any other key", () => {
    const t = parseTemplate(`${TEXT} kinds ${DEFAULT_KEY}="ⓘ NOTE"`);
    expect(t.tables.kinds).toEqual(worded({ [DEFAULT_KEY]: "ⓘ NOTE" }));
  });

  it("accepts an empty value, which is how an author blanks a slot for one kind", () => {
    expect(parseTemplate(`${TEXT} kinds quiet=""`).tables.kinds).toEqual(worded({ quiet: "" }));
  });

  it("skips an UNQUOTED pair, and keeps the quoted ones around it", () => {
    const t = parseTemplate(`${TEXT} kinds a="A" bare=B c="C"`);
    expect(t.tables.kinds).toEqual(worded({ a: "A", c: "C" }));
  });

  it("leaves a line naming a table but declaring nothing in the BODY", () => {
    const line = `${TEXT} kinds`;
    expect(parseTemplate(line)).toMatchObject({ tables: {}, body: [line] });
  });

  it("does not consume the line: a declaration never renders", () => {
    expect(parseTemplate(`${TEXT} kinds a="A"`).body).toEqual([]);
  });

  it("refuses a name the two directives both claim, rather than merging them", () => {
    // One `${field:kinds}` asks both, so a merge would leave the winner to line order and one of the two authors would
    // never see their declaration take effect.
    const clash = lines(`${MAP} kinds ok=success`, `${TEXT} kinds ok="OK"`);
    expect(() => parseTemplate(clash)).toThrow(/kinds/);
    expect(() => parseTemplate(lines(`${TEXT} kinds ok="OK"`, `${MAP} kinds ok=success`))).toThrow();
  });

  it("lets the SAME directive redeclare a name, exactly as it did before @text existed", () => {
    const twice = lines(`${MAP} states ok=success`, `${MAP} states ok=error`);
    expect(parseTemplate(twice).tables.states).toEqual(styled({ ok: "error" }));
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
    expect(crlf.tables.states).toEqual(styled({ ok: "success" }));
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

describe("spendsSlots", () => {
  const ref = (name: string): string => `\${${name}}`;

  it("is false for a body reaching only for the engine, so a health check draws on nothing", () => {
    expect(parseTemplate(`${RIGHT} ${ref(ENGINE_REF)}`).spendsSlots).toBe(false);
    expect(parseTemplate(ref(INDEX_REF)).spendsSlots).toBe(false);
  });

  it("is true for the ITEM, which names no field and is data all the same", () => {
    expect(parseTemplate(`${EACH} rows\n${ref(ITEM_REF)}\n${END}`).spendsSlots).toBe(true);
  });

  it("is true for an ordinary field", () => {
    expect(parseTemplate(ref("said")).spendsSlots).toBe(true);
  });
});

describe(DIAGRAM, () => {
  const ref = (name: string): string => `\${${name}}`;
  const DIAGRAM_BODY = lines(DIAGRAM, ref(FIELD_CONTENT));

  it("declares the body a diagram source, which claims the fence payload and nothing else can", () => {
    const t = parseTemplate(DIAGRAM_BODY);
    expect(t.diagram).toBe(true);
    expect(t.payload).toBe(PAYLOAD_FENCE);
  });

  it("outranks the scoring: spending `content` alone reads as a quote in any other template", () => {
    expect(parseTemplate(ref(FIELD_CONTENT)).payload).toBe(PAYLOAD_QUOTE);
    expect(parseTemplate(DIAGRAM_BODY).payload).toBe(PAYLOAD_FENCE);
  });

  it("takes no argument: a line carrying one is body, and the template is no diagram", () => {
    const t = parseTemplate(lines(`${DIAGRAM} flow`, ref(FIELD_CONTENT)));
    expect(t.diagram).toBe(false);
    expect(t.body).toContain(`${DIAGRAM} flow`);
  });

  it("does not reach the body: a declaration never renders", () => {
    expect(parseTemplate(DIAGRAM_BODY).body).not.toContain(DIAGRAM);
  });
});

describe("the payload a view accepts", () => {
  const ref = (name: string): string => `\${${name}}`;

  it("derives the quote from a body spending what only a quote yields", () => {
    expect(parseTemplate(lines(ref(FIELD_CONTENT), ref(FIELD_TYPE))).payload).toBe(PAYLOAD_QUOTE);
  });

  it("derives the table from a body spending its rows", () => {
    expect(parseTemplate(lines(ref(FIELD_ROWS), ref(FIELD_HEAD))).payload).toBe(PAYLOAD_TABLE);
  });

  it("falls to the table for a sectioned view spending its OWN names, the one shape that yields any", () => {
    expect(parseTemplate(lines(ref("said"), ref("did"))).payload).toBe(PAYLOAD_TABLE);
  });

  it("expects none where the body spends nothing, so a health check owes no form", () => {
    expect(parseTemplate("a static line").payload).toBeNull();
  });

  it("expects none from a STATIC template, its optional garnish notwithstanding", () => {
    // The welcome case: an @foot names a field, but a template spending no slot draws on nothing, so it is not a
    // view a message summons and the teaching gate must not demand it be taught.
    const t = parseTemplate(lines(`${FOOT} message`, "a static line"));
    expect(t.spendsSlots).toBe(false);
    expect(t.payload).toBeNull();
  });
});
