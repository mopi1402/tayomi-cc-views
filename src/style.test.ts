// The palette and the {{tag}} shape: the only module allowed to know what a colour is.
//
// The rules with teeth are the ones about what is NOT a tag. An unknown name reaches the screen verbatim (so the
// measurer must agree it costs columns), a brace written by a MESSAGE is neutralised (so data can never open a colour
// the render meant to keep), and a host's registration is total (a throw at startup once killed a whole display).

import { describe, it, expect } from "vitest";
import {
  ANSI_RE,
  CHIP_CHROME,
  CODE_RE,
  RESET_MARK,
  RESUME_MARK,
  TAG_RE,
  TAG_SOURCE,
  TAG_SUFFIXES,
  ansi256,
  chip,
  dropInert,
  extendTags,
  fillTone,
  inert,
  isTag,
  markCode,
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
/**
 * A tag that is a WEIGHT and not a colour, so nothing about it is measurable and no chip can be derived for it. The
 * last name the fallback still answers for.
 */
const FURNITURE = "b";
/** Every colour a tone may name, which is every name that MUST be able to fill. */
const COLOURS = [
  "red", "green", "yellow", "blue", "magenta", "cyan", "orange", "gold", "dim", "key",
  "purple", "violet", "pink", "teal", "aqua", "lime", "brown", "navy", "salmon", "mint",
  // Furniture fills too, now that a chip derives: only `box_title` stays out, being a base-sixteen slot (bright white)
  // rather than a colour this process can measure.
  "chip", "title", "code", "box_rule",
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
    // spelled would end a span and close a colour the template opened, which is the one thing neutralising exists to
    // make impossible.
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
// derives. Clearing at its right edge takes the rest of the line down with it, and no template author can compensate
// for that: the line has no idea where the model will put a backtick or a `**`.
describe("a span the ENGINE inserted", () => {
  /** The sequence a tag renders as, asked of the module that owns it. */
  const seq = (name: string): string => renderTags(tagMark(name));
  /** The same, for the closing tag, whose name style.ts keeps private. */
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
    // And the public renderCode, which a host spends on a line of its own, agrees with it to the byte while handing
    // back sequences rather than markup.
    expect(renderCode(line)).toBe(renderTags(markCode(line)));
    expect(renderCode(line)).not.toContain(tagMark(CODE));
    // SELF-CONTAINED, and that is why it is not derived from the pair above: nothing else on the host's line is read as
    // markup on the way past.
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
    // The defect the opening mark exists for. A resume that popped one entry handed the line back the body's last tag
    // instead of the style the span interrupted, and the body of a code span is anything up to the closing tick, a
    // template's tags included.
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

  it("spends the foreground for a class with no filled variant, never a hole", () => {
    // FURNITURE, which is what the fallback is left with: every colour a tone may plausibly name carries a chip,
    // because a template may spend one as a surface.
    expect(isTag(FURNITURE)).toBe(true);
    expect(isTag(FURNITURE + BG)).toBe(false);
    expect(fillTone(tagMark(TONE_CHIP), FURNITURE)).toBe(tagMark(FURNITURE));
  });

  it("sends the CAP of an unfilled class to that same foreground, so the two agree", () => {
    expect(isTag(FURNITURE + CAP)).toBe(false);
    expect(fillTone(tagMark(TONE_CAP), FURNITURE)).toBe(tagMark(FURNITURE));
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
    // The requirement behind the table: a template may spend the chip as a SURFACE and draw against it, and a colour
    // with no chip leaves it framing nothing. Only furniture and a host's own foreground are allowed to reach the
    // fallback.
    for (const cls of COLOURS) {
      expect({ cls, bg: isTag(cls + BG), cap: isTag(cls + CAP) }).toEqual({
        cls,
        bg: true,
        cap: true,
      });
    }
  });
});

describe("a cap, the foreground painting a chip's own fill", () => {
  /**
   * Every class a band can wear, and the foreground its chip's fill derives to. This table IS the defect: the caps used
   * to spend `{{tone}}`, which is bold, and a terminal promotes a bold base-sixteen FOREGROUND to the bright slot while
   * nothing promotes a background. Same palette entry, two shades on screen.
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
    blue: `${ESC}[34m`,
    magenta: `${ESC}[35m`,
    // The white chip: its cap is the WHITE it fills with, never the black it writes in.
    chip: `${ESC}[38;5;231m`,
  };

  it("matches the fill of every class a band can wear, none of them bold", () => {
    for (const [cls, expected] of Object.entries(FILLED)) {
      expect(renderTags(tagMark(cls + CAP))).toBe(expected);
    }
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
    // The whole boundary in one case: `31` names a slot, and what a terminal paints there is loaded from a theme this
    // process cannot read. No ink can be chosen for it, so the palette declares those chips by hand and this returns
    // nothing.
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
   * The two SGR introducers the builders exist to spell, and the only two the engine can MEASURE a chip and a cap from.
   * Written out once here because this is the sidecar where the shape is the contract; everywhere else they are
   * composed, never retyped.
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

  it("states the derived forms as a RULE rather than listing them, since any colour suffixes into one", () => {
    // A cap or a bg resolves on demand, so enumerating the results could never be complete: the suffixes are what a
    // reader needs, and they are the same two the resolver strips.
    // Some of these forms ARE listed, being explicit entries; the point is that being listed is not what makes them
    // resolve. A host colour registered a second ago carries them too, which is why a reader is handed the suffixes
    // rather than a list that could never be complete.
    const name = "suffixprobe";
    extendTags({ [name]: rgb(10, 20, 30) });
    expect(TAG_SUFFIXES.length).toBeGreaterThan(0);
    for (const suffix of TAG_SUFFIXES) {
      expect(isTag(name + suffix)).toBe(true);
      expect(tagNames()).not.toContain(name + suffix);
    }
  });
});
