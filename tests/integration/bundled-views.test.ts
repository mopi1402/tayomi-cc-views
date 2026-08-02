// The views the TARBALL ships, rendered through the real engine. A suite for a PATH,
// not for a module, so it lives here rather than beside anything.
//
// Its reason for existing is a defect it could not catch until it did. banner.view drew
// its caps with {{tone}}, the class's TEXT colour, against a band filled with that
// class's chip: bold promotes a base-sixteen foreground to the bright slot and nothing
// promotes a background, so the caps were one shade off the band they capped, in every
// theme that separates the two. Nothing was red. examples.test.ts drives examples/, and
// load.test.ts only asks whether a bundled view RESOLVES, so the shipped templates
// crossed the whole ladder with no suite that could go red on what they draw.
//
// Width is a fixed NUMBER (first in the resolution order), so no env var, probe or
// terminal reaches the render.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "../../src/pipeline.js";
import { ANSI_RE } from "../../src/style.js";
import { BLOCK_HINT, FENCE, VIEW_EXT } from "../../src/data/markup.js";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUNDLED = path.join(REPO, "views");
const options = { viewsPath: [BUNDLED], width: 60 };
const render = (msg: string): string => transform(msg, undefined, true, undefined, options);

const lines = (...rows: string[]): string => [...rows, ""].join("\n");
/** The sequences a render emitted, in order, each stripped of its ESC[ and its m. */
const seqs = (out: string): string[] =>
  (out.match(ANSI_RE) ?? []).map((s) => s.slice("\x1b[".length, -"m".length));
const plainly = (out: string): string => out.replace(ANSI_RE, "").trim();

const CONTENT = "contenu de la bande";
/**
 * The FENCED way in: the kind is a FIELD, because a fence carries no attributes. This is
 * the one-off form, for a kind the packaged table has no entry for.
 */
const band = (tone?: string, type?: string): string =>
  lines(
    BLOCK_HINT + "banner",
    ...(tone == null ? [] : [`tone: ${tone}`]),
    ...(type == null ? [] : [`type: ${type}`]),
    `content: ${CONTENT}`,
    FENCE
  );

/**
 * The DECORATED way in, spelled the way a model writes it and not through any production
 * constant: a test sharing the spelling of the token it drives cannot catch a drift in
 * it. The trailing blank line is the rule a quote lives under, and it is written here on
 * purpose rather than hidden in the helper's tail.
 */
const quoted = (marker: string | null, ...attrs: string[]): string =>
  lines(
    `@{view:banner${attrs.map((a) => `, ${a}`).join("")}}`,
    ...(marker === null ? [] : [`> [!${marker}]`]),
    `> ${CONTENT}`,
    ""
  );

/** The words the packaged table declares for the kinds asserted below. */
const WARNING_WORD = "⚠ WARNING";
const NOTE_WORD = "ⓘ NOTE";

describe("the banner the package ships", () => {
  /**
   * Each class a band can wear, its cap and the chip that fills it. The pair is the
   * contract the template states in writing ("caps matching the fill"), and the two
   * columns must name the SAME colour: `36` against a `46` fill, `38;5;208` against a
   * `48;5;208` one. A cap carrying the bold attribute is the defect coming back, since
   * bold is exactly what moves a base-sixteen foreground off its own slot.
   */
  const BANDS: Record<string, { cap: string; fill: string }> = {
    info: { cap: "36", fill: "1;30;46" },
    warning: { cap: "33", fill: "1;30;43" },
    error: { cap: "31", fill: "1;97;41" },
    success: { cap: "32", fill: "1;30;42" },
    high: { cap: "31", fill: "1;97;41" },
    med: { cap: "38;5;208", fill: "1;30;48;5;208" },
    low: { cap: "38;5;250", fill: "30;48;5;250" },
    gold: { cap: "38;5;220", fill: "1;30;48;5;220" },
    cyan: { cap: "36", fill: "1;30;46" },
    dim: { cap: "38;5;250", fill: "30;48;5;250" },
    blue: { cap: "34", fill: "1;97;44" },
    magenta: { cap: "35", fill: "1;97;45" },
    chip: { cap: "38;5;231", fill: "1;38;5;16;48;5;231" },
    // Named indices, whose chip and cap BOTH derive from the index: one line each in the
    // palette, and the ink measured rather than picked. Light fills take black, dark
    // ones white, which is the only decision a derived chip makes.
    purple: { cap: "38;5;141", fill: "1;30;48;5;141" },
    navy: { cap: "38;5;25", fill: "1;97;48;5;25" },
    brown: { cap: "38;5;130", fill: "1;97;48;5;130" },
    lime: { cap: "38;5;154", fill: "1;30;48;5;154" },
  };
  const RESET = "0";

  it("caps every filled band in the foreground painting that band's own fill", () => {
    for (const [tone, { cap, fill }] of Object.entries(BANDS)) {
      expect({ tone, seqs: seqs(render(band(tone))) }).toEqual({
        tone,
        seqs: [cap, RESET, fill, RESET, cap, RESET],
      });
    }
  });

  it("dresses an undecorated band as chip, the documented default", () => {
    // The neutral is the WHITE chip, not cyan: an unmarked band says nothing about
    // severity, and painting it a severity's colour would say something it does not mean.
    expect(seqs(render(band()))).toEqual(seqs(render(band("chip"))));
  });

  it("degenerates on a WEIGHT, the last name with no colour to fill from, and says so", () => {
    // A cap is half a pill: with no band to extend, two solid glyphs sit around bare
    // text and the whole thing reads as broken. That is what `tone:gold` looked like
    // before a chip derived from every colour, and a weight is all that can still reach
    // it: `b` carries no colour at all, so nothing about it can be measured. Pinned
    // rather than fixed, because naming a weight as a band's tone is a category error
    // the palette cannot answer, and fail-open still shows every field.
    const BOLD = "1";
    expect(seqs(render(band("b")))).toEqual([BOLD, RESET, BOLD, RESET, BOLD, RESET]);
    expect(render(band("b")).replace(ANSI_RE, "")).toContain(CONTENT);
  });

  it("falls THROUGH a class the palette does not know, rather than losing the band", () => {
    const plain = plainly(render(band("not_a_palette_name")));
    expect(plain).toContain(NOTE_WORD);
    expect(plain).toContain(CONTENT);
  });

  it("prints its word and its content, and no unsubstituted placeholder", () => {
    const plain = plainly(render(band("warning", "warning")));
    expect(plain).toContain(WARNING_WORD);
    expect(plain).toContain(CONTENT);
    expect(plain).not.toContain("${");
    expect(plain).not.toContain("{{");
  });

  it("stays ONE line, which is what makes the caps read as a pill", () => {
    expect(plainly(render(band("error"))).split("\n")).toHaveLength(1);
  });
});

