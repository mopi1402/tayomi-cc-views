// Wrapping a RENDERED line, which is not wrapping a string.
//
// The line already carries markup that costs no column, so every case here is one the naive split gets wrong: a tag cut
// in two, a code span left open, a bullet reprinted on every continuation, a wide glyph halved. The continuation's
// prefix is the other half of the module: a wrapped remainder has to read as the same section, which means keeping the
// gutter bar and blanking everything before it.

import { describe, it, expect } from "vitest";
import { FENCE, NL } from "../data/markup.js";
import { RESET_MARK, RESUME_MARK, SPAN_MARK, chip, tagMark } from "../style.js";
import { CELL_MARK, HANG_MARK, STACK_MARK, TAIL_MARK, VOID_MARK } from "./marks.js";
import { printedText, printedWidth } from "./measure.js";
import { foldText, stackCell, wrapLine } from "./wrap.js";

/** The section bar a template draws down its left margin; wrap.ts keeps it private. */
const BAR = "▎";
const TICK = "`";
const LIMIT = 20;
/** Under this the module refuses to wrap at all, rather than shred a line. */
const TOO_NARROW = 7;

const fits = (rows: string[], limit: number): boolean =>
  rows.every((r) => printedWidth(r) <= limit);

describe("when it declines to wrap", () => {
  it("leaves a line that already fits", () => {
    expect(wrapLine("short", LIMIT)).toEqual(["short"]);
  });

  it("leaves a line whole under a limit too narrow to be worth wrapping into", () => {
    const long = "far too long for this limit";
    expect(wrapLine(long, TOO_NARROW)).toEqual([long]);
  });

  it("leaves a line whose prefix eats the whole column, rather than emit letters", () => {
    const deep = " ".repeat(LIMIT - 2) + "some text that will not fit";
    expect(wrapLine(deep, LIMIT)).toEqual([deep]);
  });
});

// A break the AUTHOR wrote, which the fold honours wherever it falls. Its whole point is the prefix: a second line
// with no bar stops reading as the same quote, which is the bug the join was hiding.
describe("a line break in the text", () => {
  it("ends the row where it falls, even on a line that would have fit whole", () => {
    expect(wrapLine(`${BAR} one${NL}two`, LIMIT)).toEqual([`${BAR} one`, `${BAR} two`]);
  });

  it("folds each of its rows on its own, so a break and the fill compose", () => {
    const rows = wrapLine(`${BAR} alpha beta gamma delta${NL}epsilon`, LIMIT);
    expect(rows.length).toBeGreaterThan(2);
    expect(fits(rows, LIMIT)).toBe(true);
    expect(rows.every((r) => r.startsWith(BAR))).toBe(true);
    expect(rows[rows.length - 1]).toBe(`${BAR} epsilon`);
  });

  it("spends the break as a SPACE where the limit is too narrow to fold at all", () => {
    // The degraded reading, and the one thing it must never do is print the break itself.
    expect(wrapLine(`one${NL}two`, TOO_NARROW)).toEqual(["one two"]);
  });

  it("is a break foldText answers for on its own, prefix or no prefix", () => {
    expect(foldText(`one${NL}two`, LIMIT)).toEqual(["one", "two"]);
  });
});

