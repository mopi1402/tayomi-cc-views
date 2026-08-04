// The decorator carrier, driven exactly the way the live hook meets it: whole messages through transform/slice,
// streamed flushes through handleMessageDisplay. The scenarios are the acceptance list of
// .tayomi/tickets/cc-views-04.md, and the expectations the retired table POC could never satisfy (engage on intent,
// name the template, name the type, keep the fallback native).

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { transform, slice } from "../pipeline.js";
import { handleMessageDisplay } from "../hook/runner.js";
import { cutStreamingDecorated, DECORATOR_HINT } from "./decorator.js";
import { VIEW_EXT } from "../template/load.js";
import { ANSI_RE, tagMark } from "../style.js";
import { hasControlMark } from "../data/marks.js";
import {
  EACH,
  END,
  FIELDS,
  MAX_COLUMNS,
  MIDDLE_FIELDS,
  MIN_COLUMNS,
  TEXT,
  TONE,
} from "../data/language.js";
import { SCRATCH_DIR } from "../data/markup.js";

const ESC = "\x1b";
const RESET = `${ESC}[0m`;
const CYAN = `${ESC}[1;36m`;
const BOLD = `${ESC}[1m`;
// The tone-slot sequences, spelled here like every other one: the assertions must be able to disagree with the palette,
// or they only prove style.ts agrees with itself.
const YELLOW = `${ESC}[1;33m`;
const RED = `${ESC}[1;31m`;
const GREEN = `${ESC}[1;32m`;
const GOLD = `${ESC}[38;5;220m`;
const YELLOW_CHIP = `${ESC}[1;30;43m`;
const CYAN_CHIP = `${ESC}[1;30;46m`;
/** A WEIGHT, the one kind of tag with no colour for a chip to derive from. */
const WEIGHT = `${ESC}[1m`;

// The token as a MODEL writes it, spelled independently of the production constant on purpose: inputs built here,
// assertions on DECORATOR_HINT, so a drift in either spelling is caught instead of shared.
const decorator = (view: string, type?: string): string =>
  type === undefined ? `@{view:${view}}` : `@{view:${view}, type:${type}}`;
// The same token carrying whatever attributes a test needs, comma-separated. The SEPARATOR is spelled by the caller
// wherever it is what the test is about.
const dressed = (view: string, ...attrs: string[]): string =>
  `@{view:${view}${attrs.map((a) => `, ${a}`).join("")}}`;

// The fence, spelled here rather than imported: a test sharing the production spelling of what it forbids on screen
// cannot catch a drift in it.
const FENCE = "```";

// The payload furniture, written once.
const EMPTY_HEADER = "| | |";
const DELIM = "| --- | --- |";
const KV_ROW = "| k | v |";

/** A pipe row of `n` cells, each filled by its index, so a table of any width is one call. */
const pipeRow = (n: number, fill: (i: number) => string): string =>
  `|${Array.from({ length: n }, (_, i) => ` ${fill(i)} |`).join("")}`;
/** Header, delimiter and one data row, at the width asked for. */
const wideTable = (n: number): string[] => [
  pipeRow(n, (i) => `h${i + 1}`),
  pipeRow(n, () => "---"),
  pipeRow(n, (i) => String(i + 1)),
];
// One column PAST the ceiling, derived from it: raising the ceiling moves this fixture with it instead of leaving a
// literal behind that no longer names anything too wide.
const TOO_WIDE = wideTable(MAX_COLUMNS + 1);

// The fixture names, written once: every write() below must agree with every decorator() call in the tests.
const ITEM = "item";
const ALERT = "alert";
const LOUD = "loud";
const SHADE = "shade";
const STALE = "stale";
// The views that spend the TONE SLOT: `toned` takes whatever class a carrier names, `defaulted` declares its own with
// @tone. Both exist ONCE, in one copy, which is the property the whole slot exists for.
const TONED = "toned";
const DEFAULTED = "defaulted";
// A view spending the CHIP side of the slot.
const CHIPPED = "chipped";
// The separator item.view renders between its two columns; the cap assertions find the label column's end by it.
const SEP = " > ";
// KV_ROW as item.view shows it.
const KV_SHOWN = `k${SEP}v`;
const lines = (...rows: string[]): string => [...rows, ""].join("\n");
const decorated = (deco: string, ...rows: string[]): string =>
  lines(deco, EMPTY_HEADER, DELIM, ...rows);

// Every fixture view is the same loop around one body line.
const rowsView = (line: string, attrs = ""): string =>
  lines(`${FIELDS} rows label content`, `${EACH} rows${attrs}`, line, END);
const viewFile = (name: string, type?: string): string =>
  (type === undefined ? name : `${name}.${type}`) + VIEW_EXT;

