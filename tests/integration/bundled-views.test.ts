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

import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "../../src/pipeline.js";
import { ANSI_RE } from "../../src/style.js";
import { printedWidth } from "../../src/layout/measure.js";
import { BLOCK_HINT, FENCE, VIEW_EXT } from "../../src/data/markup.js";
import { MAX_COLUMNS, MIN_COLUMNS } from "../../src/data/language.js";

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

  it("caps the NEUTRAL band with its own fill, whichever way round the terminal put it", () => {
    // Out of the table above, and the only class that has to be: every other entry there is a HUE, the same band on
    // either screen, where the neutral turns over with the terminal (a near-white pill is a bright band on a dark
    // screen and nothing at all on a light one). Naming its sequences here would be a copy of a value style.ts owns.
    // The template's contract survives as a relation, and it is the whole of what this case is for: the cap names an
    // index, and the band FILLS with that same index.
    const CAP_INDEX = "38;5;";
    const FILL_INDEX = "48;5;";
    const PARAM = ";";
    const [cap, , fill] = seqs(render(band("chip")));
    expect(cap.startsWith(CAP_INDEX)).toBe(true);
    const index = cap.slice(CAP_INDEX.length);
    expect(fill.endsWith(FILL_INDEX + index)).toBe(true);
    // And the ink is the OTHER end, or the pill is a band written in the colour it is filled with.
    expect(fill).not.toContain(`${CAP_INDEX}${index}${PARAM}`);
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

// The other packaged consumer of the decorated table, and the counterpart of the banner:
// where a band reads `content`, this one reads `rows`. Its whole contract on screen is a
// bar between two columns and NOTHING around it, so a border or a title appearing here is
// the defect this suite exists to catch.
describe("the columns view the package ships", () => {
  /** The glyph `box.ts` draws its sides with, and the dim it wears, both spelled here on purpose. */
  const BAR = "│";
  const DIM = "2";
  const KEY = "1;36"; // what the template's own @tone resolves to
  const YELLOW = "1;33";
  const RESET = "0";

  const table = (deco: string, ...rows: string[]): string =>
    lines(deco, "| | |", "| --- | --- |", ...rows, "");
  const ROW = "| Status | all green |";
  const MSG = table("@{view:columns}", ROW);

  it("splits the two columns on the bar, with no frame of any kind around them", () => {
    const out = render(MSG);
    const plain = plainly(out);
    expect(plain).toBe(`Status  ${BAR}  all green`);
    // Every glyph the box would add, absent: this view draws furniture and nothing else.
    for (const frame of ["╭", "╰", "─"]) expect(plain).not.toContain(frame);
    expect(seqs(out)).toEqual([KEY, RESET, DIM, RESET]);
  });

  it("pads the label column so the bars line up, and continues an empty label", () => {
    const plain = plainly(render(table("@{view:columns}", ROW, "| Build | compiles |", "| | and more |")));
    const at = plain.split("\n").map((l) => l.indexOf(BAR));
    expect(new Set(at).size).toBe(1); // one column for every bar
    expect(at[0]).toBeGreaterThan(0);
    expect(plain.split("\n")[2].trimStart().startsWith(BAR)).toBe(true); // no label on the third row
  });

  /** A payload of `n` columns, its cells numbered so the ORDER they land in is readable. */
  const wide = (n: number): string =>
    lines(
      "@{view:columns}",
      ...[() => "", () => "---", (i: number) => `c${i + 1}`].map(
        (fill) => `|${Array.from({ length: n }, (_, i) => ` ${fill(i)} |`).join("")}`
      ),
      ""
    );

  it("draws every width from two to four columns, one bar between each pair", () => {
    for (let n = MIN_COLUMNS; n <= MAX_COLUMNS; n++) {
      const cells = Array.from({ length: n }, (_, i) => `c${i + 1}`);
      expect(plainly(render(wide(n)))).toBe(cells.join(`  ${BAR}  `));
    }
  });

  it("wears the same colours at every width: the tone once, then one dim bar per gap", () => {
    // The furniture is the label's tone and nothing else. A width that opened a second
    // colour, or left one hanging, would show here as an extra sequence.
    for (let n = MIN_COLUMNS; n <= MAX_COLUMNS; n++) {
      const gaps = Array.from({ length: n - 1 }, () => [DIM, RESET]).flat();
      expect(seqs(render(wide(n)))).toEqual([KEY, RESET, ...gaps]);
    }
  });

  it("hands back the raw markdown one column past the ceiling", () => {
    // The fail-open the whole carrier is built on: too wide to draw is still a valid
    // table, and the reader gets the one markdown already renders.
    expect(render(wide(MAX_COLUMNS + 1))).toBe(wide(MAX_COLUMNS + 1));
  });

  it("answers the kind, because it SPENDS the tone slot, and changes nothing else", () => {
    const warned = render(table("@{view:columns, type:warning}", ROW));
    expect(seqs(warned)).toEqual([YELLOW, RESET, DIM, RESET]);
    expect(plainly(warned)).toBe(plainly(render(MSG))); // colour is the ONLY difference
  });

  it("refuses a QUOTE payload outright, the mirror of the banner refusing a table", () => {
    // It reads `rows`; a quote hands it `content`. Nothing enforces that, and nothing has
    // to: a view refuses a payload shape by not reading it, and the raw markdown shows.
    const msg = lines("@{view:columns}", "> [!WARNING]", "> no rows here", "");
    expect(render(msg)).toBe(msg);
  });
});

// columns.view turned through ninety degrees: the same payload, the same alignment, and
// the separator drawn under each element instead of between the two cells. What this block
// exists to catch is the pair drifting apart, so most of it is stated AGAINST the columns
// view rather than on its own.
describe("the lines view the package ships", () => {
  /** The glyph `box.ts` draws every rule with, and the tag it paints them in. */
  const DASH = "─";
  const RULE_TAG = "38;5;238"; // {{box_rule}}
  const BAR = "│"; // what this view must never draw
  const KEY = "1;36"; // what the template's own @tone resolves to
  const YELLOW = "1;33";
  const RESET = "0";

  const table = (deco: string, ...rows: string[]): string =>
    lines(deco, "| | |", "| --- | --- |", ...rows, "");
  const ROWS = ["| Status | all green |", "| Deploy | staging is red |"];
  const MSG = table("@{view:lines}", ...ROWS);
  const ruled = (out: string): string[] =>
    plainly(out)
      .split("\n")
      .filter((l) => l.startsWith(DASH));

  it("rules BETWEEN its elements and draws no vertical anything, which is the whole inversion", () => {
    // Two elements, ONE rule. The template draws a divider under every item; the container's blank-run collapsing is
    // what drops the one trailing the last, and that is the difference between separating and closing.
    const plain = plainly(render(MSG));
    expect(plain.split("\n")).toEqual([
      "Status  all green",
      DASH.repeat(printedWidth("Deploy  staging is red")),
      "Deploy  staging is red",
    ]);
    expect(plain).not.toContain(BAR);
    for (const frame of ["╭", "╰", "│"]) expect(plain).not.toContain(frame);
  });

  it("takes every width the carrier hands it, separated by blanks and never by a bar", () => {
    // Widened for the same reason columns.view was: the carrier now claims up to four
    // columns, and a middle one this view did not declare would be dropped in silence.
    for (let n = MIN_COLUMNS; n <= MAX_COLUMNS; n++) {
      const cells = Array.from({ length: n }, (_, i) => `c${i + 1}`);
      const row = `|${cells.map((c) => ` ${c} |`).join("")}`;
      const head = `|${cells.map(() => " |").join("")}`;
      const delim = `|${cells.map(() => " --- |").join("")}`;
      const plain = plainly(render(lines("@{view:lines}", head, delim, row, "")));
      expect(plain).toBe(cells.join("  "));
      expect(plain).not.toContain(BAR);
    }
  });

  it("fills the rule to the body it divides, never to the terminal", () => {
    // The bare container keeps the box's own width law. A rule running past its body would be furniture louder than
    // what it separates, and a rule that ignored the body would be the fixed run this view shipped before.
    const wide = ruled(transform(MSG, undefined, true, undefined, { viewsPath: [BUNDLED], width: 200 }));
    expect(wide).toEqual(ruled(render(MSG)));
    expect(wide[0].length).toBe(printedWidth("Deploy  staging is red"));
  });

  it("folds a long content column and keeps the fold in its own column", () => {
    // The whole point of the container, and a case a suite fed only short rows cannot see: outside one, nothing here
    // wraps at all and the fold restarts at the margin, under the label.
    const long = "mot ".repeat(40).trim();
    const plain = plainly(render(table("@{view:lines}", `| Deploy | ${long} |`)));
    const rows = plain.split("\n");
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(printedWidth(row)).toBeLessThanOrEqual(options.width);
    const indent = rows[0].indexOf("mot");
    expect(indent).toBeGreaterThan(0);
    for (const row of rows.slice(1)) expect(row.startsWith(" ".repeat(indent))).toBe(true);
  });

  it("recolours the labels on a kind and leaves the rules alone", () => {
    const warned = render(table("@{view:lines, type:warning}", ...ROWS));
    // The rule is furniture and never spends the slot: only the label answers the kind.
    expect(seqs(warned)).toEqual([YELLOW, RESET, RULE_TAG, RESET, YELLOW, RESET]);
    expect(seqs(render(MSG))[0]).toBe(KEY);
    expect(plainly(warned)).toBe(plainly(render(MSG))); // colour is the ONLY difference
  });

  it("gives an empty label its own element, where columns.view would continue the row above", () => {
    // The documented cost of ruling inside the loop, pinned so it cannot change in silence.
    const rows = plainly(render(table("@{view:lines}", ROWS[0], "| | and more |"))).split("\n");
    expect(rows[1].startsWith(DASH)).toBe(true);
    expect(rows[2].trim()).toBe("and more");
  });

  it("refuses a QUOTE payload outright, exactly as the columns view does", () => {
    const msg = lines("@{view:lines}", "> [!WARNING]", "> no rows here", "");
    expect(render(msg)).toBe(msg);
  });
});

// The third consumer of the decorated QUOTE, and the one that shares a payload shape with
// the banner while drawing the opposite thing: where a band swallows its marker and prints
// the WORD, this one swallows the marker and prints nothing but the sentence. The two
// therefore have to be told apart on screen, which is what most of this block pins.
describe("the quote view the package ships", () => {
  /**
   * U+258E, and the reason it is this glyph and not the box's `│`: it is what `wrap.ts`
   * calls GUTTER_BAR, so a continuation row keeps the bar AND its colour. Spelled here
   * because the owner keeps it unexported, which is the one case a copy is allowed.
   */
  const GUTTER = "▎";
  const DIM = "2"; // what the template's own @tone resolves to
  const GOLD = "38;5;220";
  const YELLOW = "1;33";
  const RESET = "0";

  const SENTENCE = "une remarque qui tient sur une ligne";
  const quote = (deco: string, ...rows: string[]): string =>
    lines(deco, ...rows.map((r) => `> ${r}`), "");
  const MSG = quote("@{view:quote}", SENTENCE);

  it("draws the bar and the sentence, and no furniture of any kind", () => {
    const out = render(MSG);
    expect(plainly(out)).toBe(`${GUTTER} ${SENTENCE}`);
    // Every glyph a frame or a band would add, absent: the bar is the only decoration.
    // The last two are the banner's Powerline caps, the view that shares this payload shape.
    for (const drawn of ["╭", "╰", "─", "", ""]) {
      expect(plainly(out)).not.toContain(drawn);
    }
    expect(seqs(out)).toEqual([DIM, RESET]);
  });

  it("recolours the bar on `tone:` and changes nothing else about the line", () => {
    const gold = render(quote("@{view:quote, tone:gold}", SENTENCE));
    expect(seqs(gold)).toEqual([GOLD, RESET]);
    expect(plainly(gold)).toBe(plainly(render(MSG))); // colour is the ONLY difference
  });

  it("takes its colour from a marker and DROPS the word, which is what parts it from the banner", () => {
    const marked = render(quote("@{view:quote}", "[!WARNING]", SENTENCE));
    expect(seqs(marked)).toEqual([YELLOW, RESET]);
    // The band would print `⚠ WARNING` here off its @text table. This view carries no
    // table, so the kind reaches the screen as a colour and in no other way.
    expect(plainly(marked)).toBe(`${GUTTER} ${SENTENCE}`);
  });

  it("joins the quote's rows on ONE space, markdown's own soft-wrap semantics", () => {
    // Load-bearing rather than cosmetic: the bar prefixes ONE line, so a body arriving as
    // several would leave every row after the first with no bar at all.
    const plain = plainly(render(quote("@{view:quote}", "premiere moitie", "seconde moitie")));
    expect(plain).toBe(`${GUTTER} premiere moitie seconde moitie`);
  });

  it("refuses a TABLE payload outright, the mirror of the columns view refusing a quote", () => {
    const msg = lines("@{view:quote}", "| a | b |", "| --- | --- |", "| x | y |", "");
    expect(render(msg)).toBe(msg);
  });
});

// The smallest view in the package, and the only one whose whole contract is that it takes
// NOTHING: no payload, no field, no kind. What that buys is a decorator line on its own,
// and what it costs is pinned here too, since nothing else in the engine can see it.
describe("the hr view the package ships", () => {
  const DASH = "─";
  const RULE_TAG = "38;5;238"; // {{box_rule}}
  const RESET = "0";
  const MSG = lines("@{view:hr}", "");

  it("draws one rule the width of the terminal, from a decorator line alone", () => {
    // The one view here that reads its LIMIT rather than its content, because it has none.
    const out = render(MSG);
    expect(plainly(out)).toBe(DASH.repeat(options.width));
    expect(seqs(out)).toEqual([RULE_TAG, RESET]);
  });

  it("follows the width it is given, which is the whole reason it is not literal dashes", () => {
    const at = (width: number): string =>
      plainly(transform(MSG, undefined, true, undefined, { viewsPath: [BUNDLED], width }));
    expect(at(60)).toBe(DASH.repeat(60));
    expect(at(140)).toBe(DASH.repeat(140));
  });

  it("ignores a kind, because a rule is furniture and says nothing about the message", () => {
    // The same decision lines.view makes, where a kind recolours the labels and never the
    // rules between them. Stated here because this view has nothing else a kind could touch.
    expect(render(lines("@{view:hr, type:warning}", ""))).toBe(render(MSG));
    expect(render(lines("@{view:hr, tone:gold}", ""))).toBe(render(MSG));
  });

  it("draws its rule between prose, without disturbing either side", () => {
    const out = render(lines("above", "", "@{view:hr}", "", "below", ""));
    const rows = plainly(out).split("\n");
    expect(rows[0]).toBe("above");
    expect(rows[rows.length - 1]).toBe("below");
    expect(rows.filter((r) => r.startsWith(DASH))).toHaveLength(1);
  });

  it("SWALLOWS a payload it was never meant to be given, which is why its header forbids one", () => {
    // Not a defect to fix here, and the sharpest edge in the package: a decorator claims its
    // zone, this template reads no field, so a table handed to it is consumed and never
    // drawn. "Raw over hollow" cannot catch it either, since it refuses a render that
    // resolved none of the data it SPENT substitutions on, and this one spends none.
    const eaten = render(lines("@{view:hr}", "| a | b |", "| --- | --- |", "| x | y |", ""));
    expect(plainly(eaten)).toBe(DASH.repeat(options.width));
    expect(plainly(eaten)).not.toContain("x");
  });

  it("prints raw under a line no parser claims, the loud half of the same trap", () => {
    const msg = lines("@{view:hr}", "---", "");
    expect(render(msg)).toBe(msg);
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

// The layout this engine exists for, composed from the shipped views rather than retyped: an art column on the left,
// a banner and the lines view drawn INSIDE the right one. It renders through the same pipeline as everything above,
// with the bundled corpus on the search path behind a temp dir holding the one composing template.
describe("a view composed of other views", () => {
  const WIDE = 100;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-compose-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  // The CALLER declares the split its included view iterates, and has to: the block's raw text is parsed ONCE, against
  // this template alone (render.ts), so `lines`'s own @fields never reaches the parse.
  fs.writeFileSync(
    path.join(dir, "compose" + VIEW_EXT),
    [
      "@fields rows label content",
      "@box",
      "@aside tayo",
      "@use banner",
      "@rule",
      "@use lines",
      "@endaside",
      "@endbox",
      "",
    ].join("\n")
  );

  const composed = (): string =>
    transform(
      lines(
        BLOCK_HINT + "compose",
        "type: warning",
        "content: deux suites instables",
        "rows:",
        "- Deploy  staging est rouge",
        "- Build  vert",
        FENCE
      ),
      undefined,
      true,
      undefined,
      { viewsPath: [dir, BUNDLED], width: WIDE }
    );

  const ART = "▀";

  it("draws each included view INSIDE the column, beside the art", () => {
    const rows = plainly(composed()).split("\n");
    for (const text of ["WARNING", "deux suites instables", "Deploy", "staging est rouge"]) {
      const found = rows.filter((l) => l.includes(text));
      expect(found).toHaveLength(1);
      expect(found[0]).toContain(ART);
    }
  });

  it("leaves no include and no slot standing", () => {
    const out = plainly(composed());
    expect(out).not.toContain("@use");
    expect(out).not.toContain("${");
    expect(out).not.toContain("{{");
  });

  it("keeps the frame whole, its corners one row each", () => {
    const rows = plainly(composed()).split("\n");
    expect(rows.filter((l) => l.includes("╭"))).toHaveLength(1);
    expect(rows.filter((l) => l.includes("╰"))).toHaveLength(1);
    for (const l of rows) expect(printedWidth(l)).toBeLessThanOrEqual(WIDE);
  });
});
