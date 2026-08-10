// The palette and the {{tag}} shape: the only module allowed to know what a colour is.
//
// The rules with teeth are the ones about what is NOT a tag. An unknown name reaches the screen verbatim (so the
// measurer must agree it costs columns), a brace written by a MESSAGE is neutralised (so data can never open a colour
// the render meant to keep), and a host's registration is total (a throw at startup once killed a whole display).

import { describe, it, expect, afterEach, vi } from "vitest";
import { BLOCK_INFO, CODE_TICK, FENCE, THEME_ENV } from "./data/markup.js";
import { CELL_MARK, STACK_MARK } from "./data/marks.js";
import {
  ANSI_RE,
  CHIP_CHROME,
  RESET_MARK,
  RESUME_MARK,
  TAG_RE,
  TAG_SOURCE,
  TAG_SUFFIXES,
  ansi256,
  builtinTagNames,
  chip,
  dropInert,
  extendTags,
  fillTone,
  inert,
  isTag,
  markCode,
  overCode,
  renderCode,
  renderTags,
  rgb,
  spanOpen,
  tagMark,
  tagNames,
  tagSource,
  toneClass,
} from "./style.js";
import { printedWidth } from "./layout/measure.js";

const KNOWN = "warn";
const UNKNOWN = "not_a_palette_name";
const TONE_SLOT = "tone";
const TONE_CHIP = "tone_bg";
const TONE_CAP = "tone_cap";
/** The suffixes the slot pairs a class with, spelled as a template author spells them. */
const BG = "_bg";
const CAP = "_cap";
/** A WEIGHT and not a colour, so nothing about it is measurable and no chip can be derived for it. */
const FURNITURE = "b";
/** Every colour a tone may name, which is every name that MUST be able to fill. */
const COLOURS = [
  "red", "green", "yellow", "blue", "magenta", "cyan", "orange", "gold", "dim", "key",
  "purple", "violet", "pink", "teal", "aqua", "lime", "brown", "navy", "salmon", "mint",
  // `box_title` and `code` stay out: neither names pixels in every theme, so neither can be measured.
  "chip", "title", "box_rule",
  "pass", "warn", "fail", "high", "med", "low",
  "warning", "error", "success", "info",
];
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

  it("takes the engine's own control codes OFF, the other half of the same rule", () => {
    // A brace is BROKEN because it must still print; a code prints nothing, so it goes. Left in, a byte the model
    // spelled would end a span and close a colour the template opened.
    expect(inert(`a${RESUME_MARK}b`)).toBe("ab");
  });
});

describe("a chip", () => {
  it("puts a blank on each side of its label, so the colour never touches the text", () => {
    expect(chip(KNOWN, "OK")).toBe(`${spanOpen(KNOWN)} OK ${RESUME_MARK}`);
  });

  it("spends exactly what the measurer reserves for it", () => {
    expect(printedWidth(chip(KNOWN, "OK"))).toBe("OK".length + CHIP_CHROME);
  });
});