// Two view dirs, so the type-shadowing tests have an order to observe.
const first = fs.mkdtempSync(path.join(os.tmpdir(), `${SCRATCH_DIR}-deco-a-`));
const second = fs.mkdtempSync(path.join(os.tmpdir(), `${SCRATCH_DIR}-deco-b-`));
const write = (dir: string, name: string, body: string): void =>
  fs.writeFileSync(path.join(dir, name), body);

write(second, viewFile(ITEM), rowsView("{{cyan}}${label}{{/}}" + SEP + "${content}", ' cap="1/3"'));
// A view declaring the WIDEST row: the two anchors with every middle name between them, which is what one file has to
// declare to draw two, three or four columns.
const WIDE = "wide";
const WIDE_FIELDS = [...MIDDLE_FIELDS, "content"];
write(
  second,
  viewFile(WIDE),
  lines(
    `${FIELDS} rows label ${WIDE_FIELDS.join(" ")}`,
    `${EACH} rows`,
    "{{cyan}}${label}{{/}}" + WIDE_FIELDS.map((f) => `${SEP}\${${f}}`).join(""),
    END
  )
);
// A STATIC view, reading no field at all: what a payload-less decorator summons.
const STATIC = "static";
write(second, viewFile(STATIC), "the box is the template\n");
write(second, viewFile(TONED), rowsView("{{tone}}${label}{{/}}" + SEP + "${content}"));
write(second, viewFile(DEFAULTED), `${TONE} gold\n` + rowsView("{{tone}}${label}{{/}}" + SEP + "${content}"));
write(second, viewFile(CHIPPED), rowsView("{{tone_bg}}${label}{{/}}" + SEP + "${content}"));
// A view reading the BLOCKQUOTE payload: the kind through a text table, the body as one field. Its @tone default is
// what an unmarked quote falls to, so every colour assertion below reads against a class no marker and no attribute
// named.
const BANDED = "banded";
const WARNING_WORD = "⚠ WARNING";
const NOTE_WORD = "ⓘ NOTE";
write(
  second,
  viewFile(BANDED),
  lines(
    `${TONE} gold`,
    `${TEXT} kinds warning="${WARNING_WORD}" *="${NOTE_WORD}"`,
    "{{tone}}[${type:kinds}] ${content}{{/}}"
  )
);
// A typed FILE for the same view, on the earlier dir so it would win if it were ever reached: a marker names a kind,
// never a file, and this fixture is how that is observed.
write(first, viewFile(BANDED, "warning"), "TYPED FILE\n");
write(second, viewFile(ITEM, ALERT), rowsView("!! ${label} ${content}"));
write(first, viewFile(ITEM, LOUD), rowsView("A[${label}|${content}]"));
write(second, viewFile(ITEM, LOUD), rowsView("B[${label}|${content}]"));

const WIDTH = 60;
// The item.view fixture declares cap="1/3", so this is where a label cell stops.
const CAP = Math.floor(WIDTH / 3);
const options = { viewsPath: [first, second], width: WIDTH };

const DECORATED = lines(decorator(ITEM), "| Item | Info |", DELIM, "| Decorator | one line above |");

describe("a payload-less decorator", () => {
  // The health-check ask: `@{view:welcome}` alone, no table below. Payload-LESS is now a blank line or the end of the
  // message, because a zone is measured before it is parsed and prose on the very next line is a payload nobody can
  // read.
  it("summons a static view with no data, the line consumed", () => {
    const msg = lines("intro", decorator(STATIC), "", "after");
    const out = transform(msg, undefined, true, undefined, options);
    expect(out).toContain("the box is the template");
    expect(out).toContain("intro");
    expect(out).toContain("after");
    expect(out).not.toContain(DECORATOR_HINT);
  });

  it("summons one ending the message, with no line below at all", () => {
    const out = transform(lines("intro", decorator(STATIC)), undefined, true, undefined, options);
    expect(out).toContain("the box is the template");
    expect(out).not.toContain(DECORATOR_HINT);
  });

  it("summons NOTHING when prose sits on the very next line", () => {
    // The behaviour change this carrier's zone fix costs, and the point of it: that prose was always a payload on
    // screen, the pipe-only scanner simply could not see it, so a static view rendered as if the author had written
    // nothing.
    const msg = lines("intro", decorator(STATIC), "after");
    expect(transform(msg, undefined, true, undefined, options)).toBe(msg);
  });

  it("falls back to the raw line when the view reads fields it does not get", () => {
    // item.view loops over rows: summoned bare it renders whitespace, and the hollow guard shows the line instead of a
    // blank. The blank line is what makes this the HOLLOW path rather than the unclaimed-payload one.
    const msg = lines("intro", decorator(ITEM), "", "after");
    expect(transform(msg, undefined, true, undefined, options)).toContain(decorator(ITEM));
  });
});