describe("the fill", () => {
  it("breaks at a space, never inside a word", () => {
    const rows = wrapLine("alpha beta gamma delta", LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(fits(rows, LIMIT)).toBe(true);
    expect(rows.join(" ").split(/\s+/).filter(Boolean)).toEqual([
      "alpha",
      "beta",
      "gamma",
      "delta",
    ]);
  });

  it("hard-splits a token wider than the whole column, which must break somewhere", () => {
    const path = "a".repeat(LIMIT * 2);
    const rows = wrapLine(path, LIMIT);
    expect(fits(rows, LIMIT)).toBe(true);
    expect(rows.join("")).toBe(path);
  });

  it("keeps every glyph of a wide script whole", () => {
    const rows = wrapLine("仕様".repeat(20), LIMIT);
    expect(fits(rows, LIMIT)).toBe(true);
    expect(rows.join("")).not.toContain("�");
  });

  it("charges nothing for a tag, so a coloured line wraps at the same word", () => {
    const plain = "alpha beta gamma delta";
    const dressed = `${tagMark("b")}alpha${RESET_MARK} beta gamma delta`;
    const rows = wrapLine(dressed, LIMIT);
    expect(rows).toHaveLength(wrapLine(plain, LIMIT).length);
    expect(rows[0]).toContain(tagMark("b"));
  });

  it("charges nothing for a resume either, so no break point moves behind one", () => {
    const shed = (rows: string[], mark: string): string[] =>
      rows.map((r) => r.split(mark).join(""));
    const closed = `${tagMark("b")}alpha${RESET_MARK} beta gamma delta`;
    const resumed = `${tagMark("b")}alpha${RESUME_MARK} beta gamma delta`;
    expect(shed(wrapLine(resumed, LIMIT), RESUME_MARK)).toEqual(
      shed(wrapLine(closed, LIMIT), RESET_MARK)
    );
  });

  it("charges nothing for a resume on a row that is already FULL", () => {
    // The case the comparison above cannot see: it sheds the mark from both sides, so a mark costing a column would
    // only show where the row has no slack left to hide it.
    const full = "a".repeat(LIMIT);
    expect(wrapLine(`${full}${RESUME_MARK} b`, LIMIT)).toEqual([`${full}${RESUME_MARK}`, " b"]);
  });
});

describe("a code span the wrap cuts", () => {
  it("is closed on the first row and reopened on the next", () => {
    const rows = wrapLine(`text ${TICK}one two three four${TICK} tail`, LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      // An odd count would leave the terminal with an orphan delimiter.
      expect([...row].filter((c) => c === TICK).length % 2).toBe(0);
    }
  });

  it("hands back the line it was GIVEN where nothing folds, padding included", () => {
    // The atomiser rebuilds the line from its atoms, so anything it declines to emit is gone for good. The padding of
    // a span is markup it must CHARGE nothing for and DROP nothing of: spent here, the delimiter arrives flush against
    // its text further down and the span stops being a span at all.
    const padded = `${TICK} ${FENCE} ${TICK}`;
    expect(foldText(padded, LIMIT)).toEqual([padded]);
  });

  it("charges the backticks the span HOLDS, which the measurer beside it charges too", () => {
    // The two have to agree or the fold is computed on one width and the border padded to another. Only the
    // DELIMITERS cost nothing: an atomiser blind to that packed the run's own columns onto a row for free.
    const rows = foldText(`a ${TICK} ${FENCE}one ${TICK} bb cc dd ee ff`, LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(fits(rows, LIMIT)).toBe(true);
  });

  it("reopens the span with the run it was OPENED on, never with one backtick", () => {
    const pair = TICK.repeat(2);
    const rows = foldText(`${pair}one two three four five${pair}`, LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].endsWith(pair)).toBe(true);
    expect(rows[1].startsWith(pair)).toBe(true);
  });

  it("seals one space OFF the text, so a cut landing after a backtick the span HOLDS still parses", () => {
    // The near-miss that used to print: flush, the seal fused with the inner tick into a run of three, no closer
    // matched it, and the delimiters the fill had charged at nothing reached the screen, three columns past the border.
    const pair = TICK.repeat(2);
    const rows = foldText(`${pair} un ${TICK}mot${TICK} deux trois ${pair}`, 10);
    expect(rows.length).toBeGreaterThan(1);
    expect(fits(rows, 10)).toBe(true);
    expect(rows.map(printedText).join(" ")).toBe(`un ${TICK}mot${TICK} deux trois`);
  });

  it("reopens one space off too, for the cut landing right BEFORE a held backtick", () => {
    const pair = TICK.repeat(2);
    const rows = foldText(`${pair} un ${TICK}mot${TICK} fin ${pair}`, 6);
    expect(rows.length).toBeGreaterThan(1);
    expect(fits(rows, 6)).toBe(true);
    expect(rows.map(printedText).join(" ")).toBe(`un ${TICK}mot${TICK} fin`);
  });

  it("pads the flush span it rebuilds, one uncharged space the resolver strips back off", () => {
    // Every fragment of a cut span needs the pad at BOTH ends or the strip refuses it, and the seal's own pad would
    // print. Giving the flush span the padding CommonMark lets it omit costs nothing a reader sees: same text back,
    // same single column.
    const rows = foldText(`${TICK}x${TICK}`, LIMIT);
    expect(rows).toEqual([`${TICK} x ${TICK}`]);
    expect(printedWidth(rows[0])).toBe(1);
  });

  it("leaves a span of ONLY spaces flush, whose pads the strip would refuse and print", () => {
    const blank = `${TICK}  ${TICK}`;
    expect(foldText(blank, LIMIT)).toEqual([blank]);
  });

  it("folds a flush-written span and hands the resolver the same text back", () => {
    const pair = TICK.repeat(2);
    const rows = foldText(`${pair}alpha beta gamma${pair}`, 8);
    expect(rows.length).toBeGreaterThan(1);
    expect(fits(rows, 8)).toBe(true);
    expect(rows.map(printedText).join(" ")).toBe("alpha beta gamma");
  });
});

describe("the continuation's prefix", () => {
  it("keeps a plain indent, so a nested line stays nested", () => {
    const indent = "    ";
    const rows = wrapLine(indent + "alpha beta gamma delta epsilon", LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((r) => r.startsWith(indent))).toBe(true);
  });

  it("keeps the gutter bar and BLANKS the label before it", () => {
    const rows = wrapLine(`CHECKS ${BAR} alpha beta gamma delta`, LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]).toContain("CHECKS");
    expect(rows[1]).toContain(BAR);
    expect(rows[1]).not.toContain("CHECKS");
    // Blanked to the same width, so the bars line up in one column.
    expect(rows[1].indexOf(BAR)).toBe(rows[0].indexOf(BAR));
  });

  it("keeps the bar's own colour on the continuation", () => {
    const dressed = `${tagMark("dim")}${BAR}${RESET_MARK} alpha beta gamma delta`;
    const rows = wrapLine(dressed, LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[1]).toContain(tagMark("dim"));
  });

  it("keeps BOTH ends of a span in the prefix, the boundary as much as the terminator", () => {
    // A real chip sitting in the label, asked of the module that builds one. Drop the terminator and the fill runs on,
    // painting every continuation row out to the border. Drop the boundary and the terminator that survives it unwinds
    // the ROW's own tags instead of the chip's. Neither weighs a column, which is why these are cases and not notes:
    // nothing the measurer sees would ever report the loss. The chip sits AFTER a word, so neither mark is alone at the
    // edge of a part. A keep-list that splits on one and tests for the other would pass on an isolated mark and blank
    // this one, which is where a real label puts it.
    const dressed = `run ${chip("b", "OK")} ${BAR} alpha beta gamma delta`;
    const rows = wrapLine(dressed, LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[1]).toContain(SPAN_MARK);
    expect(rows[1]).toContain(tagMark("b"));
    expect(rows[1]).toContain(RESUME_MARK);
  });

  it("stops at the LAST bar, so a two-bar line hangs from the inner one", () => {
    const rows = wrapLine(`${BAR} LABEL ${BAR} alpha beta gamma delta`, LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect([...rows[1]].filter((c) => c === BAR)).toHaveLength(2);
    expect(rows[1]).not.toContain("LABEL");
  });
});

describe("a declared bullet", () => {
  const bulleted = (marker: string, text: string): string => marker + HANG_MARK + text;

  it("is consumed: the marker never reaches the screen", () => {
    const rows = wrapLine(bulleted("- ", "alpha beta gamma delta"), LIMIT);
    expect(rows.join("\n")).not.toContain(HANG_MARK);
  });

  it("prints once, and the continuation hangs under the text rather than repeating it", () => {
    const MARKER = "* ";
    const rows = wrapLine(bulleted(MARKER, "alpha beta gamma delta"), LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].startsWith(MARKER)).toBe(true);
    expect(rows[1].startsWith(" ".repeat(MARKER.length))).toBe(true);
    expect(rows.filter((r) => r.includes(MARKER))).toHaveLength(1);
  });

  it("wins over the inferred prefix, so a bullet AFTER a bar is not left in the text", () => {
    const rows = wrapLine(bulleted(`${BAR} - `, "alpha beta gamma delta"), LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[1]).toContain(BAR);
    expect(rows[1]).not.toContain("-");
  });
});