// A span the engine puts INSIDE a line whose style it did not choose: a code span, a chip, the bold the decorator
// derives. Clearing at its right edge takes the rest of the line down with it.
describe("a span the ENGINE inserted", () => {
  const seq = (name: string): string => renderTags(tagMark(name));
  const RESET = renderTags(RESET_MARK);
  const DIM = "dim";
  const CODE = "code";

  it("hands the line back the style its CODE SPAN interrupted", () => {
    const line = `${tagMark(DIM)}- Read \`trace.ts\` again${RESET_MARK}`;
    expect(renderTags(markCode(line))).toBe(
      `${seq(DIM)}- Read ${seq(CODE)}trace.ts${RESET}${seq(DIM)} again${RESET}`
    );
  });

  it("hands the line back the style a CHIP interrupted, and never the chip itself", () => {
    const line = `${tagMark(DIM)}state ${chip(KNOWN, "OK")} done${RESET_MARK}`;
    expect(renderTags(line)).toBe(
      `${seq(DIM)}state ${seq(KNOWN)} OK ${RESET}${seq(DIM)} done${RESET}`
    );
  });

  it("resolves to a PLAIN RESET with nothing open, which is the whole existing corpus", () => {
    const line = "run `it` now";
    expect(renderTags(markCode(line))).toBe(`run ${seq(CODE)}it${RESET} now`);
    expect(renderCode(line)).toBe(renderTags(markCode(line)));
    expect(renderCode(line)).not.toContain(tagMark(CODE));
    // SELF-CONTAINED: nothing else on the host's line is read as markup on the way past.
    expect(renderCode(`${tagMark(KNOWN)} \`it\``)).toContain(tagMark(KNOWN));
  });

  it("re-opens the innermost of two tags opened in a row, and what stands under it", () => {
    const line = `${tagMark(DIM)}${tagMark(FURNITURE)}x \`c\` y${RESET_MARK}`;
    expect(renderTags(markCode(line))).toBe(
      `${seq(DIM)}${seq(FURNITURE)}x ${seq(CODE)}c` +
        `${RESET}${seq(DIM)}${seq(FURNITURE)} y${RESET}`
    );
  });

  it("re-opens what the tone slot was FILLED with, never the literal word", () => {
    const line = fillTone(markCode(`${tagMark(TONE_SLOT)}\`c\` y${RESET_MARK}`), KNOWN);
    expect(renderTags(line)).toBe(
      `${seq(KNOWN)}${seq(CODE)}c${RESET}${seq(KNOWN)} y${RESET}`
    );
  });

  it("re-opens NOTHING an author's own reset closed, however many stood before it", () => {
    // TWO of them, or a reset that merely closed the innermost would read the same and the language would have gained
    // the nesting the ticket refuses it.
    const line = `${tagMark(DIM)}${tagMark(FURNITURE)}x${RESET_MARK}\`c\` y`;
    expect(renderTags(markCode(line))).toBe(
      `${seq(DIM)}${seq(FURNITURE)}x${RESET}${seq(CODE)}c${RESET} y`
    );
  });

  it("hands the style back after EVERY span on the line, not only the first", () => {
    const line = `${tagMark(DIM)}a \`one\` b \`two\` c${RESET_MARK}`;
    expect(renderTags(markCode(line))).toBe(
      `${seq(DIM)}a ${seq(CODE)}one${RESET}${seq(DIM)} b ` +
        `${seq(CODE)}two${RESET}${seq(DIM)} c${RESET}`
    );
  });

  it("closes the whole FRAME its span opened, a tag the BODY wrote included", () => {
    // The defect the opening mark exists for: a resume that popped one entry handed the line back the body's last tag
    // instead of the style the span interrupted.
    const line = `${tagMark(DIM)}see \`a ${tagMark(FURNITURE)}b\` end${RESET_MARK}`;
    expect(renderTags(markCode(line))).toBe(
      `${seq(DIM)}see ${seq(CODE)}a ${seq(FURNITURE)}b${RESET}${seq(DIM)} end${RESET}`
    );
  });

  it("closes a frame whatever its body opened, two tags as readily as one", () => {
    // TWO, or a resume that popped a fixed number would read the same as one that pops to the boundary, and the rule
    // would only look right at depth one.
    const body = `a ${tagMark(FURNITURE)}b ${tagMark(KNOWN)}c`;
    const line = `${tagMark(DIM)}see \`${body}\` end${RESET_MARK}`;
    expect(renderTags(markCode(line))).toBe(
      `${seq(DIM)}see ${seq(CODE)}a ${seq(FURNITURE)}b ${seq(KNOWN)}c` +
        `${RESET}${seq(DIM)} end${RESET}`
    );
  });

  it("leaves the line PLAIN after a span whose body wrote a tag, nothing being open", () => {
    // The byte-identity case, and the one the frame is what finally buys: the body's tag was the last thing pushed, so
    // a line with no style at all printed on in it.
    const line = `see \`a ${tagMark(FURNITURE)}b\` end`;
    expect(renderTags(markCode(line))).toBe(`see ${seq(CODE)}a ${seq(FURNITURE)}b${RESET} end`);
  });

  it("ends the INNER frame alone where two spans NEST, and the outer at its own mark", () => {
    // A chip's label is data, and data carries backticks, so the engine's own spans nest. The inner resume must hand
    // back the chip, and the outer the style around it.
    const line = `${tagMark(DIM)}${chip(KNOWN, "run \`it\` now")} tail${RESET_MARK}`;
    expect(renderTags(markCode(line))).toBe(
      `${seq(DIM)}${seq(KNOWN)} run ${seq(CODE)}it${RESET}${seq(DIM)}${seq(KNOWN)} now ` +
        `${RESET}${seq(DIM)} tail${RESET}`
    );
  });

  it("stacks no UNKNOWN name, so a span closing OVER one still resumes the tag under it", () => {
    // A code span's body is anything up to the closing tick, a template's own tags included. Counted, one of them would
    // be popped in the opener's place and the code colour would run on to the end of the line.
    const line = `${tagMark(DIM)}\`a ${tagMark(UNKNOWN)} b\` tail`;
    expect(renderTags(markCode(line))).toBe(
      `${seq(DIM)}${seq(CODE)}a ${tagMark(UNKNOWN)} b${RESET}${seq(DIM)} tail`
    );
  });

  it("re-opens no UNKNOWN name, which reaches the screen as text and opened nothing", () => {
    const line = `${tagMark(UNKNOWN)}\`c\` y`;
    expect(renderTags(markCode(line))).toBe(`${tagMark(UNKNOWN)}${seq(CODE)}c${RESET} y`);
  });

  it("clears instead, where the span's OWN name is one the palette cannot answer for", () => {
    // A `@map` names the tag its chip opens on, so this one span's opener is the template author's word and not the
    // engine's. Unknown, it prints as text and opens nothing, and a resume would then close the style the chip is
    // SITTING IN.
    expect(chip(UNKNOWN, "OK")).toBe(`${spanOpen(UNKNOWN)} OK ${RESET_MARK}`);
    const line = `${tagMark(DIM)}a ${chip(UNKNOWN, "OK")} b`;
    expect(renderTags(line)).toBe(`${seq(DIM)}a ${tagMark(UNKNOWN)} OK ${RESET} b`);
  });

  it("re-opens no colour the HOST opened, which is a sequence and no tag of ours", () => {
    const line = `${MAGENTA}host \`c\` tail`;
    expect(renderTags(markCode(line))).toBe(`${MAGENTA}host ${seq(CODE)}c${RESET} tail`);
  });
});