describe("a decorated payload", () => {
  it("renders through the named template, decorator line and furniture gone", () => {
    const out = transform(DECORATED, undefined, true, undefined, options);
    expect(out).toContain(CYAN);
    expect(out).toContain("Decorator");
    expect(out).toContain("> one line above");
    expect(out).not.toContain(DECORATOR_HINT);
    expect(out).not.toContain("|");
    expect(out).not.toContain("---");
  });

  it("keeps the message itself free of any colour marker", () => {
    // The split the carrier exists for: the transcript keeps plain markdown.
    expect(DECORATED).not.toContain("{{");
    expect(DECORATED).not.toContain(ESC);
  });

  it("renders between two paragraphs, prose untouched", () => {
    const out = transform(`before\n\n${DECORATED}\nafter\n`, undefined, true, undefined, options);
    expect(out).toContain("before");
    expect(out).toContain("after");
    expect(out).not.toContain("|");
  });

  it("honours a bold span the message authored, and adds none elsewhere", () => {
    const out = transform(decorated(decorator(ITEM), "| a | so **very** bold |"), undefined, true, undefined, options);
    expect(out).toContain(`${BOLD}very`);
    expect(out).not.toContain("*");
  });

  it("honours the `**` it derives, and nothing the cell wrote as markup itself", () => {
    // Both live in one string by the time the template sees them, so the order in cell() is the whole guarantee:
    // neutralise, then style.
    const written = `${tagMark("fail")}not${tagMark("/")}`;
    const out = transform(
      decorated(decorator(ITEM), `| a | **real** and ${written} |`),
      undefined,
      true,
      undefined,
      options
    );
    expect(out).toContain(`${BOLD}real`);
    expect(out.replace(ANSI_RE, "")).toContain(written);
    expect(out).not.toContain(RED); // the tag never opened its colour
    expect(hasControlMark(out)).toBe(false);
  });

  it("renders a cell holding an escaped pipe, pipe on screen", () => {
    const out = transform(decorated(decorator(ITEM), "| a\\|b | c |"), undefined, true, undefined, options);
    expect(out.replace(ANSI_RE, "")).toContain("a|b > c");
  });

  it("renders continuation rows one per line, label blank but aligned", () => {
    const msg = decorated(decorator(ITEM), "| key-name | one |", "| | two |");
    const shown = transform(msg, undefined, true, undefined, options).replace(ANSI_RE, "").split("\n");
    const one = shown.find((l) => l.endsWith("> one"));
    const two = shown.find((l) => l.endsWith("> two"));
    expect(one).toBeDefined();
    expect(two).toBeDefined();
    // The alignment must survive a label WIDER than one column: the blank cell pads to the label's width, not to a
    // single space.
    expect(one!.indexOf(">")).toBeGreaterThan("key-name".length);
    expect(two!.indexOf(">")).toBe(one!.indexOf(">"));
  });

  it("caps the label column at a third of the width, on an ellipsis", () => {
    const long = "an unreasonably long label that would eat the row";
    const msg = decorated(decorator(ITEM), `| ${long} | x |`);
    const plain = transform(msg, undefined, true, undefined, options).replace(ANSI_RE, "");
    const line = plain.split("\n").find((l) => l.includes("…"));
    expect(line).toBeDefined();
    // Exactly the cap: a column clamped tighter would be a regression too.
    expect(line!.indexOf(SEP)).toBe(CAP);
    expect(line).toContain("x");
  });

  it("cuts a capped bold label without leaking markup or leaving the style open", () => {
    const msg = decorated(decorator(ITEM), "| aaaaaaaaaaaaaaaaa**bold and more** | tail |");
    const out = transform(msg, undefined, true, undefined, options);
    expect(out).not.toContain("{{");
    expect(out).not.toContain("*");
    const plain = out.replace(ANSI_RE, "");
    const line = plain.split("\n").find((l) => l.includes("…"));
    expect(line).toBeDefined();
    expect(line!.indexOf(SEP)).toBe(CAP);
    expect(line).toContain("tail");
    // The cut lands inside the bold span: its style must be CLOSED before the template's own separator, never left
    // bleeding into the content column. And the LABEL's own colour has to come back with it, or the ellipsis and
    // everything after it print plain where the template asked for cyan.
    const cell = out.split("\n").find((l) => l.includes("…"));
    expect(cell!.indexOf(RESET)).toBeLessThan(cell!.indexOf(SEP));
    expect(cell).toContain(`${RESET}${CYAN}…`);
  });

  it("hands a styled CELL its own colour back after a bold span, mid-label", () => {
    const out = transform(
      decorated(decorator(ITEM), "| so **very** bold | tail |"),
      undefined,
      true,
      undefined,
      options
    );
    expect(out).toContain(`${BOLD}very${RESET}${CYAN}`);
  });

  it("resumes the BOLD span after a code span nested in it, and the cell after both", () => {
    // The message's own backticks become a span of the engine's INSIDE the bold one, so two frames nest in one cell.
    // The inner resume owes the line its bold back, the outer owes it the cell's colour, and popping one entry would
    // have handed the first of those the code colour instead.
    const out = transform(
      decorated(decorator(ITEM), "| so **very `fast` here** bold | tail |"),
      undefined,
      true,
      undefined,
      options
    );
    expect(out).toContain(`${RESET}${CYAN}${BOLD} here`);
    // The label is capped, so what follows is the cut and not the rest of the word.
    expect(out).toContain(`here${RESET}${CYAN} b`);
  });
});