// Where blanking is not enough: a band opens its fill BEFORE its label, so a kept tag repaints the hole the fold was
// meant to leave. Left of the mark the prefix goes to bare columns, style and all.
describe("a voided head", () => {
  const LABEL = `${tagMark("dim")}LABEL${RESET_MARK}`;
  const voided = (text: string): string => `${LABEL}${VOID_MARK}${BAR} ${HANG_MARK}${text}`;

  it("is consumed: the mark never reaches the screen", () => {
    expect(wrapLine(voided("alpha beta gamma delta"), LIMIT).join("\n")).not.toContain(VOID_MARK);
  });

  it("drops the STYLE it voids, which is what parts it from blanking", () => {
    const rows = wrapLine(voided("alpha beta gamma delta"), LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]).toContain(tagMark("dim"));
    expect(rows[1]).not.toContain(tagMark("dim"));
  });

  it("opens the continuation on a RESET, since the row above left its own style standing", () => {
    const rows = wrapLine(voided("alpha beta gamma delta"), LIMIT);
    expect(rows[1].startsWith(RESET_MARK)).toBe(true);
  });

  it("keeps what sits AFTER the mark, blanked as usual, so the two columns still line up", () => {
    const rows = wrapLine(voided("alpha beta gamma delta"), LIMIT);
    expect(rows[1]).toContain(BAR);
    expect(printedWidth(rows[1].slice(0, rows[1].indexOf(BAR)))).toBe(printedWidth("LABEL"));
  });

  it("means nothing outside a prefix: a mark in the TEXT is stripped and changes no column", () => {
    const plain = wrapLine(`${BAR} alpha beta gamma delta epsilon`, LIMIT);
    const marked = wrapLine(`${BAR} alpha beta${VOID_MARK} gamma delta epsilon`, LIMIT);
    expect(marked.join("\n").split(VOID_MARK).join("")).toEqual(plain.join("\n"));
  });
});