// The one colour in the palette that is not a CHOICE: a code span has to stay legible, and legibility is a fact about
// the surface under it. Every case here is written as a RELATION, never as a sequence: the value depends on the theme
// the suite happens to run in, and a fixture naming one would go red the day a developer switches theme.
describe("the ink of a code span, chosen against the surface under it", () => {
  /** A body no escape sequence can contain, so the ink is everything written before it. */
  const BODY = "BODY";
  /** A fill whose ink is dark, hence a LIGHT surface. */
  const LIGHT_FILL = "warn_bg";
  /** A fill whose ink is white, hence a DARK surface. */
  const DARK_FILL = "fail_bg";
  /** The neutral pill, whose whole job is to turn over with the terminal. */
  const PILL = "chip";
  /** A tag that colours a FOREGROUND and fills nothing, so a walk must step over it. */
  const NO_FILL = "dim";

  const seq = (name: string): string => renderTags(tagMark(name));

  /** The sequence a code span OPENS with, drawn under the tags `over` (outermost first). */
  const inkUnder = (...over: string[]): string => {
    const prefix = over.map(tagMark).join("");
    const drawn = renderTags(markCode(`${prefix}\`${BODY}\``));
    return drawn.slice(over.map(seq).join("").length, drawn.indexOf(BODY));
  };

  it("gives a light surface and a dark one two different inks", () => {
    expect(inkUnder(LIGHT_FILL)).not.toBe(inkUnder(DARK_FILL));
  });

  it("spends the TERMINAL's own ink on whichever of the two the terminal is", () => {
    // Which one that is depends on the theme, and the suite must not care: what it pins is that the terminal is one of
    // the two surfaces and never a third value of its own.
    expect([inkUnder(LIGHT_FILL), inkUnder(DARK_FILL)]).toContain(inkUnder());
  });

  it("draws the neutral pill on the side OPPOSITE the terminal, so the band is a band on either screen", () => {
    // The pill is the reason this whole rule exists: filled near-white and read with the terminal's own ink, a span
    // inside it measured 1.62 against its own background.
    expect(inkUnder(PILL)).not.toBe(inkUnder());
  });

  it("reads the INNERMOST surface, which is the one a reader actually sees", () => {
    expect(inkUnder(LIGHT_FILL, DARK_FILL)).toBe(inkUnder(DARK_FILL));
    expect(inkUnder(DARK_FILL, LIGHT_FILL)).toBe(inkUnder(LIGHT_FILL));
  });

  it("steps over a tag that colours a foreground and fills NOTHING", () => {
    // The near-miss that decides the walk: read as a surface, `dim` would answer for a band that was never opened.
    expect(inkUnder(NO_FILL)).toBe(inkUnder());
    expect(inkUnder(DARK_FILL, NO_FILL)).toBe(inkUnder(DARK_FILL));
  });

  it("hands the surface back after the span, not the terminal's version of it", () => {
    const drawn = renderTags(markCode(`${tagMark(DARK_FILL)}a \`${BODY}\` b`));
    expect(drawn.endsWith(` b`)).toBe(true);
    expect(drawn).toContain(`${BODY}${renderTags(RESET_MARK)}${seq(DARK_FILL)} b`);
  });

});