describe("a table wider than two columns", () => {
  const plainly = (...rows: string[]): string =>
    transform(lines(decorator(WIDE), ...rows), undefined, true, undefined, options).replace(
      ANSI_RE,
      ""
    );
  /** Header, delimiter and one data row of `n` cells, the payload as an author types it. */
  const table = (n: number): string[] => [
    pipeRow(n, () => ""),
    pipeRow(n, () => "---"),
    pipeRow(n, (i) => `c${i + 1}`),
  ];
  /** The cells of that row as they read once drawn, side by side. */
  const shown = (n: number): string =>
    Array.from({ length: n }, (_, i) => `c${i + 1}`).join(SEP);

  it("hands every arity from two to four to the template, in the order the row wrote them", () => {
    for (let n = MIN_COLUMNS; n <= MAX_COLUMNS; n++) {
      expect(plainly(...table(n))).toContain(shown(n));
    }
  });

  it("anchors the two ENDS, so a wider table renames no column a narrow template reads", () => {
    // The first cell is `label` and the last is `content` at every width: the fixture's own line is written against
    // those two names, and a three-column row still lands the LAST cell in the last slot rather than in a middle one.
    expect(plainly(...table(MIN_COLUMNS + 1))).toContain(`c1${SEP}c2${SEP}c3`);
    expect(plainly(...table(MIN_COLUMNS + 1))).not.toContain(`c1${SEP}c3`);
  });

  it("drops a column NO row carries, and the separator written just before it", () => {
    // The narrow table under the widest template: two of its four slots are hollow, so what is left is exactly the
    // two-column render, with no orphaned bar and no blank cell held open.
    expect(plainly(...table(MIN_COLUMNS))).toContain(`c1${SEP}c2\n`);
  });

  it("keeps the label's own colour closed when the column after it is hollow", () => {
    // The closer sits at the head of the dropped run, and it belongs to the column BEFORE: dropping it with the rest
    // would paint the whole line in the label's tone.
    const out = transform(
      lines(decorator(WIDE), ...table(MIN_COLUMNS)),
      undefined,
      true,
      undefined,
      options
    );
    expect(out).toContain(`${CYAN}c1${RESET}`);
  });

  it("refuses a RAGGED table whole, rather than guessing which column a cell lost", () => {
    const ragged = [...table(MIN_COLUMNS + 1), pipeRow(MIN_COLUMNS, (i) => `d${i + 1}`)];
    const msg = lines(decorator(WIDE), ...ragged);
    expect(transform(msg, undefined, true, undefined, options)).toBe(msg);
  });

  it("refuses a delimiter of a different width than the header it sits under", () => {
    const msg = lines(
      decorator(WIDE),
      pipeRow(MIN_COLUMNS + 1, () => ""),
      pipeRow(MIN_COLUMNS, () => "---"),
      pipeRow(MIN_COLUMNS + 1, (i) => `c${i + 1}`)
    );
    expect(transform(msg, undefined, true, undefined, options)).toBe(msg);
  });
});

describe("the type", () => {

  it("picks the typed form, and the same payload renders differently under two types", () => {
    const plain = transform(decorated(decorator(ITEM), KV_ROW), undefined, true, undefined, options);
    const alert = transform(decorated(decorator(ITEM, ALERT), KV_ROW), undefined, true, undefined, options);
    expect(alert.replace(ANSI_RE, "")).toContain("!! k v");
    expect(alert).not.toBe(plain);
  });

  it("resolves the typed file through the ordered path, first hit wins", () => {
    const out = transform(decorated(decorator(ITEM, LOUD), KV_ROW), undefined, true, undefined, options);
    expect(out).toContain("A[k|v]");
    expect(out).not.toContain("B[");
  });

  it("lets an earlier dir's default beat a later dir's typed form: path order outranks specificity", () => {
    write(first, viewFile(SHADE), rowsView("D[${label}|${content}]"));
    const type = "warning";
    write(second, viewFile(SHADE, type), rowsView("T[${label}|${content}]"));
    const out = transform(decorated(decorator(SHADE, type), KV_ROW), undefined, true, undefined, options);
    expect(out).toContain("D[k|v]");
    expect(out).not.toContain("T[");
  });

  it("falls back to the default form on a type the template does not know", () => {
    const out = transform(decorated(decorator(ITEM, "sarcastic"), KV_ROW), undefined, true, undefined, options);
    expect(out).toContain(CYAN);
    expect(out.replace(ANSI_RE, "")).toContain(KV_SHOWN);
  });
});