// ONE file for every kind, which is the whole ticket: the marked quote is the cheap way
// in and the fenced block the one-off, and neither may load a template of its own.
describe("the banner reached through a marked quote", () => {
  it("takes its word from the packaged table and its colour from the kind", () => {
    const out = render(quoted("WARNING"));
    expect(plainly(out)).toContain(WARNING_WORD);
    expect(plainly(out)).toContain(CONTENT);
    expect(seqs(out)).toEqual(seqs(render(band("warning"))));
  });

  it("takes the reserved entry and the neutral chip with NO marker at all", () => {
    const out = render(quoted(null));
    expect(plainly(out)).toContain(NOTE_WORD);
    expect(seqs(out)).toEqual(seqs(render(band("chip"))));
  });

  it("ECHOES a kind the table never heard of, and falls to the template's own tone", () => {
    const out = render(quoted("VERSION2"));
    // Declared entries are verbatim; this one is not declared, so the marker's own token
    // comes back uppercased rather than the band losing its word.
    expect(plainly(out)).toContain("VERSION2");
    expect(seqs(out)).toEqual(seqs(render(band("chip"))));
  });

  it("lets the MARKER beat a type: attribute, the payload outranking the token", () => {
    const out = render(quoted("WARNING", "type:error"));
    expect(plainly(out)).toContain(WARNING_WORD);
    expect(seqs(out)).toEqual(seqs(render(band("warning"))));
  });

  it("still lets tone: dress it, since a look is the more explicit word", () => {
    expect(seqs(render(quoted("VERSION2", "tone:success")))).toEqual(seqs(render(band("success"))));
  });

  it("draws the SAME band as the fenced form carrying the same two fields", () => {
    // The two ways in differ in what the AUTHOR types and in nothing else. A drift here
    // is the packaged template growing a branch on how its data arrived.
    expect(plainly(render(quoted("WARNING")))).toBe(plainly(render(band(undefined, "warning"))));
  });

  it("refuses a TABLE payload outright, rather than swallowing it behind a band", () => {
    // The banner reads `content`, a table hands it `rows`, and it draws a filled band
    // with two caps whatever it was given. That furniture is what made the ink test read
    // a pill around nothing as a successful render: the table vanished from the screen
    // and a bare `ⓘ NOTE` stood in its place. A view refuses a payload shape by not
    // reading it, and nothing was added to banner.view to enforce that.
    const msg = lines("@{view:banner}", "| a | b |", "| --- | --- |", "| k | v |", "");
    expect(render(msg)).toBe(msg);
  });

  it("refuses a fenced block whose fields it reads none of, the same way", () => {
    const msg = lines(BLOCK_HINT + "banner", "label: a word it no longer reads", FENCE);
    expect(render(msg)).toBe(msg);
  });

  it("ships no typed file for any kind, which is the file count this ticket bought", () => {
    const typed = fs
      .readdirSync(BUNDLED)
      .filter((f) => f.startsWith("banner.") && f !== `banner${VIEW_EXT}`);
    expect(typed).toEqual([]);
  });
});

describe("the welcome the package ships", () => {
  // The health check the README sends a new user to, and the last view on every search
  // path. A directive that stops resolving here breaks the one thing a user runs first.
  const BLOCK = lines(BLOCK_HINT + "welcome", FENCE);

  it("draws its frame and substitutes everything it declares", () => {
    const plain = render(BLOCK).replace(ANSI_RE, "");
    expect(plain).not.toContain("${");
    expect(plain).not.toContain("{{");
    expect(plain.trim().split("\n").length).toBeGreaterThan(1);
  });

  it("colours what it draws, so a hook that fired is visible as such", () => {
    expect(seqs(render(BLOCK)).length).toBeGreaterThan(0);
  });
});