// The second half of the same rule, and the half that MEASURES. Choosing the side of the surface was the whole decision
// before, so both of the host's code colours landed on bands they had never been compared against: violet sat at 1.24
// where the neutral pill, the one surface already corrected, sits at 4.40.
//
// Its own describe because every case drives a FRESH import under a NAMED theme. The palette is captured at module
// load, so a fixture wanting a known code colour cannot have one any other way, and asking the suite's own theme back
// would make the expectations whatever that theme happened to be.
describe("a code span pushed until it is legible ON the fill under it", () => {
  const BODY = "BODY";
  /** A fill whose ink is dark, hence a LIGHT surface, and a base-sixteen slot so its pixels are the theme's. */
  const SLOT_FILL = "warn_bg";

  // WCAG, recomputed here and the one formula this suite holds a second copy of on purpose: an expectation asking
  // style.ts for its own ratio would pass whatever that ratio became.
  const AA_BODY = 4.5;
  const CHANNEL_MAX = 255;
  const KNEE = 0.03928;
  const SLOPE = 12.92;
  const OFFSET = 0.055;
  const GAMMA = 2.4;
  const WEIGHTS = [0.2126, 0.7152, 0.0722];
  const FLOOR = 0.05;

  const luminance = (c: number[]): number =>
    WEIGHTS.reduce((sum, w, i) => {
      const s = c[i] / CHANNEL_MAX;
      return sum + w * (s <= KNEE ? s / SLOPE : ((s + OFFSET) / (1 + OFFSET)) ** GAMMA);
    }, 0);
  const ratio = (a: number[], b: number[]): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + FLOOR) / (lo + FLOOR);
  };

  /** The pixels a sequence names, undefined where it names a THEME slot instead. */
  const TRUECOLOR = /\x1b\[38;2;(\d+);(\d+);(\d+)m/;
  const pixels = (s: string): number[] | undefined =>
    TRUECOLOR.exec(s)
      ?.slice(1)
      .map(Number);

  // REGISTERED rather than taken from the palette: only a fill naming pixels can be measured against, and reading them
  // back out of a bundled chip would need this module's cube geometry here, a second copy of exactly the wrong thing.
  const FILLS: Record<string, number[]> = {
    tvi: [175, 95, 255], // violet, the hardest fill of the palette
    tpu: [175, 135, 255],
    tor: [255, 135, 0],
    tna: [0, 95, 175], // dark, so the push goes the other way
  };

  /** The two themes that matter here: one naming its code colour in pixels, one naming a slot. */
  const PIXEL_THEME = "dark";
  const SLOT_THEME = "dark-ansi";
  /** What `dark` reads for a LIGHT surface, which is the counterpart theme's value. Pinned, or nothing here has a scale. */
  const ON_LIGHT = [87, 105, 247];

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /** The span's opening sequence, under a fresh palette built for `theme`. */
  const inkOn = async (theme: string, fill: string): Promise<string> => {
    vi.stubEnv(THEME_ENV, theme);
    vi.resetModules();
    const S = (await import("./style.js")) as typeof import("./style.js");
    S.extendTags(
      Object.fromEntries(Object.entries(FILLS).map(([n, [r, g, b]]) => [n, S.rgb(r, g, b)]))
    );
    const prefix = S.tagMark(fill);
    const drawn = S.renderTags(S.markCode(`${prefix}\`${BODY}\``));
    return drawn.slice(S.renderTags(prefix).length, drawn.indexOf(BODY));
  };

  it("clears AA against every fill whose pixels are readable", async () => {
    for (const [name, fill] of Object.entries(FILLS)) {
      const ink = pixels(await inkOn(PIXEL_THEME, name + BG));
      expect(ink).toBeDefined();
      expect(ratio(ink as number[], fill)).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it("keeps the HUE, which is the only thing making a span read as code rather than as text", () => {
    // Every channel moves by the SAME factor, so the ratios between them survive. Pinned because the cheap fix is to
    // hand back the band's own black or white, and that is a span a reader can no longer tell from the words.
    return inkOn(PIXEL_THEME, "tvi" + BG).then((s) => {
      const ink = pixels(s) as number[];
      expect(ink[2]).toBeGreaterThan(ink[0]); // still blue, never a grey
      expect(ink[2] / ink[0]).toBeCloseTo(ON_LIGHT[2] / ON_LIGHT[0], 1);
    });
  });

  it("goes the way the fill points, darker on a light one and lighter on a dark one", async () => {
    const onLight = pixels(await inkOn(PIXEL_THEME, "tvi" + BG)) as number[];
    const onDark = pixels(await inkOn(PIXEL_THEME, "tna" + BG)) as number[];
    expect(luminance(onLight)).toBeLessThan(luminance(ON_LIGHT));
    expect(luminance(onDark)).toBeGreaterThan(luminance(ON_LIGHT));
  });

  it("leaves the value ALONE where the fill is a base-sixteen slot", async () => {
    // Half the chips fill with a slot the theme paints, and correcting against pixels this process cannot see would be
    // a second guess stacked on the first.
    expect(pixels(await inkOn(PIXEL_THEME, SLOT_FILL))).toEqual(ON_LIGHT);
  });

  it("leaves it alone where the CODE colour is a slot too, which is every `ansi` theme", async () => {
    // The other half of the same refusal, and the one a suite running under one theme would never reach.
    const ink = await inkOn(SLOT_THEME, "tvi" + BG);
    expect(pixels(ink)).toBeUndefined();
    expect(ink).toBe(await inkOn(SLOT_THEME, "tor" + BG)); // one value for both fills: nothing was measured
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

  it("fills all three parts of the slot with the class, its chip and its cap", () => {
    const written = `${tagMark(TONE_SLOT)}x${tagMark(TONE_CHIP)}y${tagMark(TONE_CAP)}`;
    const filled = fillTone(written, KNOWN);
    expect(filled).toContain(tagMark(KNOWN));
    expect(filled).toContain(tagMark(KNOWN + BG));
    expect(filled).toContain(tagMark(KNOWN + CAP));
  });

  /** The palette's own answer for a surface with no colour opinion, which is what an unfilled class is given. */
  const NEUTRAL = "chip";

  it("gives a class with no filled variant the NEUTRAL surface, never its own foreground", () => {
    // FURNITURE is a WEIGHT: it names no pixels, so it cannot be drawn on. Sent to itself, as it was, a band came out
    // as two half-circles around nothing, which is the defect this whole slot exists to prevent.
    expect(isTag(FURNITURE)).toBe(true);
    expect(isTag(FURNITURE + BG)).toBe(false);
    expect(fillTone(tagMark(TONE_CHIP), FURNITURE)).toBe(tagMark(NEUTRAL + BG));
  });

  it("sends its CAP to that same neutral, so the edge and the fill still agree", () => {
    // The invariant that outlived the change: whatever the chip fills with, the cap paints. A cap answering for one
    // surface while the chip drew another is a scallop of the wrong colour on both flanks.
    expect(isTag(FURNITURE + CAP)).toBe(false);
    expect(fillTone(tagMark(TONE_CAP), FURNITURE)).toBe(tagMark(NEUTRAL + CAP));
  });

  it("keeps the FOREGROUND slot on the class itself, which is the one that never wanted pixels", () => {
    expect(fillTone(tagMark(TONE_SLOT), FURNITURE)).toBe(tagMark(FURNITURE));
  });

  it("leaves the slot alone with no class, so an unfilled template still renders", () => {
    const slot = tagMark(TONE_SLOT);
    expect(fillTone(slot, undefined)).toBe(slot);
  });

  it("leaves all three parts TAGS, so a width measured before it still holds", () => {
    const before = `${tagMark(TONE_SLOT)}x${tagMark(TONE_CHIP)}y${tagMark(TONE_CAP)}`;
    expect(printedWidth(fillTone(before, KNOWN))).toBe(printedWidth(before));
  });

  it("resolves the UNFILLED cap too, from the white chip the unfilled slot holds", () => {
    expect(isTag(TONE_CAP)).toBe(true);
  });

  it("gives EVERY colour a chip and a cap, so a tone can always fill a surface", () => {
    // A template may spend the chip as a SURFACE, and a colour with no chip leaves it framing nothing.
    for (const cls of COLOURS) {
      expect({ cls, bg: isTag(cls + BG), cap: isTag(cls + CAP) }).toEqual({
        cls,
        bg: true,
        cap: true,
      });
    }
  });

  /** An extended background, the form that names PIXELS. A base-sixteen one names a slot the theme paints. */
  const INDEXED_FILL = ";48;5;";

  it("fills blue and magenta with pixels, which is the whole of what made them correctable", () => {
    // The defect end to end: their band used to fill with slots 44 and 45, so the ink beside them could only be
    // guessed and the code span inside inherited that guess. The exact sequences are pinned in the bundled suite; what
    // matters here is that a reader of this module can measure them at all.
    for (const cls of ["blue", "magenta"]) {
      expect({ cls, measurable: renderTags(tagMark(cls + BG)).includes(INDEXED_FILL) }).toEqual({
        cls,
        measurable: true,
      });
    }
  });
});

describe("a cap, the foreground painting a chip's own fill", () => {
  /**
   * This table IS the defect: the caps used to spend `{{tone}}`, which is bold, and a terminal promotes a bold
   * base-sixteen FOREGROUND to the bright slot while nothing promotes a background.
   */
  const FILLED: Record<string, string> = {
    info: `${ESC}[36m`,
    warning: `${ESC}[33m`,
    error: `${ESC}[31m`,
    success: `${ESC}[32m`,
    high: `${ESC}[31m`,
    med: `${ESC}[38;5;208m`,
    low: `${ESC}[38;5;250m`,
    gold: `${ESC}[38;5;220m`,
    // An INDEX rather than the `34`/`35` slots these two used to fill with: a cap paints its band's own fill, so it
    // moved with the fill the day blue and magenta left the base range to become measurable.
    blue: `${ESC}[38;5;20m`,
    magenta: `${ESC}[38;5;127m`,
  };

  it("matches the fill of every class a band can wear, none of them bold", () => {
    for (const [cls, expected] of Object.entries(FILLED)) {
      expect(renderTags(tagMark(cls + CAP))).toBe(expected);
    }
  });

  /** The two ends of the 256 cube, which is what the neutral pill is made of: one of them on the other. */
  const CUBE_ENDS = [16, 231];
  const FILLS = ";48;5;";

  it("paints the neutral pill's cap with the pill's FILL, whichever way round the terminal put it", () => {
    // Out of the table above: every other entry there is a HUE, the same sequence on either screen, where the pill
    // turns over with the terminal. What holds in every theme is the RELATION, so naming its two sequences would go red
    // the day a developer switches theme rather than the day a cap breaks.
    const pill = renderTags(tagMark("chip"));
    const fill = CUBE_ENDS.find((n) => pill.endsWith(`${FILLS}${n}m`));
    expect(fill).toBeDefined();
    expect(renderTags(tagMark("chip" + CAP))).toBe(ansi256(fill as number));
    expect(renderTags(tagMark("chip" + CAP))).not.toBe(ansi256(CUBE_ENDS.find((n) => n !== fill) as number));
  });

  it("carries a BRIGHT background over to the bright foreground, ten below", () => {
    const name = "cap_bright_probe";
    extendTags({ [name + BG]: `${ESC}[30;106m` });
    expect(renderTags(tagMark(name + CAP))).toBe(`${ESC}[96m`);
  });

  it("carries a truecolor background over whole, triplet included", () => {
    const name = "cap_true_probe";
    extendTags({ [name + BG]: `${ESC}[48;2;177;185;249m` });
    expect(renderTags(tagMark(name + CAP))).toBe(`${ESC}[38;2;177;185;249m`);
  });

  it("is DERIVED, so a host's own chip gets its cap with no second registration", () => {
    const name = "cap_host_probe";
    expect(isTag(name + CAP)).toBe(false);
    extendTags({ [name + BG]: `${ESC}[42m` });
    expect(renderTags(tagMark(name + CAP))).toBe(`${ESC}[32m`);
  });

  it("SKIPS an extended foreground rather than reading its index as a background", () => {
    // `38;5;44` ends on a number that IS a cyan background code. Walked one parameter at a time, this accent would hand
    // back a cap its chip never carried.
    const name = "cap_accent_probe";
    extendTags({ [name + BG]: `${ESC}[1;38;5;44m` });
    expect(isTag(name + CAP)).toBe(false);
  });

  it("has no cap for a chip that fills nothing, which is what the fallback rides on", () => {
    const name = "cap_hollow_probe";
    extendTags({ [name + BG]: `${ESC}[1;33m` });
    expect(isTag(name + CAP)).toBe(false);
  });

  it("has no cap for a TRUNCATED extended background, rather than guessing one", () => {
    const name = "cap_cut_probe";
    extendTags({ [name + BG]: `${ESC}[48;5m` });
    expect(isTag(name + CAP)).toBe(false);
  });

  it("has no cap for a name that is not a sequence at all", () => {
    const name = "cap_prose_probe";
    extendTags({ [name + BG]: "not an escape" });
    expect(isTag(name + CAP)).toBe(false);
  });

  it("has no cap where there is no chip, which is a weight and nothing else", () => {
    expect(isTag(FURNITURE + CAP)).toBe(false);
    expect(isTag(UNKNOWN + CAP)).toBe(false);
  });
});

describe("a chip, the fill a colour derives", () => {
  /**
   * The other half of the chain, and the reason a colour is ONE line in the palette: a chip's only decision is its ink,
   * black or white, and that follows from whether the fill is light or dark. Measurable for a colour that names its
   * PIXELS, which is a 256 index (the cube's levels are fixed) or truecolor.
   */
  const DARK_INK = "1;30";
  const LIGHT_INK = "1;97";
  /** A light index and a dark one, from opposite ends of the cube. */
  const LIGHT_INDEX = 220;
  const DARK_INDEX = 25;

  it("inks BLACK on a light index and WHITE on a dark one, measured, not guessed", () => {
    const light = "chip_light_probe";
    const dark = "chip_dark_probe";
    extendTags({ [light]: `${ESC}[38;5;${LIGHT_INDEX}m`, [dark]: `${ESC}[38;5;${DARK_INDEX}m` });
    expect(renderTags(tagMark(light + BG))).toBe(`${ESC}[${DARK_INK};48;5;${LIGHT_INDEX}m`);
    expect(renderTags(tagMark(dark + BG))).toBe(`${ESC}[${LIGHT_INK};48;5;${DARK_INDEX}m`);
  });

  it("measures a truecolor value the same way, and fills with the triplet itself", () => {
    const name = "chip_true_probe";
    extendTags({ [name]: `${ESC}[1;38;2;20;20;30m` });
    expect(renderTags(tagMark(name + BG))).toBe(`${ESC}[${LIGHT_INK};48;2;20;20;30m`);
  });

  it("gives a host ALL THREE names for ONE declaration, which is the point", () => {
    const name = "chip_whole_probe";
    extendTags({ [name]: `${ESC}[38;5;${LIGHT_INDEX}m` });
    expect(renderTags(tagMark(name))).toBe(`${ESC}[38;5;${LIGHT_INDEX}m`);
    expect(renderTags(tagMark(name + BG))).toBe(`${ESC}[${DARK_INK};48;5;${LIGHT_INDEX}m`);
    expect(renderTags(tagMark(name + CAP))).toBe(`${ESC}[38;5;${LIGHT_INDEX}m`);
  });

  it("refuses a BASE-SIXTEEN slot, whose pixels are the user's theme and not ours", () => {
    // `31` names a slot, whose pixels come from a theme this process cannot read, so no ink can be chosen for it.
    const name = "chip_slot_probe";
    extendTags({ [name]: `${ESC}[1;31m` });
    expect(isTag(name + BG)).toBe(false);
  });

  it("refuses a sequence that already FILLS, so a chip never derives from a chip", () => {
    // `chip` writes black on white: reading its foreground would hand back a BLACK band.
    expect(renderTags(tagMark("chip" + BG))).toBe(renderTags(tagMark("chip")));
    const name = "chip_filled_probe";
    extendTags({ [name]: `${ESC}[1;97;41m` });
    expect(isTag(name + BG)).toBe(false);
  });

  it("refuses a weight, which carries no colour to measure at all", () => {
    expect(isTag(FURNITURE + BG)).toBe(false);
  });

  it("follows a SHADOWED colour, so a band is never painted in the colour that was replaced", () => {
    // The case TAYOMI hits: it registers its own `info`, a blue, and leaves `info_bg` alone. Keeping the built-in cyan
    // chip would draw a cyan band under a blue name.
    const SHADOW = 75;
    extendTags({ info: `${ESC}[38;5;${SHADOW}m` });
    expect(renderTags(tagMark("info" + BG))).toBe(`${ESC}[${DARK_INK};48;5;${SHADOW}m`);
    expect(renderTags(tagMark("info" + CAP))).toBe(`${ESC}[38;5;${SHADOW}m`);
  });

  it("keeps the built-in chip when a shadowing colour cannot be measured, never a hole", () => {
    // A host may shadow with a base-sixteen slot, which derives nothing. Losing the chip there would cost the band; the
    // table stays the fallback instead.
    extendTags({ warn: `${ESC}[1;33m` });
    expect(renderTags(tagMark("warn" + BG))).toBe(`${ESC}[1;30;43m`);
  });

  it("lets the TABLE win, so a hand-decided ink is never overwritten by a measured one", () => {
    // `low` is the bold attribute's opposite number rather than a colour, and its chip is a decision. A derivation that
    // could reach it would silently replace that.
    expect(renderTags(tagMark("low" + BG))).toBe(`${ESC}[30;48;5;250m`);
  });
});

describe("the two colour builders a host registers with", () => {
  /**
   * The two SGR introducers the builders exist to spell, written out because this is the sidecar where the shape is
   * the contract; everywhere else they are composed, never retyped.
   */
  const INDEXED = "38;5";
  const TRUECOLOR = "38;2";
  /** The index `gold` is declared with, which is the palette's own call to ansi256. */
  const GOLD_INDEX = 220;
  /** A LIGHT index, whose chip is inked black; the dark side is the triplet case below. */
  const LIGHT = 220;
  const DARK_INK = "1;30";
  const LIGHT_INK = "1;97";

  it("spells an index, and spells it the way the PALETTE spells its own", () => {
    // Derived rather than compared to a copy: `gold` IS ansi256(220), so a builder that stopped agreeing with the
    // palette would have to fail here.
    expect(ansi256(GOLD_INDEX)).toBe(renderTags(tagMark("gold")));
    expect(ansi256(GOLD_INDEX)).toBe(`${ESC}[${INDEXED};${GOLD_INDEX}m`);
  });

  it("spells a truecolor triplet, channels in order", () => {
    expect(rgb(1, 2, 3)).toBe(`${ESC}[${TRUECOLOR};1;2;3m`);
  });

  it("hands a host all THREE names from one built index, ink measured", () => {
    // The round trip is the claim, not the bytes: a sequence chipOf cannot parse back would satisfy a byte assertion
    // and still leave the host without a chip.
    const name = "builder_index_probe";
    extendTags({ [name]: ansi256(LIGHT) });
    expect(renderTags(tagMark(name))).toBe(ansi256(LIGHT));
    expect(renderTags(tagMark(name + BG))).toBe(`${ESC}[${DARK_INK};48;5;${LIGHT}m`);
    expect(renderTags(tagMark(name + CAP))).toBe(ansi256(LIGHT));
  });

  it("hands the same three from a built triplet, inked the other way on a dark one", () => {
    const name = "builder_rgb_probe";
    extendTags({ [name]: rgb(20, 20, 30) });
    expect(renderTags(tagMark(name + BG))).toBe(`${ESC}[${LIGHT_INK};48;2;20;20;30m`);
    expect(renderTags(tagMark(name + CAP))).toBe(rgb(20, 20, 30));
  });

  /** The first index of the theme-owned range, which names a slot and not pixels. */
  const SLOT_INDEX = 0;

  it("still answers for the base sixteen, which derive nothing and are legal anyway", () => {
    // A slot rather than pixels, so no chip: the trade the engine's own `blue` makes. The builder does not refuse it,
    // or the engine would be calling a legal colour illegal.
    const name = "builder_slot_probe";
    extendTags({ [name]: ansi256(SLOT_INDEX) });
    expect(renderTags(tagMark(name))).toBe(`${ESC}[${INDEXED};${SLOT_INDEX}m`);
    expect(isTag(name + BG)).toBe(false);
  });

  // The clamps, one case per way out of the byte. A builder that only ever sees good input cannot tell a clamp from an
  // absent one, and what an unclamped value emits is a sequence a terminal reads as something else entirely.
  const BYTE_LAST = 255;
  const OVER = 999;
  const UNDER = -1;
  const FRACTION = 74.6;
  const ROUNDED = 75;

  it("clamps an index ABOVE the byte rather than emitting a parameter nobody can read", () => {
    expect(ansi256(OVER)).toBe(`${ESC}[${INDEXED};${BYTE_LAST}m`);
    // An infinity is on the number line and clamps like any other value past the end.
    expect(ansi256(Number.POSITIVE_INFINITY)).toBe(`${ESC}[${INDEXED};${BYTE_LAST}m`);
  });

  it("clamps BELOW, where a minus sign would end the sequence's number early", () => {
    expect(ansi256(UNDER)).toBe(`${ESC}[${INDEXED};0m`);
    expect(rgb(UNDER, UNDER, UNDER)).toBe(`${ESC}[${TRUECOLOR};0;0;0m`);
  });

  it("rounds a fraction, a decimal point being no more legal than a minus", () => {
    expect(ansi256(FRACTION)).toBe(`${ESC}[${INDEXED};${ROUNDED}m`);
    expect(rgb(FRACTION, 0, 0)).toBe(`${ESC}[${TRUECOLOR};${ROUNDED};0;0m`);
  });

  it("takes a NaN as zero rather than writing the word into the sequence", () => {
    // TOTAL, under the same law as extendTags: this runs at a host's startup, and a throw there once cost a whole
    // display. The clamp is what makes the call safe to be total.
    expect(ansi256(Number.NaN)).toBe(`${ESC}[${INDEXED};0m`);
    expect(rgb(0, Number.NaN, 0)).toBe(`${ESC}[${TRUECOLOR};0;0;0m`);
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
    // A registry is process-global by design, so this takes over a palette name no other case here reads: the shadow
    // outlives the test that made it.
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

  it("takes over the INLINE CODE colour too, engine spans and a host's own line alike", () => {
    // The one place the engine's palette used to be read past the registry, so a host shadowing `code` was ignored
    // where every other name it registers is honoured. This shadow outlives the test, like the one above: nothing below
    // reads the built-in.
    const CODE = "code";
    expect(extendTags({ [CODE]: MAGENTA }).shadowed).toEqual([CODE]);
    expect(renderCode("a `b`")).toBe(`a ${MAGENTA}b${renderTags(RESET_MARK)}`);
    expect(renderTags(markCode("a `b`"))).toBe(renderCode("a `b`"));
    // Inside a band too: the surface is what the ENGINE's own value is chosen against, and a name the engine no longer
    // owns is spent as written, wherever it is written.
    expect(renderTags(markCode(`${tagMark("warn_bg")}\`b\``))).toContain(MAGENTA);
  });
});

/** A span reduced to its own text, which is what a measurer counts and what every other reader wraps. */
const bare = (s: string): string => overCode(s, (t) => t);

describe("the patterns a measurer shares", () => {
  it("matches an escape already on the line", () => {
    expect("text".replace(ANSI_RE, "")).toBe("text");
    expect(`${ESC}[1;97mtext${ESC}[0m`.replace(ANSI_RE, "")).toBe("text");
  });

  it("matches a non-empty code span and leaves a lone backtick alone", () => {
    expect(bare(`run ${CODE_TICK}it${CODE_TICK} now`)).toBe("run it now");
    expect(bare(`a ${CODE_TICK} b`)).toBe(`a ${CODE_TICK} b`);
  });

  it("carries a span whose own TEXT is a run of backticks, which is how a fence is quoted at all", () => {
    // The case this class was rewritten for. A run of one closes on a run of one and never on a backtick sitting
    // inside a longer run, so the three here are TEXT: read otherwise, the line came back as two spans and the run
    // between them was gone from the screen.
    expect(bare(`bloc ${CODE_TICK} ${FENCE}${BLOCK_INFO}x ${CODE_TICK}`)).toBe(
      `bloc ${FENCE}${BLOCK_INFO}x`
    );
  });

  it("closes a LONGER opening run on a run of the same length, never on a shorter one", () => {
    const pair = CODE_TICK.repeat(2);
    expect(bare(`${pair}a${CODE_TICK}b${pair}`)).toBe(`a${CODE_TICK}b`);
  });

  it("leaves an opening run that never meets its match exactly as written", () => {
    // The near-miss, and it is the half a class of this shape gets wrong: a run with no closer of its length is not a
    // span at all, and backtracking onto a shorter run inside it would invent one.
    expect(bare(`${FENCE}${BLOCK_INFO}x`)).toBe(`${FENCE}${BLOCK_INFO}x`);
    expect(bare(`${FENCE}a${CODE_TICK}`)).toBe(`${FENCE}a${CODE_TICK}`);
  });

  it("never crosses a CELL, which is the inline context a row is split into first", () => {
    // A span is looked for on the line the layout already drew, so the columns of a row sit on it side by side. A run
    // that found its closer two columns further along ate both delimiters and the separator between them, and the two
    // cells came back merged: the fold and the padding were computed on a line nobody could read back.
    const row = `${CELL_MARK}a${CODE_TICK}b${CELL_MARK} | ${CELL_MARK}c${CODE_TICK}d${CELL_MARK}`;
    expect(bare(row)).toBe(row);
  });

  it("never crosses a STACKED row either, each one being a screen row of its own", () => {
    const stacked = `${CODE_TICK}a${STACK_MARK}b${CODE_TICK}`;
    expect(bare(stacked)).toBe(stacked);
  });

  it("still reads a span WITHIN one cell, which is the whole point of stopping at its edge", () => {
    expect(bare(`${CELL_MARK}a${CODE_TICK}b${CODE_TICK}c${CELL_MARK}`)).toBe(
      `${CELL_MARK}abc${CELL_MARK}`
    );
  });

  it("spends the ONE padding space at each end, and only where both are there", () => {
    // What lets a span open or close on a backtick of its own. One space, never a trim: the rest is the author's.
    expect(bare(`${CODE_TICK}  x  ${CODE_TICK}`)).toBe(" x ");
    expect(bare(`${CODE_TICK} x${CODE_TICK}`)).toBe(" x");
    expect(bare(`${CODE_TICK} ${CODE_TICK}`)).toBe(" ");
  });

  it("renders a code span in the pinned accent", () => {
    expect(renderCode("run `it`")).toContain(ESC);
    expect(renderCode("run it")).toBe("run it");
  });
});

// The one hole in a deliberately closed module. What it has to prove is the BOUNDARY: the vocabulary leaves, the ink
// never does.
describe("the enumeration of tag names", () => {
  it("carries the engine's own names and hands back no sequence at all", () => {
    const names = tagNames();
    expect(names).toContain("pass");
    expect(names).toContain("dim");
    // The near-miss that matters: a listing that leaked its values would be caught here and nowhere else.
    expect(names.some((n) => n.includes(ESC))).toBe(false);
  });

  it("carries a name a host registered, since a catalogue of a VERSION would miss what an install added", () => {
    const name = "catalogueprobe";
    expect(tagNames()).not.toContain(name);
    extendTags({ [name]: `${ESC}[35m` });
    expect(tagNames()).toContain(name);
  });

  it("keeps a host's name out of the enumeration a GENERATED file may state", () => {
    // The other half of the pair above, and the reason there are two: what a committed file can say is true of a
    // VERSION, so a name this process registered a second ago must not reach it.
    const name = "builtinprobe";
    extendTags({ [name]: `${ESC}[35m` });
    expect(builtinTagNames()).not.toContain(name);
    expect(builtinTagNames()).toContain("pass");
    expect(tagNames()).toContain(name);
  });

  it("states the derived forms as a RULE rather than listing them, since any colour suffixes into one", () => {
    // A cap or a bg resolves on demand, so enumerating the results could never be complete: a host colour registered a
    // second ago carries them too.
    const name = "suffixprobe";
    extendTags({ [name]: rgb(10, 20, 30) });
    expect(TAG_SUFFIXES.length).toBeGreaterThan(0);
    for (const suffix of TAG_SUFFIXES) {
      expect(isTag(name + suffix)).toBe(true);
      expect(tagNames()).not.toContain(name + suffix);
    }
  });
});
