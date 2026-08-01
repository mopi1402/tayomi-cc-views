// One view rendered, and the two decisions this composition owns alone.
//
// The TONE CHAIN is the first: four candidates, most explicit first, each falling
// through to the next when the palette does not know the name. It is the reason one
// template renders in any colour without a second copy of itself existing, so the
// precedence is asserted rather than described.
//
// "RAW OVER HOLLOW" is the second: a non-empty block that parsed to no fields throws,
// so the carrier above shows the block as written. An empty skeleton on screen looks
// like the engine works and the model said nothing, which is the worst of both.

import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VIEW_EXT } from "../data/markup.js";
import { hasControlMark } from "../data/marks.js";
import { ANSI_RE, tagMark } from "../style.js";
import { renderView } from "./render.js";
import { TONE } from "../data/language.js";

const NAME = "probe";
const WIDTH = 60;
const options = { width: WIDTH };
const TONE_SLOT = "tone";
const ESC = "\x1b";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-render-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const view = (body: string, name = NAME, type?: string): string => {
  const file = type ? `${name}.${type}${VIEW_EXT}` : name + VIEW_EXT;
  fs.writeFileSync(path.join(dir, file), body);
  return name;
};
const render = (data: object | string, dressing?: object, injected?: object): string =>
  renderView(NAME, data as never, [dir], injected as never, options, dressing as never);
const plain = (s: string): string => s.replace(ANSI_RE, "");

describe("rendering a view", () => {
  it("substitutes the data into the template's body", () => {
    view("said: ${said}");
    expect(plain(render({ said: "it works" }))).toContain("said: it works");
  });

  it("parses RAW block text through the view's own @fields declaration", () => {
    view("${state}/${msg}");
    const template = view("@fields rows state msg\n@each rows\n${state}/${msg}\n@end");
    expect(template).toBe(NAME);
    expect(plain(render("rows:\n- ok all good"))).toContain("ok/all good");
  });

  it("leaves no engine control mark on the way out", () => {
    view('@each note bullet="- "\n${#bullet}${.}\n@end');
    expect(hasControlMark(render({ note: ["one"] }))).toBe(false);
  });

  it("resolves a code span into the pinned accent", () => {
    view("run `it` now");
    expect(render({})).toContain(ESC);
  });
});

describe("raw over hollow", () => {
  it("throws on a non-empty block that parsed to no fields at all", () => {
    view("${said}");
    expect(() => render("this is prose, not the data format")).toThrow(NAME);
  });

  it("renders an EMPTY block, which is a static view summoned by its name alone", () => {
    view("a static line");
    expect(plain(render(""))).toContain("a static line");
  });

  it("never lets injected fields make an empty block look parsed", () => {
    view("${said}");
    expect(() => render("prose", undefined, { injected: "x" })).toThrow(NAME);
  });
});

describe("the tone chain", () => {
  const slot = (): string => view(tagMark(TONE_SLOT) + "x");
  const coloured = (data: object, dressing?: object): string => {
    slot();
    return render(data, dressing);
  };
  const neutral = (): string => coloured({});

  it("takes the carrier's own tone first, over everything else", () => {
    const out = coloured({ tone: "success", type: "error" }, { tone: "warning", type: "error" });
    expect(out).not.toBe(neutral());
    expect(out).toBe(coloured({}, { tone: "warning" }));
  });

  it("takes the block's tone field when the carrier named none", () => {
    expect(coloured({ tone: "warning" })).toBe(coloured({}, { tone: "warning" }));
  });

  it("takes the kind under either name when no tone was given", () => {
    expect(coloured({ type: "warning" })).toBe(coloured({}, { tone: "warning" }));
    expect(coloured({}, { type: "warning" })).toBe(coloured({}, { tone: "warning" }));
  });

  it("falls back to what the template declared with @tone", () => {
    view(`${TONE} warning\n${tagMark(TONE_SLOT)}x`);
    const declared = render({});
    view(`${TONE} success\n${tagMark(TONE_SLOT)}x`);
    expect(declared).not.toBe(render({}));
  });

  it("falls THROUGH a name the palette does not know, rather than blanking the slot", () => {
    expect(coloured({ tone: "not_a_palette_name", type: "warning" })).toBe(
      coloured({}, { tone: "warning" })
    );
  });

  it("keeps the neutral when nothing in the chain resolves", () => {
    expect(coloured({ tone: "not_a_palette_name" })).toBe(neutral());
  });
});

describe("the carrier's kind", () => {
  it("picks a TYPED template file when one exists beside the plain form", () => {
    // A type no other case passes: a typed file written here outlives this test in the
    // shared dir, and would silently answer for a later one.
    const OWN_TYPE = "boxed";
    view("plain form");
    view("typed form", NAME, OWN_TYPE);
    expect(plain(render({}, { type: OWN_TYPE }))).toContain("typed form");
    expect(plain(render({}))).toContain("plain form");
  });

  it("reaches the template as an ordinary field, so a view can print it", () => {
    view("kind: ${type}");
    expect(plain(render({}, { type: "warning" }))).toContain("kind: warning");
  });

  it("OVERRIDES a field of the same name: a block cannot be of two kinds", () => {
    view("kind: ${type}");
    expect(plain(render({ type: "error" }, { type: "warning" }))).toContain("kind: warning");
  });
});

describe("injected fields", () => {
  it("reach the scope, for state the model never wrote", () => {
    view("${said} / ${elapsed}");
    expect(plain(render({ said: "x" }, undefined, { elapsed: "3s" }))).toContain("x / 3s");
  });

  it("win over a field of the same name the block wrote", () => {
    view("${said}");
    expect(plain(render({ said: "model" }, undefined, { said: "display" }))).toContain("display");
  });
});
