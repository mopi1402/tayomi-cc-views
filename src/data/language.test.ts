// The language's vocabulary, and the properties that make it SAFE rather than merely spelled.
//
// Restating a constant would be a tautology, so nothing here does: what is checked is what the table promises to every
// module that composes from it. Two directives sharing a spelling, or one that is a PREFIX of another, would make a
// matcher accept the wrong line; a pseudo-field spelled as a word could be shadowed by a block's own field. None of the
// three fails loudly, which is why they are stated here.

import { describe, it, expect } from "vitest";
import {
  ASIDE,
  BOX,
  BULLET,
  BULLET_REF,
  CAP,
  DECLS,
  DEFAULT_KEY,
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
  MARKER_FORM,
  MARKER_SLOT,
  MARKER_SOURCE,
  PAIR_SEP,
  QUOTED,
  RIGHT,
  RULE,
  TEXT,
  TEXT_PAIR,
  TOKEN_SEP,
  TONE,
  declSource,
} from "./language.js";

const AT = "@";
const DIRECTIVES = [MAP, TEXT, FIELDS, TONE, BOX, HEAD, RIGHT, FOOT, FRAME, RULE, EACH, ASIDE, END];
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
    // @end matches ALONE on its line, so it cannot take @endbox; the property that makes that true is that the
    // terminators are longer, never equal.
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

// @text's pairs are QUOTE-AWARE, and that is real work rather than a reuse: @map splits its tail on whitespace because
// a tag name has none, and a text value has spaces by definition. Every case here is one the whitespace splitter would
// get wrong SILENTLY.
describe("an @text pair", () => {
  const re = (): RegExp => new RegExp(TEXT_PAIR, "g");
  const pairs = (tail: string): Array<[string, string]> =>
    [...tail.matchAll(re())].map((m) => [m[1], m[2]]);

  it("keeps a value's spaces and its glyph whole, which is why it is quoted", () => {
    expect(pairs('warning="⚠ WARNING"')).toEqual([["warning", "⚠ WARNING"]]);
  });

  it("reads several pairs off one tail, and stops each at its own closing quote", () => {
    expect(pairs('a="one two" b="three"')).toEqual([
      ["a", "one two"],
      ["b", "three"],
    ]);
  });

  it("carries the reserved key like any other, so a default needs no second shape", () => {
    expect(pairs(`${DEFAULT_KEY}="ⓘ NOTE"`)).toEqual([[DEFAULT_KEY, "ⓘ NOTE"]]);
  });

  it("does not match an UNQUOTED value, which is the @map shape and not this one", () => {
    expect(pairs("a=bare")).toEqual([]);
  });

  it("spends the same separator and the same quoted shape the rest of the language does", () => {
    expect(TEXT_PAIR).toContain(PAIR_SEP);
    expect(TEXT_PAIR).toContain(QUOTED);
  });

  it("stops its KEY at the separator, so the pattern cannot run past a pair", () => {
    // The key atom excludes what follows it, which is what makes the match a single anchored quantifier rather than one
    // that backtracks over a near-miss.
    expect(pairs('a=b="c"')).toEqual([["b", "c"]]);
  });
});

// The kind marker a decorated quote may open with. Narrow on purpose: the moment a space is legal, the marker has
// become the label slot the @text table exists to remove.
describe("the kind marker", () => {
  const re = (): RegExp => new RegExp(`^${MARKER_SOURCE}$`);
  const token = (line: string): string | undefined => line.match(re())?.[1] ?? undefined;

  it("reads one uppercase run, digits, dashes and underscores included", () => {
    expect(token("[!WARNING]")).toBe("WARNING");
    expect(token("[!NODE_20]")).toBe("NODE_20");
    expect(token("[!RE-RUN]")).toBe("RE-RUN");
  });

  it("takes NO glyph, no space, no lowercase and no second word", () => {
    for (const near of ["[!📦 VERSION]", "[! WARNING]", "[!warning]", "[!TWO WORDS]", "[!]"]) {
      expect(token(near)).toBeUndefined();
    }
  });

  it("must open on a letter, so a leading digit is not a kind", () => {
    expect(token("[!2FAST]")).toBeUndefined();
  });

  it("is SPELLED the same way it is matched, since a catalogue cannot hand a reader a pattern", () => {
    // The one place the written form and the matcher meet: fill the slot of the form an agent is shown, and the
    // matcher above must read it back. Two spellings drifting apart is exactly what this catches.
    const KIND = "WARNING";
    expect(MARKER_FORM).toContain(MARKER_SLOT);
    expect(token(MARKER_FORM.replace(MARKER_SLOT, KIND))).toBe(KIND);
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
