// The views the TARBALL ships, rendered through the real engine. A suite for a PATH,
// not for a module, so it lives here rather than beside anything.
//
// It exists because the shipped templates once crossed the whole ladder with no suite
// able to go red on what they DRAW: examples.test.ts drives examples/, load.test.ts only
// asks whether a bundled view resolves.
//
// Width is a fixed NUMBER (first in the resolution order), so no env var, probe or
// terminal reaches the render.

import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "../../src/pipeline.js";
import { renderDiagram } from "../../src/diagram.js";
import { ANSI_RE, RESET_MARK, renderTags, tagMark } from "../../src/style.js";
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
/** The FENCED way in: the kind is a FIELD, a fence carrying no attributes. */
const band = (tone?: string, type?: string, text: string = CONTENT): string =>
  lines(
    BLOCK_HINT + "banner",
    ...(tone == null ? [] : [`tone: ${tone}`]),
    ...(type == null ? [] : [`type: ${type}`]),
    `content: ${text}`,
    FENCE
  );

/** Spelled the way a model writes it, never through a production constant: a shared spelling catches no drift in it. */
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
/** What the banner draws between the word and the message. Furniture, so the template owns it and exports nothing. */
const SEPARATOR = "|";

describe("the banner the package ships", () => {
  // Cap and fill must name the SAME colour: `36` against `46`, `38;5;208` against `48;5;208`. A cap carrying BOLD is
  // the defect coming back, bold being what moves a base-sixteen foreground off its own slot.
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
    // These two LEFT the base range. Their band used to fill with slots 44 and 45, whose
    // pixels belong to the theme, so the ink beside them was a guess: on a terminal painting
    // 44 a light periwinkle it came out bright white on near-white. An index is measurable,
    // so the ink and the code span inside both derive now, like the four below.
    blue: { cap: "38;5;20", fill: "1;97;48;5;20" },
    magenta: { cap: "38;5;127", fill: "1;97;48;5;127" },
    // Named indices, whose chip and cap BOTH derive from the index: one line each in the
    // palette, and the ink measured rather than picked. Light fills take black, dark
    // ones white, which is the only decision a derived chip makes.
    purple: { cap: "38;5;141", fill: "1;30;48;5;141" },
    navy: { cap: "38;5;25", fill: "1;97;48;5;25" },
    brown: { cap: "38;5;130", fill: "1;97;48;5;130" },
    lime: { cap: "38;5;154", fill: "1;30;48;5;154" },
  };
  const RESET = "0";
  // Private-use codepoints, so an editor shows a blank and a hand retyping the line loses them unseen. Named here
  // because the template owns them and exposes them to nothing: a `.view` is read, never imported.
  const CAP_LEFT = "\u{E0B6}";
  const CAP_RIGHT = "\u{E0B4}";
  const open = (seq: string): string => `\x1b[${seq}m`;

  it("wraps a half-circle INSIDE each cap span, which is the whole of what makes a band a pill", () => {
    // The case the sequence assertions below cannot make: they read the ANSI stream, and a
    // cap span that opens a colour and closes it over NOTHING satisfies them exactly as a
    // filled one does. That defect shipped. So the glyph is pinned where it lives, between
    // the sequence that colours it and the reset that ends it.
    for (const [tone, { cap }] of Object.entries(BANDS)) {
      const drawn = render(band(tone));
      expect({ tone, head: drawn.includes(open(cap) + CAP_LEFT + open(RESET)) }).toEqual({ tone, head: true });
      expect({ tone, tail: drawn.includes(open(cap) + CAP_RIGHT + open(RESET)) }).toEqual({ tone, tail: true });
    }
    // And they are the OUTER edges: a half-circle anywhere else is furniture inside the band.
    const printed = plainly(render(band()));
    expect(printed.startsWith(CAP_LEFT)).toBe(true);
    expect(printed.endsWith(CAP_RIGHT)).toBe(true);
  });

  it("caps every filled band in the foreground painting that band's own fill", () => {
    for (const [tone, { cap, fill }] of Object.entries(BANDS)) {
      // The leading reset is emitted even on a band that fits: one line is written, and it cannot know it will wrap.
      // The fill twice over is the fold's doing: the label and the separator are two painted zones so the hole between
      // them can exist at all, and back to back they draw as one band.
      expect({ tone, seqs: seqs(render(band(tone))) }).toEqual({
        tone,
        seqs: [RESET, cap, RESET, fill, fill, RESET, cap, RESET],
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
    const [, cap, , fill] = seqs(render(band("chip")));
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

  it("draws the NEUTRAL band for a name carrying no pixels, never caps around nothing", () => {
    // A cap is half a pill: with no band to extend, two solid glyphs sat around bare text and the whole thing read as
    // broken. That was pinned here as a category error not worth answering, on the belief that `b` was the only name
    // able to reach it. `box_title` reaches it too, and that one an author does write: on a dark terminal it is a
    // base-sixteen bright slot, pixels the theme owns, so no chip derives from it either.
    //
    // So the surface slots fall to the neutral instead. The template asked for something to draw ON, and the pill is
    // the palette's answer for a surface with no colour opinion.
    for (const weightless of ["b", "box_title"]) {
      expect({ tone: weightless, seqs: seqs(render(band(weightless))) }).toEqual({
        tone: weightless,
        seqs: seqs(render(band("chip"))),
      });
      expect(render(band(weightless)).replace(ANSI_RE, "")).toContain(CONTENT);
    }
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

  it("stays ONE line while it fits, which is what makes the caps read as a pill", () => {
    expect(plainly(render(band("error"))).split("\n")).toHaveLength(1);
  });

  describe("a band wider than the width", () => {
    const TONE = "warning";
    const { cap, fill } = BANDS[TONE];
    const WORD = "mot";
    // In words the greedy fill can break between: one unbreakable token would pin the hard-split path instead.
    const LONG = Array.from({ length: 40 }, () => WORD).join(" ");
    const rows = (): string[] => render(band(TONE, undefined, LONG)).trimEnd().split("\n");

    it("wraps at OUR width rather than the terminal's", () => {
      expect(rows().length).toBeGreaterThan(1);
      for (const row of rows()) expect(printedWidth(row)).toBeLessThanOrEqual(options.width);
    });

    it("leaves the LABEL's columns bare on a continuation, and resumes the fill under the separator", () => {
      // Asserted IN ORDER, reset included: spaces are there either way, and only the terminal knows what background
      // was still standing when it printed them.
      const [first, ...rest] = rows();
      expect(rest.length).toBeGreaterThan(0);
      expect(first.startsWith(open(RESET) + open(cap) + CAP_LEFT + open(RESET) + open(fill))).toBe(true);
      // The arc, the word, the space and the separator: everything the first row draws before the blank it hangs from.
      const hole = 1 + printedWidth(NOTE_WORD) + 1 + SEPARATOR.length;
      for (const row of rest) {
        expect(row.startsWith(open(RESET) + " ".repeat(hole) + open(fill))).toBe(true);
      }
    });

    it("resumes the fill one column PAST the separator, and the text still lines up", () => {
      const printed = rows().map((r) => r.replace(ANSI_RE, ""));
      const column = printed[0].indexOf(SEPARATOR);
      expect(column).toBeGreaterThan(0);
      // Everything up to and including the separator's cell is bare; the fold paints the blank after it alone.
      const body = column + SEPARATOR.length + 1;
      for (const row of printed.slice(1)) {
        expect(row.slice(0, body)).toBe(" ".repeat(body));
        expect(row[body]).not.toBe(" ");
      }
      expect(printed[0][body]).not.toBe(" ");
    });

    it("draws ONE opening arc and no closing one, a rectangle having no rounded end to give", () => {
      const printed = rows().map((r) => r.replace(ANSI_RE, ""));
      expect(printed[0].startsWith(CAP_LEFT)).toBe(true);
      for (const row of printed.slice(1)) expect(row).not.toContain(CAP_LEFT);
      // The band that FITS keeps both, which is the whole of what the tail mark decides.
      expect(printed.join("")).not.toContain(CAP_RIGHT);
      expect(plainly(render(band(TONE))).endsWith(CAP_RIGHT)).toBe(true);
    });

    it("squares every row to the SAME width, so the block is a rectangle and not a staircase", () => {
      const drawn = rows();
      expect(drawn.length).toBeGreaterThan(1);
      for (const row of drawn) expect(printedWidth(row)).toBe(options.width);
      // Closed at the end of each row: a fill left open is painted to the terminal's own edge by any terminal that
      // erases to end of line, and the rectangle grows a ragged right edge nothing here can see.
      for (const row of drawn) expect(row.endsWith(renderTags(RESET_MARK))).toBe(true);
    });

    it("carries the whole message across the rows it took", () => {
      const printed = rows()
        .map((r) => r.replace(ANSI_RE, "").trim())
        .join(" ");
      expect(printed.split(WORD).length - 1).toBe(LONG.split(" ").length);
      expect(printed).toContain(NOTE_WORD);
    });
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
    // and a bare `ⓘ NOTE` stood in its place. Refused on the SHAPE (render.ts): the
    // banner declares it takes a quote, and a table is not one, whatever its cells say.
    const msg = lines("@{view:banner}", "| a | b |", "| --- | --- |", "| k | v |", "");
    expect(render(msg)).toBe(msg);
  });

  it("refuses the table even when its first cell SPELLS the field the banner spends", () => {
    // The leak the shape rule closed: a two-column table reads as named fields too, so
    // `| content | ... |` used to feed the one view that only ever promised to take a
    // quote. The form decides now, and field names can no longer talk their way in.
    const msg = lines("@{view:banner}", "| a | b |", "| --- | --- |", "| content | hello |", "");
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
  /** Dashes and the bars they run past: a divider carrying the columns through rather than cutting them. */
  const DASH = "─";
  const isRule = (line: string): boolean =>
    line.length > 0 && [...line].every((g) => g === DASH || g === BAR);
  const DIM = "2";
  const TEAL = "38;5;37"; // what the template's own @tone resolves to, an INDEXED colour and so free of the weight
  const YELLOW = "1;33";
  const RESET = "0";
  const BOLD = "1"; // the weight the header carries BESIDE its ink, an index taking none of its own

  const table = (deco: string, ...rows: string[]): string =>
    lines(deco, "| | |", "| --- | --- |", ...rows, "");
  const ROW = "| Status | all green |";
  const MSG = table("@{view:columns}", ROW);

  it("splits the two columns on the bar, with no frame of any kind around them", () => {
    const out = render(MSG);
    const plain = plainly(out);
    expect(plain).toBe(`Status  ${BAR}  all green`);
    // The container is BARE, so no outline. No rule either, for its own reason: one entry has nothing to divide.
    for (const frame of ["╭", "╰", DASH]) expect(plain).not.toContain(frame);
    // The bar and nothing else. Where a column is read DOWNWARDS, what names it is its header, so the ink sits there
    // and a body row carries none of its own.
    expect(seqs(out)).toEqual([DIM, RESET]);
  });

  it("rules BETWEEN its entries and never after the last one", () => {
    // Without it, two entries whose content folded read as one block of four rows. A rule after the LAST would
    // divide nothing, and the bare container's blank-run collapsing is what takes it back off.
    const three = table("@{view:columns}", ROW, "| Build | compiles |", "| Deploy | red |");
    expect(plainly(render(three)).split("\n").map(isRule)).toEqual([false, true, false, true, false]);
  });

  it("pads the label column so the bars line up, and continues an empty label", () => {
    const rows = plainly(
      render(table("@{view:columns}", ROW, "| Build | compiles |", "| | and more |"))
    ).split("\n");
    // ONE column for every bar, rule rows included: the vertical runs the whole height, never cut and never moved.
    const at = rows.map((l) => l.indexOf(BAR));
    expect(new Set(at).size).toBe(1);
    expect(at[0]).toBeGreaterThan(0);
    // A blank label CONTINUES the entry above, so no rule may part the two.
    expect(rows[rows.length - 1].trimStart().startsWith(BAR)).toBe(true);
    expect(isRule(rows[rows.length - 2])).toBe(false);
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

  it("wears one dim bar per gap at every width, and no ink of its own on a body", () => {
    // The furniture is the bars and nothing else. A width that opened a colour, or left one hanging, would show here
    // as an extra sequence.
    for (let n = MIN_COLUMNS; n <= MAX_COLUMNS; n++) {
      const gaps = Array.from({ length: n - 1 }, () => [DIM, RESET]).flat();
      expect(seqs(render(wide(n)))).toEqual(gaps);
    }
  });

  it("draws the table's own HEADER above the rows when it says something", () => {
    // What used to be lost: the header line was read for its column count and thrown away, so an author who titled
    // their columns saw those words nowhere. Toned, because a column is read DOWNWARDS from the word that names it.
    const msg = lines("@{view:columns}", "| Largeur | Verdict |", "| --- | --- |", "| 4 | tient |", "");
    const drawn = plainly(render(msg)).split("\n");
    expect(drawn[0]).toBe(`Largeur  ${BAR}  Verdict`);
    // Its own rule, since the loop's falls BETWEEN entries and would leave the header glued to the first.
    expect(isRule(drawn[1])).toBe(true);
    expect(drawn[2]).toBe(`4        ${BAR}  tient`);
    expect(seqs(render(msg)).slice(0, 2)).toEqual([BOLD, TEAL]);
  });

  /** `wide`, with its header cells NAMED, so the ink the head row draws in is readable. */
  const titled = (n: number): string =>
    lines(
      "@{view:columns}",
      ...[(i: number) => `h${i + 1}`, () => "---", (i: number) => `c${i + 1}`].map(
        (fill) => `|${Array.from({ length: n }, (_, i) => ` ${fill(i)} |`).join("")}`
      ),
      ""
    );

  it("carries the ink AND the weight across the WHOLE header row, never its first cell alone", () => {
    // The ink is RE-OPENED after every bar, and that is not belt-and-braces: the bar's own closer is a full reset, so
    // an ink opened once at the head of the line dies on the first separator and every cell after it reads plain.
    //
    // Counted rather than compared whole, and that is deliberate: a cell CLOSES its own ink so the bar after it cannot
    // inherit, which puts that closer at the head of the next cell's lead, and a hollow column keeps the closer while
    // dropping the lead around it (substitute.ts). A narrow table therefore carries redundant resets, inert on screen.
    // Pinning the byte stream would pin that artefact; what is pinned here is the contract it must not break.
    for (let n = MIN_COLUMNS; n <= MAX_COLUMNS; n++) {
      const s = seqs(render(titled(n)).split("\n")[0]);
      expect(s.filter((code) => code === TEAL)).toHaveLength(n); // one per cell, never the first alone
      expect(s.filter((code) => code === BOLD)).toHaveLength(n); // the weight rides along, cell for cell
      expect(s.filter((code) => code === DIM)).toHaveLength(n - 1); // one bar per gap
      expect(s.slice(0, 2)).toEqual([BOLD, TEAL]);
    }
  });

  it("closes the ink BEFORE each bar, so a separator is never painted in the header's colour", () => {
    // The defect this pins: `{{dim}}` opened while the ink is still open draws the bar dimmed in THAT colour instead
    // of the grey the box draws its sides with, and the furniture then reads as loud as the words it separates.
    for (let n = MIN_COLUMNS; n <= MAX_COLUMNS; n++) {
      const s = seqs(render(titled(n)).split("\n")[0]);
      s.forEach((code, i) => {
        if (code === DIM) expect(s[i - 1]).toBe(RESET);
      });
    }
  });

  it("draws no header at all for the blank one markdown forces on a table wanting none", () => {
    expect(plainly(render(MSG)).split("\n")[0]).toBe(`Status  ${BAR}  all green`);
  });

  it("hands back the raw markdown one column past the ceiling", () => {
    // The fail-open the whole carrier is built on: too wide to draw is still a valid
    // table, and the reader gets the one markdown already renders.
    expect(render(wide(MAX_COLUMNS + 1))).toBe(wide(MAX_COLUMNS + 1));
  });

  it("answers the kind, because it SPENDS the tone slot, and changes nothing else", () => {
    // The slot moved WITH the ink: the header is what spends it now, so the kind is answered on a table that has one.
    const headed = (deco: string): string =>
      lines(deco, "| Etat | Detail |", "| --- | --- |", ROW, "");
    const warned = render(headed("@{view:columns, type:warning}"));
    expect(seqs(warned).filter((code) => code === YELLOW)).toHaveLength(2); // both header cells, and nothing else
    expect(seqs(warned)).not.toContain(TEAL); // the kind REPLACES the default, never joins it
    expect(plainly(warned)).toBe(plainly(render(headed("@{view:columns}")))); // colour is the ONLY difference
  });

  it("says NOTHING of its kind on a table with no header, which is what moving the ink there costs", () => {
    // Written down rather than discovered: the ink names the columns, and a table wanting no header (`| | |`) has
    // nowhere to carry it. `type:` then changes not one sequence, where the label column used to answer for it. Flip
    // this case the day the body is given a fallback; until then it is the honest price of the rule.
    const warned = render(table("@{view:columns, type:warning}", ROW));
    expect(seqs(warned)).toEqual([DIM, RESET]);
    expect(warned).toBe(render(MSG)); // not merely the same words: the very same bytes
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
  const TEAL = "38;5;37"; // what the template's own @tone resolves to, an INDEXED colour and so free of the weight
  const YELLOW = "1;33";
  const RESET = "0";
  const BOLD = "1"; // the weight @head draws in, so a header never reads as a row

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

  it("draws the table's own header with a rule of its own under it", () => {
    // The loop's @rule falls BETWEEN elements, so nothing there can divide the header from the first one. Two @head
    // lines is what puts a rule exactly where this view needs one.
    const msg = lines("@{view:lines}", "| Etat | Detail |", "| --- | --- |", "| Status | all green |", "");
    const drawn = plainly(render(msg)).split("\n");
    expect(drawn[0]).toBe("Etat    Detail");
    expect(drawn[1].startsWith(DASH)).toBe(true);
    expect(drawn[2]).toBe("Status  all green");
  });

  it("carries the weight across the WHOLE header row, never its first cell alone", () => {
    // One span PER CELL and not one across the line, though this view separates its columns with blanks and a single
    // span would cover them all. The reason is the screen rather than the bytes: a weight spanning the padding between
    // cells reached the reader on its first cell only, where a cell that opens its own is drawn for every one of them.
    for (let n = MIN_COLUMNS; n <= MAX_COLUMNS; n++) {
      const cells = Array.from({ length: n }, (_, i) => `h${i + 1}`);
      const row = `|${cells.map((_, i) => ` c${i + 1} |`).join("")}`;
      const head = `|${cells.map((c) => ` ${c} |`).join("")}`;
      const delim = `|${cells.map(() => " --- |").join("")}`;
      const drawn = render(lines("@{view:lines}", head, delim, row, "")).split("\n")[0];
      expect(seqs(drawn).filter((code) => code === BOLD)).toHaveLength(n);
      for (const c of cells) expect(drawn).toContain(`\x1b[${BOLD}m${c}`); // every cell, its own opener
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
    // The rule is furniture and never spends the slot: only the label answers the kind. The weight rides in FRONT of
    // the ink on every label, so the kind changes the colour and leaves that weight where it was.
    expect(seqs(warned)).toEqual([BOLD, YELLOW, RESET, RULE_TAG, RESET, BOLD, YELLOW, RESET]);
    expect(seqs(render(MSG)).slice(0, 2)).toEqual([BOLD, TEAL]);
    expect(plainly(warned)).toBe(plainly(render(MSG))); // colour is the ONLY difference
  });

  it("continues the element above on an empty label, the way columns.view and box.view do", () => {
    // This was the documented COST of ruling inside the loop, and it is paid off: an item opening no entry is not one
    // a divider may part.
    const rows = plainly(render(table("@{view:lines}", ROWS[0], "| | and more |"))).split("\n");
    expect(rows[1].startsWith(DASH)).toBe(false);
    expect(rows[1].trim()).toBe("and more");
  });

  it("refuses a QUOTE payload outright, exactly as the columns view does", () => {
    const msg = lines("@{view:lines}", "> [!WARNING]", "> no rows here", "");
    expect(render(msg)).toBe(msg);
  });
});

// The only bundled view that FRAMES, and the only one reading the table's header row as
// something other than the names of its columns: the frame's title and its badge. So most
// of what follows pins that reading, which nothing else in the engine can see.
describe("the box view the package ships", () => {
  const GUTTER = "▎"; // the same glyph quote.view spends, because wrap.ts redraws that one
  const THIN = "│"; // what the columns PAST the frange are split by, the glyph columns.view draws
  const TITLE = "TL;DR";
  const BADGE = "session 3";
  const DASH = "─";

  /** Asked of the palette, never spelled: `box_title` alone turns over with the terminal. */
  const ink = (...tags: string[]): string => tags.map((t) => renderTags(tagMark(t))).join("");

  const box = (deco: string, head: string, ...rows: string[]): string =>
    lines(deco, head, "| --- | --- |", ...rows, "");
  const HEAD = `| ${TITLE} | |`;
  const ROWS = ["| SAID | the retry test is fixed |", "| NEXT | bump the patch version |"];
  const MSG = box("@{view:box}", HEAD, ...ROWS);
  /** Every line carrying an element, which is every line the bar stands on. */
  const barred = (out: string): string[] =>
    plainly(out)
      .split("\n")
      .filter((l) => l.includes(GUTTER));

  it("reads the header row as the FRAME, its two ends and nothing between them", () => {
    const drawn = plainly(render(box("@{view:box}", `| ${TITLE} | ${BADGE} |`, ...ROWS))).split("\n");
    expect(drawn[0]).toContain(BADGE); // set into the top rule, near the corner
    expect(drawn[1]).toContain(TITLE); // its own row, inside the border
    expect(drawn[1]).not.toContain(GUTTER); // and never an element of the list
    expect(drawn[2].includes(DASH)).toBe(true);
    expect(barred(render(MSG))).toHaveLength(ROWS.length);
  });

  it("paints the label and the bar together, and the text never", () => {
    // The whole tone contract of this view: ONE colour per box. A slot reaching the content column would recolour
    // words the model wrote, which is the seam only a template may cross.
    const drawn = render(box("@{view:box, tone:cyan}", HEAD, ROWS[0]));
    const cyan = seqs(ink("cyan"))[0];
    const row = drawn.split("\n").find((l) => l.includes(GUTTER)) as string;
    expect(seqs(row).filter((c) => c === cyan)).toHaveLength(2);
    expect(plainly(drawn)).toBe(plainly(render(box("@{view:box}", HEAD, ROWS[0])))); // colour is the ONLY difference
  });

  it("draws grey by default, the weight in FRONT of the ink as the label column always is", () => {
    expect(render(MSG)).toContain(`${ink("b", "dim")}SAID`);
  });

  it("continues a section on an empty label, where lines.view would rule between them", () => {
    // The reason the two differ: this view divides with a BAR down the margin, and a bar is what a continuation keeps.
    const rows = barred(render(box("@{view:box}", HEAD, ROWS[0], "| | and more |")));
    expect(rows).toHaveLength(2);
    const at = rows[0].indexOf(GUTTER);
    expect(rows[1].indexOf(GUTTER)).toBe(at); // same column, so the two read as one section
    expect(rows[1].slice(0, at).replace("│", "").trim()).toBe("");
    expect(rows[1]).toContain("and more");
  });

  it("sets EVERY row off with one blank line, and leaves none trailing the last", () => {
    // A blank per row, dropped to one and popped at the end by the container's own collapsing, which is the whole
    // reason the template can emit it unconditionally.
    const body = (out: string): string[] =>
      plainly(out)
        .split("\n")
        .slice(3, -1) // the top rule, the title and the rule under it, then the bottom border
        .map((l) => l.replaceAll("│", "").trim());
    expect(body(render(MSG))).toEqual([
      "SAID  ▎ the retry test is fixed",
      "",
      "NEXT  ▎ bump the patch version",
    ]);
  });

  it("glues a CONTINUATION to the entry above, the blank falling where a section ends", () => {
    // The other half of the rule above: the blank sets off ENTRIES, and a continuation is not one. So the two rows
    // read as one section here, and the blank still stands between this section and the next.
    const drawn = plainly(
      render(box("@{view:box}", HEAD, ROWS[0], "| | and more |", ROWS[1]))
    ).split("\n");
    const at = drawn.findIndex((l) => l.includes("and more"));
    expect(drawn[at - 1]).toContain("retry test"); // glued to the row it continues
    expect(drawn[at + 1].replaceAll("│", "").trim()).toBe(""); // and the next section still set off
  });

  it("draws a box whose rows carry NO label dense, having one section and nothing to part", () => {
    const body = plainly(render(box("@{view:box}", HEAD, "| | first |", "| | second |")))
      .split("\n")
      .slice(3, -1) // the top rule, the title and the rule under it, then the bottom border
      .map((l) => l.replaceAll("│", "").trim());
    expect(body).toHaveLength(2);
    expect(body.some((l) => l === "")).toBe(false);
  });

  it("folds a long line inside the border and redraws the bar on the fold", () => {
    // What the frame buys over a bare container: outside one nothing wraps, and the fold restarts at the margin with
    // no bar, which is the documented cost of quote.view.
    const long = "mot ".repeat(40).trim();
    const drawn = plainly(render(box("@{view:box}", HEAD, `| SAID | ${long} |`)));
    const rows = barred(drawn);
    expect(rows.length).toBeGreaterThan(1);
    for (const l of drawn.split("\n")) expect(printedWidth(l)).toBeLessThanOrEqual(options.width);
    const at = rows[0].indexOf(GUTTER);
    for (const l of rows.slice(1)) {
      expect(l.indexOf(GUTTER)).toBe(at);
      expect(l.slice(0, at).replace("│", "").trim()).toBe(""); // the label is blanked, the bar is not
    }
  });

  it("hangs the fold on the template's OWN bar, never on one the message wrote", () => {
    // What `bullet=""` buys, and it prints nothing: an explicit boundary. Without it the prefix is inferred and reaches
    // the LAST bar of the line, so a bar in the model's text is promoted to furniture and redrawn down the block.
    const long = `un texte ${GUTTER} avec une barre dedans ` + "mot ".repeat(20);
    const rows = barred(render(box("@{view:box}", HEAD, `| SAID | ${long} |`)));
    expect(rows.length).toBeGreaterThan(1);
    for (const l of rows.slice(1)) expect(l.split(GUTTER)).toHaveLength(2);
  });

  it("keeps a long TITLE out of the label column, which it no longer heads", () => {
    // The header joins the measurement only where the loop DRAWS it. Here it is the frame, so a long one widens the
    // box and leaves every element where it was.
    const LONG = "a title longer than any label here";
    const at = (out: string): number[] => barred(out).map((l) => l.indexOf(GUTTER));
    expect(at(render(box("@{view:box}", `| ${LONG} | |`, ...ROWS)))).toEqual(at(render(MSG)));
  });

  it("takes every width the carrier hands it, the bar right after the label", () => {
    // The frange sets the LABEL off from the rest, so it falls at the second column whatever the arity.
    for (let n = MIN_COLUMNS; n <= MAX_COLUMNS; n++) {
      const cells = Array.from({ length: n }, (_, i) => `c${i + 1}`);
      const row = `|${cells.map((c) => ` ${c} |`).join("")}`;
      const head = `|${cells.map(() => " |").join("")}`;
      const delim = `|${cells.map(() => " --- |").join("")}`;
      const drawn = barred(render(lines("@{view:box}", head, delim, row, "")));
      // The frange right after the label, and the thin split columns.view draws between the columns past it.
      const sep = (i: number): string => (i === 1 ? `  ${GUTTER} ` : `  ${THIN}  `);
      expect(drawn[0]).toContain(cells.map((c, i) => (i === 0 ? c : sep(i) + c)).join(""));
    }
  });

  it("draws its title row even for the blank header markdown forces, a box having one", () => {
    // The documented cost, pinned so it cannot change in silence: `| | |` is a table wanting no header, and this view
    // frames all the same. lines.view is the one that draws nothing there.
    const drawn = plainly(render(box("@{view:box}", "| | |", ROWS[0]))).split("\n");
    expect(drawn[1].replaceAll("│", "").trim()).toBe("");
    expect(drawn[2]).toContain(DASH);
  });

  it("refuses a QUOTE payload outright, exactly as the two other table views do", () => {
    const msg = lines("@{view:box}", "> [!WARNING]", "> no rows here", "");
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

  it("carries the bar through a paragraph break, the row blank beside it", () => {
    // A bare `>` between two paragraphs, which markdown itself draws as a gap in the quote.
    const plain = plainly(render(quote("@{view:quote}", "premiere", "", "seconde")));
    expect(plain).toBe(`${GUTTER} premiere\n${GUTTER} \n${GUTTER} seconde`);
  });

  it("KEEPS the rows the author wrote, each one under its own bar", () => {
    // Two `>` lines are two lines on screen, as they are in the markdown this falls back to.
    // The bar prefixes ONE line, so every row past the first is REDRAWN from it (wrap.ts).
    const plain = plainly(render(quote("@{view:quote}", "premiere moitie", "seconde moitie")));
    expect(plain).toBe(`${GUTTER} premiere moitie\n${GUTTER} seconde moitie`);
  });

  it("FOLDS a sentence wider than the screen, the bar redrawn on every row it takes", () => {
    // What `@box bare` buys. Left to the terminal's own soft wrap, the second row starts at the margin with no bar, and
    // the block stops reading as one quote exactly when it grows long enough to need to.
    const long = "une remarque assez longue pour depasser la largeur donnee ici et devoir se replier sur trois rangs entiers";
    const drawn = render(quote("@{view:quote}", long)).split("\n").filter((l) => l.trim() !== "");
    expect(drawn.length).toBeGreaterThan(1);
    for (const row of drawn) {
      expect(plainly(row).startsWith(GUTTER)).toBe(true);
      expect(printedWidth(row)).toBeLessThanOrEqual(options.width);
      expect(seqs(row)).toEqual([DIM, RESET]); // the ink of the bar, reopened and closed per row
    }
    // Folded, never cut: the sentence comes back whole out of the rows it was dealt into.
    expect(drawn.map((r) => plainly(r).slice(GUTTER.length).trim()).join(" ")).toBe(long);
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

  it("draws under a line no parser claims, this view having nothing a payload could feed", () => {
    // The counterpart of the case above, and the whole point of the pair: a TABLE announces itself and is claimed,
    // where a plain line announces nothing. A rule is furniture with no slot to fill, so text written straight under
    // it is text, and refusing to draw would cost the author the one thing the line was for.
    const out = render(lines("@{view:hr}", "État de l'arbre : 44 fichiers.", ""));
    const rows = plainly(out).split("\n");
    expect(rows[0]).toBe(DASH.repeat(options.width));
    expect(rows[1]).toBe("État de l'arbre : 44 fichiers.");
  });
});

describe("the mermaid view the package ships", () => {
  const UNDER = "sous le schema";
  const DECORATOR = "@{view:mermaid}";
  const MERMAID_OPEN = FENCE + "mermaid";
  const SOURCE_ROWS = ["flowchart TD", "    A[source] --> B[render]", "    B --> C[ecran]"];
  const SOURCE = SOURCE_ROWS.join("\n");
  const MSG = lines(DECORATOR, MERMAID_OPEN, ...SOURCE_ROWS, FENCE);
  // Its own state dir, so a draw crossing the whole engine never writes into the one a real session uses.
  const drawDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-bundled-diagram-"));
  const drawOptions = { ...options, stateDir: drawDir };
  const draw = (msg: string): string => transform(msg, undefined, true, undefined, drawOptions);
  afterAll(() => fs.rmSync(drawDir, { recursive: true, force: true }));

  // The renderer is a SUBPROCESS and installing it IS the feature's activation, so a machine without it
  // stands these down rather than failing a suite for a binary it never claimed to have. The refusals
  // below hold either way, an absent renderer never being what they observe, and they stay outside.
  const DRAWS = ((): boolean => {
    try {
      renderDiagram(SOURCE, options.width, drawDir);
      return true;
    } catch {
      return false;
    }
  })();

  describe.runIf(DRAWS)("with the renderer installed", () => {
    it("crosses the whole engine with every row of the drawing intact, fence and decorator consumed", () => {
      // Asked of the module that draws it rather than spelled here, a drawing being the one value
      // in this package no test could restate without becoming a copy of the renderer.
      expect(plainly(draw(MSG)).split("\n")).toEqual(
        plainly(renderDiagram(SOURCE, options.width, drawDir)).split("\n")
      );
    });

    it("carries the renderer's OWN paint through and adds not one sequence of its own", () => {
      // What replaced the tone this template used to declare, and it is the stronger claim: a
      // colour named in the source says something about the graph, so the engine has to hand it
      // over untouched. A scope of its own would die on the drawing's first reset anyway, which
      // reads as a tone that silently does nothing.
      expect(seqs(draw(MSG))).toEqual(seqs(renderDiagram(SOURCE, options.width, drawDir)));
    });

    it("leaves ONE blank line under it, which is what every other view leaves", () => {
      // The template ends on its last row with no closing newline, and this is what says so: the
      // day an editor puts that newline back, the diagram floats a second blank line over the prose.
      const rows = plainly(
        draw(lines(DECORATOR, MERMAID_OPEN, ...SOURCE_ROWS, FENCE, "", UNDER, ""))
      ).split("\n");
      expect(rows[rows.length - 1]).toBe(UNDER);
      expect(rows[rows.length - 2]).toBe("");
      expect(rows[rows.length - 3]).not.toBe("");
    });
  });

  it("hands the zone back AS WRITTEN where the renderer refuses to draw it", () => {
    // The fail-open every view has, and the only one whose fallback is still a diagram elsewhere:
    // what stays on screen is a bare ```mermaid fence that a transcript or a forge draws natively,
    // the decorator line one harmless line of prose above it. Holds with no renderer at all, an
    // absent one being exactly the refusal this catches.
    const PROSE = "ceci est une phrase, pas un diagramme";
    const msg = lines(DECORATOR, MERMAID_OPEN, PROSE, FENCE);
    expect(draw(msg)).toBe(msg);
  });

  it("refuses the retired view:mermaid fence outright, showing the block as written", () => {
    // The one carrier this view REFUSES on principle: `view:mermaid` is an info string no forge
    // recognises, so drawing it would reward the exact form whose fallback is debris. The engine
    // throws (a diagram arrives under its own fence), and fail-open keeps every byte on screen.
    const msg = lines(BLOCK_HINT + "mermaid", ...SOURCE_ROWS, FENCE);
    expect(draw(msg)).toBe(msg);
  });

  it("refuses a table and a quote under its decorator: the fence is the ONLY data format", () => {
    for (const msg of [
      lines(DECORATOR, "| src | dessin |", "| --- | --- |", `| content | ${SOURCE_ROWS[0]} |`),
      lines(DECORATOR, "> flowchart TD"),
    ]) {
      expect(draw(msg)).toBe(msg);
    }
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