// The promise of the tone slot, and the reason it exists: ONE template file renders in any colour a carrier names, so a
// second colour never costs a second copy of a view.
describe("the tone", () => {
  const render = (deco: string): string =>
    transform(decorated(deco, KV_ROW), undefined, true, undefined, options);

  it("dresses one template in the class the decorator sticks on, text untouched", () => {
    const neutral = render(decorator(TONED));
    const warned = render(dressed(TONED, "tone:warn"));
    expect(warned).toContain(YELLOW);
    expect(neutral).toContain(CYAN);
    expect(neutral).not.toContain(YELLOW);
    // The SAME template, and the same screen but for its colours: what a typed copy of the file was the only way to get
    // before the slot existed.
    expect(warned.replace(ANSI_RE, "")).toBe(neutral.replace(ANSI_RE, ""));
  });

  it("colours from the KIND alone, with no typed file anywhere on the path", () => {
    expect(render(decorator(TONED, "warning"))).toContain(YELLOW);
    expect(render(decorator(TONED, "error"))).toContain(RED);
    expect(render(decorator(TONED, "success"))).toContain(GREEN);
  });

  it("lets the tone outrank the kind: the look is the more explicit word", () => {
    const out = render(dressed(TONED, "type:success", "tone:fail"));
    expect(out).toContain(RED);
    expect(out).not.toContain(GREEN);
  });

  it("holds the template's @tone default, and lets a carrier outrank it", () => {
    expect(render(decorator(DEFAULTED))).toContain(GOLD);
    const warned = render(dressed(DEFAULTED, "tone:warn"));
    expect(warned).toContain(YELLOW);
    expect(warned).not.toContain(GOLD);
  });

  it("falls through a class the palette does not know, down to the neutral", () => {
    const out = render(dressed(TONED, "tone:chartreuse"));
    expect(out).toContain(CYAN);
    expect(out.replace(ANSI_RE, "")).toContain(KV_SHOWN);
  });

  it("spends the chip side, and falls back to the foreground for a class without one", () => {
    expect(render(dressed(CHIPPED, "tone:warn"))).toContain(YELLOW_CHIP);
    expect(render(dressed(CHIPPED, "tone:info"))).toContain(CYAN_CHIP);
    // A chip derives from every COLOUR, so the fallback is reached by a weight alone: `b` carries no colour, and there
    // is nothing about it to measure an ink against.
    expect(render(dressed(CHIPPED, "tone:b"))).toContain(WEIGHT);
  });

  it("engages with no comma at all, the separator a model actually writes", () => {
    const out = transform(
      decorated(`@{view:${TONED} tone:warn}`, KV_ROW),
      undefined,
      true,
      undefined,
      options
    );
    expect(out).toContain(YELLOW);
    expect(out).not.toContain(DECORATOR_HINT);
  });
});

