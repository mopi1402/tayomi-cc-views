// The palette and the {{tag}} shape: the only module allowed to know what a colour is.
//
// The rules with teeth are the ones about what is NOT a tag. An unknown name reaches
// the screen verbatim (so the measurer must agree it costs columns), a brace written by
// a MESSAGE is neutralised (so data can never open a colour the render meant to keep),
// and a host's registration is total (a throw at startup once killed a whole display).

import { describe, it, expect } from "vitest";
import {
  ANSI_RE,
  CHIP_CHROME,
  CODE_RE,
  RESET_MARK,
  TAG_RE,
  TAG_SOURCE,
  chip,
  dropInert,
  extendTags,
  fillTone,
  inert,
  isTag,
  renderCode,
  renderTags,
  tagMark,
  tagSource,
  toneClass,
} from "./style.js";
import { printedWidth } from "./layout/measure.js";

const KNOWN = "warn";
const UNKNOWN = "not_a_palette_name";
const TONE_SLOT = "tone";
const TONE_CHIP = "tone_bg";
/** A sequence the palette does NOT carry, so a registration test owns its own value. */
const MAGENTA = "\x1b[35m";
const ESC = "\x1b";

describe("the tag shape", () => {
  it("wraps a name in the delimiters, and the closing tag is the solidus", () => {
    expect(tagMark(KNOWN)).toBe(`{{${KNOWN}}}`);
    expect(RESET_MARK).toBe("{{/}}");
  });

  it("finds every tag on a line through the shared pattern", () => {
    const found = [...`${tagMark("a")}x${RESET_MARK}`.matchAll(TAG_RE)].map((m) => m[1]);
    expect(found).toEqual(["a", "/"]);
  });

  it("exposes the SAME shape as a source, so a caller composing its own agrees", () => {
    const composed = new RegExp(`^${TAG_SOURCE}$`);
    expect(composed.test(tagMark(KNOWN))).toBe(true);
    expect(composed.test(RESET_MARK)).toBe(true);
    expect(composed.test("{{not a tag}}")).toBe(false);
  });

  it("exposes one NAMED tag's shape, escaped for a pattern", () => {
    expect(new RegExp(tagSource(KNOWN)).test(tagMark(KNOWN))).toBe(true);
    expect(new RegExp(tagSource(KNOWN)).test(tagMark("other"))).toBe(false);
  });
});

describe("resolving a tag", () => {
  it("turns a known name into its escape", () => {
    expect(renderTags(tagMark(KNOWN))).toContain(ESC);
  });

  it("leaves an unknown name on screen VERBATIM, which is why it costs columns", () => {
    const literal = tagMark(UNKNOWN);
    expect(isTag(UNKNOWN)).toBe(false);
    expect(renderTags(literal)).toBe(literal);
    expect(printedWidth(literal)).toBe(literal.length);
  });

  it("resolves the closing tag, so a render always has something to close with", () => {
    expect(isTag("/")).toBe(true);
  });
});

describe("neutralising a message's markup", () => {
  it("marks a brace so the tag shape can no longer match it", () => {
    const written = `${tagMark(KNOWN)}danger${RESET_MARK}`;
    const safe = inert(written);
    expect(renderTags(safe)).not.toContain(ESC);
    expect(TAG_RE.test(safe)).toBe(false);
  });

  it("measures as the LITERAL text the message typed, the mark itself costing nothing", () => {
    const written = `${tagMark(KNOWN)}danger`;
    // Unneutralised the tag resolves, so it costs nothing and only the word is measured.
    expect(printedWidth(written)).toBe("danger".length);
    // Neutralised the braces PRINT, so they must be paid for: that is the whole trade.
    expect(printedWidth(inert(written))).toBe(written.length);
  });

  it("marks EVERY brace, so an overlapping shape has none left unmarked", () => {
    expect(renderTags(inert("{{{warn}}"))).not.toContain(ESC);
  });

  it("leaves text with no brace untouched, and is undone exactly", () => {
    expect(inert("plain text")).toBe("plain text");
    expect(dropInert(inert("{{warn}}x"))).toBe("{{warn}}x");
  });
});

