// The language's vocabulary, and the properties that make it SAFE rather than merely
// spelled.
//
// Restating a constant would be a tautology, so nothing here does: what is checked is
// what the table promises to every module that composes from it. Two directives sharing
// a spelling, or one that is a PREFIX of another, would make a matcher accept the wrong
// line; a pseudo-field spelled as a word could be shadowed by a block's own field. None
// of the three fails loudly, which is why they are stated here.

import { describe, it, expect } from "vitest";
import {
  ASIDE,
  BOX,
  BULLET,
  BULLET_REF,
  CAP,
  DECLS,
  EACH,
  END,
  ENDASIDE,
  ENDBOX,
  FIELDS,
  FRAME,
  FOOT,
  HEAD,
  INDEX_REF,
  ITEM_REF,
  LABEL,
  LABEL_REF,
  MAP,
  PAIR_SEP,
  RIGHT,
  RULE,
  TOKEN_SEP,
  TONE,
  declSource,
} from "./language.js";

const AT = "@";
const DIRECTIVES = [MAP, FIELDS, TONE, BOX, HEAD, RIGHT, FOOT, FRAME, RULE, EACH, ASIDE, END];
const TERMINATORS = [ENDBOX, ENDASIDE];
const REFS = [ITEM_REF, INDEX_REF, LABEL_REF, BULLET_REF];

describe("the directives", () => {
  it("all wear the one prefix, so a matcher can anchor on it", () => {
    for (const word of [...DIRECTIVES, ...TERMINATORS]) {
      expect(word.startsWith(AT)).toBe(true);
      expect(word).not.toBe(AT);
    }
  });

  it("claim each spelling once, so no two matchers answer the same line", () => {
    const all = [...DIRECTIVES, ...TERMINATORS];
    expect(new Set(all).size).toBe(all.length);
  });

  it("hold no whitespace, which every matcher uses to end the word", () => {
    for (const word of [...DIRECTIVES, ...TERMINATORS]) {
      expect(word).toBe(word.trim());
      expect(TOKEN_SEP.test(word)).toBe(false);
    }
  });

  it("derive each terminator from its opener, so a rename cannot orphan one", () => {
    expect(ENDBOX).toBe(END + BOX.slice(AT.length));
    expect(ENDASIDE).toBe(END + ASIDE.slice(AT.length));
  });

  it("keep @end a strict PREFIX of nothing else it must not swallow", () => {
    // @end matches ALONE on its line, so it cannot take @endbox; the property that
    // makes that true is that the terminators are longer, never equal.
    for (const term of TERMINATORS) {
      expect(term.startsWith(END)).toBe(true);
      expect(term.length).toBeGreaterThan(END.length);
    }
  });
});

describe("the @each declarations", () => {
  it("are exactly the three the language knows, each with a value shape", () => {
    expect(Object.keys(DECLS).sort()).toEqual([BULLET, CAP, LABEL].sort());
    for (const shape of Object.values(DECLS)) expect(shape).not.toBe("");
  });

  it("compose into a pattern that needs whitespace, a separator and a quoted value", () => {
    const re = new RegExp(declSource(LABEL));
    expect(re.test(' label="SAID"')).toBe(true);
    expect(re.test('xlabel="SAID"')).toBe(false); // glued to the field: not a declaration
    expect(re.test(" label=SAID")).toBe(false); // unquoted
    expect(re.test(" label")).toBe(false); // no value at all
  });

  it("capture the value, which is what the matcher reads back", () => {
    expect(' label="SAID"'.match(new RegExp(declSource(LABEL)))?.[1]).toBe("SAID");
  });

  it("accept only a real fraction for a cap, so a word is a near-miss", () => {
    const re = new RegExp(declSource(CAP));
    expect(re.test(' cap="1/3"')).toBe(true);
    expect(re.test(' cap="soon"')).toBe(false);
    expect(re.test(' cap="1/0"')).toBe(false); // a zero denominator never reaches a divide
  });

  it("spend the same key/value separator the pairs of an @map do", () => {
    expect(declSource(LABEL)).toContain(LABEL + PAIR_SEP);
  });
});

describe("the pseudo-fields", () => {
  it("are punctuation, so a block's own field can never shadow one", () => {
    // A key in the data format opens on a letter or an underscore; none of these can.
    const KEY_OPENS = /^[A-Za-z_]/;
    for (const ref of REFS) expect(KEY_OPENS.test(ref)).toBe(false);
  });

  it("claim each spelling once", () => {
    expect(new Set(REFS).size).toBe(REFS.length);
  });

  it("derive the named ones from the declaration they read back", () => {
    expect(LABEL_REF).toContain(LABEL);
    expect(BULLET_REF).toContain(BULLET);
  });
});