// The SECOND payload shape. A quote is what a banner is written as, because it is the shape that survives both
// degradations: still a visible block in a raw transcript, and a native alert box where the marker is understood.
describe("a decorated blockquote", () => {
  // The marker as a MODEL writes it, spelled independently of the production constant: a test sharing the spelling of
  // what it drives cannot catch a drift in it.
  const marker = (kind: string): string => `[!${kind}]`;
  /** A quote zone under a decorator, closed by the blank line the rule requires. */
  const band = (deco: string, ...body: string[]): string =>
    lines(deco, ...body.map((l) => `> ${l}`), "");
  const render = (deco: string, ...body: string[]): string =>
    transform(band(deco, ...body), undefined, true, undefined, options);
  const plain = (deco: string, ...body: string[]): string =>
    render(deco, ...body).replace(ANSI_RE, "");

  it("reaches the template as content, the marker as the kind, the line consumed", () => {
    const out = render(decorator(BANDED), marker("WARNING"), "two flaky suites");
    expect(out).toContain(YELLOW); // the KIND painted it, and no attribute said so
    expect(out.replace(ANSI_RE, "")).toContain(`[${WARNING_WORD}] two flaky suites`);
    expect(out).not.toContain(DECORATOR_HINT);
    expect(out).not.toContain(">");
  });

  it("joins the body on ONE space, which is markdown's own soft-wrap", () => {
    const out = plain(decorator(BANDED), marker("WARNING"), "one", "two", "three");
    expect(out).toContain("one two three");
    expect(out.trim().split("\n")).toHaveLength(1);
  });

  it("takes the reserved entry and the template's own tone with NO marker", () => {
    const out = render(decorator(BANDED), "just a sentence");
    expect(out).toContain(GOLD);
    expect(out).not.toContain(YELLOW);
    expect(out.replace(ANSI_RE, "")).toContain(`[${NOTE_WORD}] just a sentence`);
  });

  it("gets its own colour back after a bold span, rather than losing it there", () => {
    const out = render(decorator(BANDED), "so **very** bold, and the rest");
    // The band opens GOLD and the emphasis the message authored interrupts it. Closing that span on a reset left every
    // character after it plain, and no template author could have compensated: the view has no idea where a `**` will
    // land.
    expect(out).toContain(`${BOLD}very${RESET}${GOLD}`);
    expect(hasControlMark(out)).toBe(false);
  });

  it("echoes a kind the table never heard of, and keeps the template's tone", () => {
    const out = render(decorator(BANDED), marker("DEPLOY"), "shipped");
    expect(out.replace(ANSI_RE, "")).toContain("[DEPLOY] shipped");
    expect(out).toContain(GOLD);
  });

  it("lets tone: dress an unknown kind, the look being the more explicit word", () => {
    const out = render(dressed(BANDED, "tone:success"), marker("DEPLOY"), "shipped");
    expect(out).toContain(GREEN);
    expect(out.replace(ANSI_RE, "")).toContain("[DEPLOY]");
  });

  it("lets the MARKER beat a type: attribute, and load no typed file for either", () => {
    // The precedence is not a branch anywhere: the carrier leaves dressing.type unset when the payload named a kind,
    // and render.ts overrides the field only FROM a dressing that carries one. The typed file on the earlier dir proves
    // the second half: a marker names a kind, never a file.
    const out = render(decorator(BANDED, "error"), marker("WARNING"), "body");
    expect(out).toContain(YELLOW);
    expect(out).not.toContain(RED);
    expect(out).not.toContain("TYPED FILE");
  });

  it("still lets a type: attribute through when the quote names no kind at all", () => {
    // Nothing about the second payload shape retires the attribute: with no marker it behaves exactly as it does over a
    // table, typed file included.
    const out = render(decorator(BANDED, "warning"), "body");
    expect(out).toContain("TYPED FILE");
  });
});

// The seam this engine holds: message text becoming a scope value. A quote's body is message text in exactly the way a
// cell is, and it gets the same treatment because it runs through the same function.
describe("a blockquote body, neutralised", () => {
  const render = (...body: string[]): string =>
    transform(
      lines(decorator(BANDED), ...body.map((l) => `> ${l}`), ""),
      undefined,
      true,
      undefined,
      options
    );

  it("prints a tag the message wrote as TEXT, opening no colour and closing none", () => {
    const written = `${tagMark("fail")}not${tagMark("/")}`;
    const out = render(`a band ${written} can claim`);
    expect(out.replace(ANSI_RE, "")).toContain(written);
    expect(out).not.toContain(RED); // the tag never opened its colour
    expect(out).toContain(GOLD); // and the band kept the one it meant to hold
    expect(hasControlMark(out)).toBe(false);
  });

  it("honours a bold span the message authored, exactly as a table cell does", () => {
    const out = render("so **very** bold");
    expect(out).toContain(`${BOLD}very`);
    expect(out).not.toContain("*");
  });
});

// Every matcher here is built so a malformed line falls through to the BODY, where the author sees it printed. A
// near-miss that VANISHED would be indistinguishable from a matcher that swallows, which is why each of the four has
// its own case.
describe("a marker that is not one", () => {
  const opening = (near: string): string =>
    transform(
      lines(decorator(BANDED), `> ${near}`, "> and the rest", ""),
      undefined,
      true,
      undefined,
      options
    ).replace(ANSI_RE, "");

  const NEAR_MISSES = ["[!📦 VERSION]", "[! WARNING]", "[!warning]", "[!TWO WORDS]"];

  it.each(NEAR_MISSES)("prints %s inside the band as content, not as a kind", (near) => {
    const out = opening(near);
    expect(out).toContain(near);
    expect(out).toContain(`[${NOTE_WORD}] ${near} and the rest`);
  });
});

describe("what the carrier must NOT touch", () => {
  it("leaves an undecorated table byte-identical, whatever its rows or columns", () => {
    for (const table of [
      lines("| left | right |", DELIM, "| value | **bold** |"),
      lines(...TOO_WIDE),
      lines("| l | r |", DELIM, "| 1 | 2 |", "| 3 | 4 |"),
    ]) {
      expect(transform(table, undefined, true, undefined, options)).toBe(table);
    }
  });

  it("never engages on @{Name='x'}, the PowerShell shape the token guards against", () => {
    expect(slice("", "@{Name='x'} and @{$ref} stay text\n", undefined, true, undefined, options)).toBeNull();
  });

  it("treats an unknown attribute as text, not as the token", () => {
    const msg = lines("@{view:item, junk:x}", EMPTY_HEADER, DELIM, KV_ROW);
    expect(transform(msg, undefined, true, undefined, options)).toBe(msg);
  });
});