// Closing furniture a fold has no use for: a rounded end belongs to a pill, and a block of rows is a rectangle.
describe("a declared tail", () => {
  const CLOSER = ")";
  const tailed = (text: string): string => `${BAR} ${HANG_MARK}${text}${TAIL_MARK}${CLOSER}`;

  it("is DRAWN while the line fits, the tail being furniture and not a hint", () => {
    const short = tailed("short");
    expect(wrapLine(short, LIMIT)).toEqual([short]);
  });

  it("is DROPPED the moment the line folds", () => {
    const rows = wrapLine(tailed("alpha beta gamma delta"), LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.join("\n")).not.toContain(CLOSER);
    expect(rows.join("\n")).not.toContain(TAIL_MARK);
  });

  it("squares every row to the limit, which is the whole point of dropping it", () => {
    const rows = wrapLine(tailed("alpha beta gamma delta"), LIMIT);
    for (const row of rows) expect(printedWidth(row)).toBe(LIMIT);
  });

  it("closes every row, or a fill left open is painted to the terminal's own edge", () => {
    const rows = wrapLine(tailed("alpha beta gamma delta"), LIMIT);
    for (const row of rows) expect(row.endsWith(RESET_MARK)).toBe(true);
  });

  it("changes nothing for a line that declares none, which is every other view", () => {
    const rows = wrapLine(`${BAR} ${HANG_MARK}alpha beta gamma delta`, LIMIT);
    expect(rows.some((r) => printedWidth(r) < LIMIT)).toBe(true);
  });
});