describe("a chip", () => {
  it("puts a blank on each side of its label, so the colour never touches the text", () => {
    expect(chip(KNOWN, "OK")).toBe(`${tagMark(KNOWN)} OK ${RESET_MARK}`);
  });

  it("spends exactly what the measurer reserves for it", () => {
    expect(printedWidth(chip(KNOWN, "OK"))).toBe("OK".length + CHIP_CHROME);
  });
});

describe("the tone slot", () => {
  it("picks the first name of the chain the palette knows", () => {
    expect(toneClass(undefined, KNOWN, "fail")).toBe(KNOWN);
  });

  it("falls THROUGH an unknown name, so a typo costs a colour and not the render", () => {
    expect(toneClass(UNKNOWN, KNOWN)).toBe(KNOWN);
  });

  it("is undefined when nothing in the chain resolves, which means the neutral", () => {
    expect(toneClass(undefined, "", UNKNOWN)).toBeUndefined();
  });

  it("fills both halves of the slot with the class and its chip", () => {
    const filled = fillTone(`${tagMark(TONE_SLOT)}x${tagMark(TONE_CHIP)}`, KNOWN);
    expect(filled).toContain(tagMark(KNOWN));
    expect(filled).toContain(tagMark(`${KNOWN}_bg`));
  });

  it("spends the foreground for a class with no filled variant, never a hole", () => {
    const PLAIN = "gold";
    expect(isTag(PLAIN)).toBe(true);
    expect(isTag(`${PLAIN}_bg`)).toBe(false);
    expect(fillTone(tagMark(TONE_CHIP), PLAIN)).toBe(tagMark(PLAIN));
  });

  it("leaves the slot alone with no class, so an unfilled template still renders", () => {
    const slot = tagMark(TONE_SLOT);
    expect(fillTone(slot, undefined)).toBe(slot);
  });

  it("leaves both halves TAGS, so a width measured before it still holds", () => {
    const before = `${tagMark(TONE_SLOT)}x${tagMark(TONE_CHIP)}`;
    expect(printedWidth(fillTone(before, KNOWN))).toBe(printedWidth(before));
  });
});

describe("extendTags", () => {
  it("registers a host's tag and resolves it afterwards", () => {
    const name = "host_own_tag";
    expect(extendTags({ [name]: MAGENTA })).toEqual({ shadowed: [], skipped: [] });
    expect(isTag(name)).toBe(true);
    expect(renderTags(tagMark(name))).toBe(MAGENTA);
  });

  it("lets a host SHADOW an engine name, and reports what it took over", () => {
    // A registry is process-global by design, so this takes over a palette name no
    // other case here reads: the shadow outlives the test that made it.
    const SHADOWED = "med";
    const report = extendTags({ [SHADOWED]: MAGENTA });
    expect(report.shadowed).toEqual([SHADOWED]);
    expect(renderTags(tagMark(SHADOWED))).toBe(MAGENTA);
  });

  it("is a no-op on an identical re-registration, so two entry points may both call", () => {
    const name = "idempotent_tag";
    extendTags({ [name]: MAGENTA });
    expect(extendTags({ [name]: MAGENTA })).toEqual({ shadowed: [], skipped: [] });
  });

  it("SKIPS a name that cannot fit the tag shape rather than throwing at startup", () => {
    const bad = "has space";
    expect(extendTags({ [bad]: MAGENTA }).skipped).toEqual([bad]);
    expect(isTag(bad)).toBe(false);
  });
});

describe("the patterns a measurer shares", () => {
  it("matches an escape already on the line", () => {
    expect("text".replace(ANSI_RE, "")).toBe("text");
    expect(`${ESC}[1;97mtext${ESC}[0m`.replace(ANSI_RE, "")).toBe("text");
  });

  it("matches a non-empty code span and leaves a lone backtick alone", () => {
    expect("run `it` now".replace(CODE_RE, "$1")).toBe("run it now");
    expect("a ` b".replace(CODE_RE, "$1")).toBe("a ` b");
  });

  it("renders a code span in the pinned accent", () => {
    expect(renderCode("run `it`")).toContain(ESC);
    expect(renderCode("run it")).toBe("run it");
  });
});