describe("fail-open, decorator line included", () => {
  const raw = (msg: string): string => transform(msg, undefined, true, undefined, options);

  it("shows the raw zone on an unknown template name", () => {
    const msg = decorated(decorator("nosuch"), KV_ROW);
    expect(raw(msg)).toBe(msg);
  });

  it("shows the raw zone when the template exists but reads none of the rows", () => {
    // A template reading `left` and `right` where a table hands it `rows`: nothing it draws can come from the payload.
    // Caught on the NAMES, in render.ts, because a template with furniture would print regardless.
    write(second, viewFile(STALE), lines(`${FIELDS} left right`, "${left}  ${right}"));
    const msg = decorated(decorator(STALE), KV_ROW);
    expect(raw(msg)).toBe(msg);
  });

  it("shows the raw zone when every field it DOES read arrived blank", () => {
    // The last reading, and the only one the output can answer: the names line up, the data arrived, and the screen
    // still gets nothing. A blank line where content stood is the same lie as an empty skeleton.
    const BLANKS = "blanks";
    write(second, viewFile(BLANKS), rowsView("${label}${content}"));
    const msg = decorated(decorator(BLANKS), "| | |");
    expect(raw(msg)).toBe(msg);
  });

  it("shows the raw zone on a malformed payload", () => {
    for (const msg of [
      lines(decorator(ITEM), ...TOO_WIDE), // one column past the ceiling
      lines(decorator(ITEM), EMPTY_HEADER, DELIM), // no data row
      lines(decorator(ITEM), "no table at all"), // a payload no parser here claims
    ]) {
      expect(raw(msg)).toBe(msg);
    }
  });

  it("shows the raw zone when prose sits on the line directly under a quote", () => {
    // The rule a quote lives under, and it is ENFORCED rather than remembered: a zone is the run of non-blank lines
    // under the decorator, so the paragraph joins the quote, no parser claims the mixture, and every line the author
    // wrote stays on screen.
    const msg = lines(decorator(BANDED), "> [!WARNING]", "> a band", "glued prose");
    expect(raw(msg)).toBe(msg);
  });

  it("shows it for a quote glued to a TABLE below it, the other way round too", () => {
    const msg = lines(decorator(BANDED), "> a band", EMPTY_HEADER, DELIM, KV_ROW);
    expect(raw(msg)).toBe(msg);
  });
});

// Pinned as a test rather than as code, and it passes on day one: that IS the point. The next person reaching for the
// wrapper here has to delete an assertion that says why.
describe("a band wider than the render", () => {
  it("comes out on one line, unwrapped and untruncated, measured by nothing", () => {
    // A body line outside a box never reaches wrapLine (it is called from box.ts and aside.ts alone), so the TERMINAL
    // breaks a long band: the chip stays open across the break, the colour continues, and the closing cap lands on the
    // last row. The caps landing on different rows is understood by a reader as one band, and buying a wrapper here
    // would mean giving a bare body line a width it has never had.
    const long = "mot ".repeat(WIDTH).trim();
    const out = transform(
      lines(decorator(BANDED), `> [!WARNING]`, `> ${long}`, ""),
      undefined,
      true,
      undefined,
      options
    ).replace(ANSI_RE, "");
    expect(out.trim().split("\n")).toHaveLength(1);
    expect(out).toContain(long);
    expect(out).not.toContain("…");
    expect(out.trim().length).toBeGreaterThan(WIDTH);
  });
});

describe("a decorator inside a code fence", () => {
  // Documentation about this package is made of working examples, and running one is what the fence used to be unable
  // to prevent: nothing here has an escape of its own.
  const raw = (msg: string): string => transform(msg, undefined, true, undefined, options);

  it("renders nothing, and the fence survives byte for byte", () => {
    const msg = lines("shown below:", FENCE, decorator(ITEM), EMPTY_HEADER, DELIM, KV_ROW, FENCE);
    expect(raw(msg)).toBe(msg);
  });

  it("renders nothing for a payload-less one either, which would summon a view", () => {
    const msg = lines(FENCE, decorator(STATIC), FENCE);
    expect(raw(msg)).toBe(msg);
    expect(raw(msg)).not.toContain("the box is the template");
  });

  it("still renders the one OUTSIDE, in the same message", () => {
    const msg = lines(FENCE, decorator(STATIC), FENCE, "", decorator(STATIC), "");
    const out = raw(msg);
    expect(out).toContain("the box is the template");
    // The quoted one is still there, whole, and only it.
    expect(out.split(DECORATOR_HINT)).toHaveLength(2);
  });

  it("anchors no withholding while a fenced example streams", () => {
    // The cut reads the same fences the render does, or a quoted example at the tail of a message blanks everything
    // under it until the fence closes.
    const before = lines("intro", FENCE, decorator(ITEM), "");
    expect(slice("", before, undefined, false, undefined, options)).toContain("intro");
  });
});