// The other half of the fold, and the one that answers for the DATA: a column too narrow for its value costs rows and
// never characters. Everything here would pass on a module that cut, except the reassembly.
describe("a stacked cell", () => {
  const CELL = 6;
  const VALUE = "far too long to fit";
  const stacked = stackCell(VALUE, CELL);
  /** The value read back off the rows it was dealt into, the one assertion a cut cannot satisfy. */
  const survives = (rows: string[], width: number): string =>
    rows
      .map((r) => r.slice(0, r.length - (printedWidth(r) - width)))
      .join("")
      .split(/\s+/)
      .join("");

  it("comes back PADDED and bracketed when the value fits, with no row to deal out", () => {
    const out = stackCell("ok", CELL);
    expect(printedWidth(out)).toBe(CELL);
    // Bracketed all the same: the marks say WHERE the column is, and only the stack mark says there are rows to deal.
    expect(out).toBe(CELL_MARK + "ok".padEnd(CELL) + CELL_MARK);
    expect(out).not.toContain(STACK_MARK);
  });

  it("brackets its rows when the value does not, every one of them the width of the column", () => {
    expect(stacked.startsWith(CELL_MARK)).toBe(true);
    expect(stacked.endsWith(CELL_MARK)).toBe(true);
    const rows = stacked.split(CELL_MARK)[1].split(STACK_MARK);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(printedWidth(row)).toBe(CELL);
    expect(survives(rows, CELL)).toBe(VALUE.split(" ").join(""));
  });

  it("is dealt ONE row per line, the columns after it blank on every row but the first", () => {
    const rows = wrapLine(`${stacked}  tail`, LIMIT);
    expect(rows).toHaveLength(stacked.split(STACK_MARK).length);
    expect(rows[0]).toContain("tail");
    for (const row of rows.slice(1)) expect(row).not.toContain("tail");
  });

  it("folds IN STEP with the prose beside it, never one after the other", () => {
    // The whole reason the rows travel on the line: dealt by the substituter instead, the cell's continuations would
    // stack up after the prose's, and the two columns would read as two paragraphs.
    const rows = wrapLine(`${stacked}  alpha beta gamma delta epsilon zeta`, LIMIT);
    expect(rows[1].slice(0, CELL).trim()).not.toBe("");
    expect(rows[1].slice(CELL).trim()).not.toBe("");
  });

  it("holds its column open with blanks once its rows run out, so nothing slides left", () => {
    const rows = wrapLine(`${stackCell("ab", CELL)}${stacked}  x`, LIMIT);
    const short = stackCell("ab", CELL);
    expect(short).not.toContain(STACK_MARK); // it fits: one row, and the cell beside it is the taller
    for (const row of rows) expect(row.indexOf(row.trim()[0])).toBeGreaterThanOrEqual(0);
    expect(rows.length).toBeGreaterThan(1);
    // The second row's tall cell sits where the first row's did, the short cell before it having become blanks.
    expect(rows[1].slice(0, CELL).trim()).toBe("");
  });

  it("FOLDS even where the line would fit, its rows being measured side by side", () => {
    // The early return reads a width, and a stacked line measures as wide as all of its rows laid end to end. Left to
    // that reading a short line would print every row of the cell on one screen row, which is the defect the marks
    // exist to prevent.
    const line = `${stackCell("abcdefgh", CELL)}|`;
    expect(printedWidth(line)).toBeLessThan(LIMIT);
    expect(wrapLine(line, LIMIT).length).toBeGreaterThan(1);
  });

  it("carries the SEPARATOR that follows it onto every row of the entry", () => {
    // The furniture between two columns belongs to the prefix, never to the text that flows: left in the flow it is
    // drawn on the first row of an entry and lost on every other, and the rule the table is read by is cut in half.
    // The glyph here is columns.view's, which is NOT the gutter bar: a keep-list naming one of the two left the other
    // falling with the label beside it.
    const PIPE = "│";
    const rows = wrapLine(`${stacked}  ${PIPE}  alpha beta gamma`, LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    // At the same column on every row, or the rule walks down the screen.
    expect(new Set(rows.map((r) => r.indexOf(PIPE))).size).toBe(1);
    expect(rows.every((r) => r.includes(PIPE))).toBe(true);
  });

  it("carries EVERY separator down, and not only the first one after it", () => {
    // The columns between the folded one and the prose are cells like any other, so their separators belong to the
    // prefix too. Read as flowing text they were drawn on the entry's first row alone.
    const PIPE = "│";
    const sep = `  ${PIPE}  `;
    const line = `${stacked}${sep}${stackCell("135", 3)}${sep}${stackCell("ok", 2)}${sep}a note`;
    const rows = wrapLine(line, LIMIT);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(row.split(PIPE).length - 1).toBe(3);
    // At the same three columns on every row, or a rule walks down the screen.
    const at = (r: string): number[] => [...r].flatMap((c, i) => (c === PIPE ? [i] : []));
    for (const row of rows) expect(at(row)).toEqual(at(rows[0]));
    // The columns the entry does not repeat are BLANK under their value, never a repetition of it.
    expect(rows[1].split(PIPE)[1].trim()).toBe("");
  });

  it("carries no mark onto the rows it is dealt into", () => {
    const rows = wrapLine(`${stacked}  tail`, LIMIT);
    for (const row of rows) {
      expect(row).not.toContain(CELL_MARK);
      expect(row).not.toContain(STACK_MARK);
    }
  });
});

// A fold is a boundary drawn through markup, and both halves have to stand on their own.
describe("a style the fold crosses", () => {
  it("is closed on the row that opens it and reopened on the next", () => {
    const rows = foldText(`${tagMark("b")}alpha beta gamma delta${RESET_MARK}`, 10);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[1]).toContain(tagMark("b"));
  });

  it("leaves no row unwinding a frame it never opened", () => {
    // The failure this catches is silent and one row long: a closer landing on a row whose opener stayed above it ends
    // the style the ROW was drawn in, and everything after it on that row prints plain.
    const rows = foldText(`${chip("b", "OK")} alpha beta gamma delta`, 10);
    for (const row of rows) {
      const opens = [...row].filter((c) => c === SPAN_MARK).length;
      const closes = [...row].filter((c) => c === RESUME_MARK).length;
      expect(closes).toBeLessThanOrEqual(opens);
    }
  });

  it("keeps every character, whatever the markup around it", () => {
    // The markup a row gains from the seal is exactly what the two cases above are about, so it comes OFF here: what
    // is left is the text, and the text has to be all of it.
    const bare = (s: string): string =>
      s
        .replace(/\{\{[^}]*\}\}/g, "")
        .split(SPAN_MARK)
        .join("")
        .split(RESUME_MARK)
        .join("");
    const rows = foldText(`${tagMark("b")}alpha beta${RESET_MARK} gamma delta`, 10);
    expect(rows.map(bare).join(" ").split(/\s+/).filter(Boolean)).toEqual([
      "alpha",
      "beta",
      "gamma",
      "delta",
    ]);
  });
});