describe("streaming", () => {
  it("withholds the zone until its end is known, on an in-order stream", () => {
    const chunks = ["intro", decorator(ITEM), EMPTY_HEADER, DELIM, "| k | **v** |", "after"].map(
      (l) => `${l}\n`
    );
    let prev = "";
    let screen = "";
    chunks.forEach((delta, i) => {
      const display = slice(prev, delta, undefined, i === chunks.length - 1, undefined, options);
      prev += delta;
      screen += display === null ? delta : display;
    });
    expect(screen).toContain("intro");
    expect(screen).toContain("after");
    expect(screen).toContain(`${BOLD}v`);
    expect(screen).not.toContain("|");
    expect(screen).not.toContain(DECORATOR_HINT);
  });

  it("withholds through handleMessageDisplay, out-of-order flushes included", async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), `${SCRATCH_DIR}-deco-state-`));
    const opts = { ...options, stateDir };
    const id = `deco-stream-${process.pid}`;
    const payload = (index: number, delta: string, final = false): Record<string, unknown> => ({
      message_id: id,
      index,
      delta,
      final,
    });
    const outs: string[] = [];
    const shown = (envelope: string | null): string =>
      envelope === null
        ? ""
        : (JSON.parse(envelope) as { hookSpecificOutput: { displayContent: string } })
            .hookSpecificOutput.displayContent;

    outs.push(shown(await handleMessageDisplay(payload(0, lines("intro", decorator(ITEM), EMPTY_HEADER)), undefined, opts)));
    // The flush carrying the table's body lands LATE, while the final is waiting.
    setTimeout(() => {
      void handleMessageDisplay(payload(1, lines(DELIM, KV_ROW)), undefined, opts);
    }, 30);
    outs.push(shown(await handleMessageDisplay(payload(2, lines("after"), true), undefined, opts)));

    for (const out of outs) {
      expect(out).not.toContain(DECORATOR_HINT);
      expect(out).not.toContain("---");
    }
    const screen = outs.join("");
    expect(screen).toContain("intro");
    expect(screen.replace(ANSI_RE, "")).toContain(KV_SHOWN);
    expect(screen).toContain("after");
  });

  it("holds back a decorator line whose payload has not even started", () => {
    expect(cutStreamingDecorated(lines("prose", decorator(ITEM)))).toBe(lines("prose"));
    expect(cutStreamingDecorated(lines(decorator(ITEM), EMPTY_HEADER))).toBe("");
  });

  it("holds a QUOTE zone back until its blank line arrives, not until a pipe does", () => {
    // The cut reads the run through the same table the render does. Reading a quote's run as a table's would call the
    // zone closed on its very first line, and a band half-composed would reach the screen before the flush that
    // completes it: a delta already shown cannot be retracted, so the caps would be drawn twice.
    expect(cutStreamingDecorated(lines(decorator(BANDED), "> [!WARNING]", "> half a b"))).toBe("");
    expect(cutStreamingDecorated(lines("prose", decorator(BANDED), "> a band"))).toBe(
      lines("prose")
    );
  });

  it("lets the quote through once the blank line closes the zone", () => {
    const closed = lines(decorator(BANDED), "> a band", "", "after");
    expect(cutStreamingDecorated(closed)).toBe(closed);
  });

  it("streams a band whole, and never twice, on an in-order stream", () => {
    const chunks = ["intro", decorator(BANDED), "> [!WARNING]", "> two flaky suites", "", "after"].map(
      (l) => `${l}\n`
    );
    let prev = "";
    let screen = "";
    chunks.forEach((delta, i) => {
      const display = slice(prev, delta, undefined, i === chunks.length - 1, undefined, options);
      prev += delta;
      screen += display === null ? delta : display;
    });
    const plain = screen.replace(ANSI_RE, "");
    expect(plain).toContain("intro");
    expect(plain).toContain("after");
    expect(plain).toContain(`[${WARNING_WORD}] two flaky suites`);
    expect(screen).not.toContain(DECORATOR_HINT);
    expect(plain).not.toContain(">");
    // Once. A zone revealed before its end is known is a zone the next flush draws again.
    expect(plain.split(WARNING_WORD)).toHaveLength(2);
  });
});
