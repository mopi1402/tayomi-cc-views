// The decorator carrier: a line that NAMES the template dressing the plain-markdown payload below it.
//
//   @{view:table, type:warning}
//   | Item | Info |
//   | --- | --- |
//   | Decorator | one line above the payload |
//
// THREE payload shapes, decided by the zone's FIRST line and nowhere else. A leading pipe is a table, reaching the
// template as `rows`. A leading `>` is a blockquote, reaching it as `content` line for line, its optional `[!WARNING]`
// marker as `type`. A ```mermaid fence is a diagram source, reaching it RAW as `content` for the engine to draw. Why a
// quote rather than a paragraph: docs/architecture/architecture.md, "The decorator's trade".
//
// The carrier only NAMES the shape it parsed (Dressing.payload); which shape a view accepts is the template's own
// declaration, and render.ts is where a mismatch refuses. One view, one form: a banner takes a quote and nothing else.
//
// A table of TWO columns is ALSO read as named fields, so a sectioned view can be spent from a decorator. That reading
// runs where the template is known (view-data.ts): this carrier hands over rows, the derived fields land UNDER them.

import {
  BARE_SIDE_VIEWS,
  FIELD_CONTENT,
  FIELD_HEAD,
  FIELD_LABEL,
  FIELD_ROWS,
  FIELD_TONE,
  FIELD_TYPE,
  MARKER_SOURCE,
  MAX_COLUMNS,
  MIN_COLUMNS,
  PAYLOAD_FENCE,
  PAYLOAD_MARKDOWN,
  PAYLOAD_QUOTE,
  PAYLOAD_TABLE,
  SPLIT_SIDES,
  SPLIT_VIEW,
  ASIDE_VIEW,
  middleField,
} from "../data/language.js";
import {
  DECORATOR_CLOSE,
  DECORATOR_HINT,
  DIAGRAM_INFO,
  MARKDOWN_INFO,
  FENCE,
  NAME_MARK,
  NL,
  QUOTE_MARK,
  TABLE_MARK,
} from "../data/markup.js";
import { renderColumn, renderView, type Dressing } from "../template/render.js";
import { composeFlow, composeSplit, type Side } from "../layout/aside.js";
import { maxBoxWidth } from "../platform/tty-width.js";
import { printedWidth } from "../layout/measure.js";
import { loadTemplate, resolvesView } from "../template/load.js";
import { defersView } from "../platform/peers.js";
import { DECORATED_ZONE, pieceFor, publishPiece, publishRaw, zoneKey } from "../platform/compose.js";
import { namedFields } from "../template/view-data.js";
import { ANSI_RE, holdLeadingBlank, inertText } from "../style.js";
import { fenceAt, fenceSpans, type Fence } from "./fences.js";
import {
  failedOutcome,
  okOutcome,
  strictLine,
  type DisplayHost,
  type Outcome,
} from "../host.js";
import type { RenderOptions } from "../options.js";
import type { Scope } from "../scope.js";

export { DECORATOR_HINT };

// Parsed by string, not by one composed regex: an optional inner group plus a trailing anchor backtracks on a near-miss
// (the lesson directives.ts already paid for), and the SAST gate rightly refuses the shape.
// eslint-disable-next-line security/detect-non-literal-regexp
const re = (source: string): RegExp => new RegExp(source);

const NAME_RE = /^[\w-]+$/;
/** Spelled from the FIELDS they land in: a rename there must never leave this pattern behind. */
const ATTR_RE = re(String.raw`^(${FIELD_TYPE}|${FIELD_TONE})${NAME_MARK}([\w-]+)$`);
/** A comma, whitespace, or both: `@{view:table, type:warning}` is `@{view:table type:warning}`. */
const ATTR_SEP = /[,\s]+/;

interface Decorator extends Dressing {
  view: string;
}

// ALONE on its line (whitespace aside), which is what keeps a decorator quoted in prose from engaging anything.
function parseDecorator(line: string): Decorator | null {
  const t = line.trim();
  if (!t.startsWith(DECORATOR_HINT) || !t.endsWith(DECORATOR_CLOSE)) return null;
  const inner = t.slice(DECORATOR_HINT.length, -DECORATOR_CLOSE.length);
  const [view, ...attrs] = inner.split(ATTR_SEP).filter((part) => part !== "");
  if (view == null || !NAME_RE.test(view)) return null;
  const deco: Decorator = { view };
  for (const attr of attrs) {
    const m = attr.match(ATTR_RE);
    if (m === null) return null; // any other attribute is not the token
    if (m[1] === FIELD_TYPE) deco.type = m[2];
    else deco.tone = m[2];
  }
  return deco;
}

/**
 * Does a decorator have a payload at all? Its EXISTENCE and its EXTENT are two questions: asking the pipe scanner where
 * the zone ends makes everything it cannot read look like NOTHING, and an empty zone is how a static view is summoned.
 */
function hasPayload(lines: string[], below: number, stop: number): boolean {
  return below < stop && lines[below].trim() !== "";
}

/** A pipe is an alternation anywhere else, so the mark is escaped ONCE here and the patterns below compose. */
const TABLE_SOURCE = `\\${TABLE_MARK}`;
const PIPE_LINE_RE = re(String.raw`^[ \t]*${TABLE_SOURCE}`);
const QUOTE_LINE_RE = re(String.raw`^[ \t]*${QUOTE_MARK}`);
/** The ONE ordinary fence a decorator may claim: the diagram's info string, exact, and nothing else opens the shape. */
const FENCE_OPEN_RE = re(String.raw`^[ \t]*${FENCE}${DIAGRAM_INFO}[ \t]*$`);
/** What closes it: a bare run of at least the fence's own ticks, as fences.ts reads one. An info'd run stays body. */
const FENCE_CLOSE_RE = re(String.raw`^[ \t]*${FENCE}` + FENCE[0] + String.raw`*[ \t]*$`);
/**
 * A markdown fence opens on ANY run of three ticks or more, so a body holding a code fence of its own can be written
 * under a longer one, markdown's own rule. Only a bare run at least as long closes it.
 */
const MARKDOWN_OPEN_RE = re(String.raw`^[ \t]*(${FENCE}${FENCE[0]}*)${MARKDOWN_INFO}[ \t]*$`);
const closesRun = (line: string, run: string): boolean => {
  const t = line.trim();
  return t.startsWith(run) && t.split(FENCE[0]).join("") === "";
};
/** The marker off a body line, and the one optional space markdown allows after `>`. */
const QUOTE_PREFIX_RE = re(String.raw`^[ \t]*${QUOTE_MARK}[ \t]?`);
// eslint-disable-next-line security/detect-non-literal-regexp
const MARKER_RE = new RegExp(`^${MARKER_SOURCE}$`);

/** Where each line of a text begins, so a line can be placed against a fence's span. */
function lineStarts(lines: string[]): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const line of lines) {
    starts.push(at);
    at += line.length + 1; // the newline split() consumed
  }
  return starts;
}

// A cell accepts an escaped pipe (`\|`) since markdown renders that, and holds no bare one, so the arities below cannot
// overlap and a row matches exactly one of them.
const CELL = String.raw`((?:\\${TABLE_SOURCE}|[^${TABLE_SOURCE}\n])*)`;
const DELIM_CELL = String.raw`[ \t]*:?-+:?[ \t]*`;

/** A row of `n` cells, and the delimiter under it. One source, so the two can never disagree on what a column is. */
const rowSource = (n: number, cell: string): string =>
  `^[ \t]*${TABLE_SOURCE}${Array.from({ length: n }, () => cell).join(TABLE_SOURCE)}${TABLE_SOURCE}[ \t]*$`;

/** The LAST cell of a data row, greedy to the closing delimiter, so the bare pipes of a surplus stay in it as content. */
const TAIL_CELL = String.raw`(.*)`;

/** The same row with that tail in last position. A cell short still matches nothing here: too few pipes to reach it. */
const tailSource = (n: number): string =>
  `^[ \t]*${TABLE_SOURCE}${[...Array.from({ length: n - 1 }, () => CELL), TAIL_CELL].join(TABLE_SOURCE)}${TABLE_SOURCE}[ \t]*$`;

/** The three patterns of one arity, built the first time a header asks for it: the width has no ceiling. */
interface ArityRes {
  row: RegExp;
  delim: RegExp;
  tail: RegExp;
}
const ARITY_RES = new Map<number, ArityRes>();
function arityRes(n: number): ArityRes {
  let res = ARITY_RES.get(n);
  if (res === undefined) {
    res = { row: re(rowSource(n, CELL)), delim: re(rowSource(n, DELIM_CELL)), tail: re(tailSource(n)) };
    ARITY_RES.set(n, res);
  }
  return res;
}

const ESCAPED_PIPE_SOURCE_RE = re(String.raw`\\${TABLE_SOURCE}`);
const BARE_PIPE_RE = re(TABLE_SOURCE);

/** The header's cell count, read off its bare pipes and confirmed by the row pattern, or undefined below two. */
function arityOf(header: string): number | undefined {
  const pipes = header.split(ESCAPED_PIPE_SOURCE_RE).join("").split(BARE_PIPE_RE).length - 1;
  const n = pipes - 1;
  return n >= MIN_COLUMNS && arityRes(n).row.test(header) ? n : undefined;
}

/**
 * Past MAX_COLUMNS a row no longer fits a terminal line, so it folds into a two-column entry: the first cell keeps the
 * label, every other cell becomes a line of its own under it, named by its header. Done on the RAW cells, so the
 * template sees an ordinary two-column table and no view has to know.
 */
export const FOLD_SEP = ": ";

function foldCells(head: string[], cells: string[]): string[][] {
  const lines = cells
    .slice(1)
    .map((raw, i) => ({ name: head[i + 1].trim(), value: raw.trim() }))
    .filter((c) => c.value !== "")
    .map((c) => (c.name === "" ? c.value : c.name + FOLD_SEP + c.value));
  if (lines.length === 0) return [[cells[0], ""]];
  return lines.map((line, i) => [i === 0 ? cells[0] : "", line]);
}

/** That escape, unwritten: inside a cell the pipe is content, not a column boundary. */
const ESCAPED_PIPE_RE = /\\\|/g;

type DecoratedRow = Record<string, string>;

/**
 * The two ENDS are anchored, first cell to `label` and last to `content`, so widening a table never renames the columns
 * a two-column template was written against; whatever sits between them takes the numbered middle names.
 */
function rowFields(cells: string[], read: (raw: string) => string): DecoratedRow {
  const row: DecoratedRow = {
    [FIELD_LABEL]: read(cells[0]),
    [FIELD_CONTENT]: read(cells[cells.length - 1]),
  };
  cells.slice(1, -1).forEach((raw, i) => {
    row[middleField(i + 1)] = read(raw);
  });
  return row;
}

/** A template file ends on a newline, and that blank is not part of the zone it fills. */
const TRAILING_BLANKS_RE = /\n+$/;

/** One table cell: the shared treatment, plus the escape only a cell has. */
function cell(raw: string): string {
  return inertText(raw.replace(ESCAPED_PIPE_RE, "|"));
}

/**
 * The same cell as WRITTEN: unescaped and trimmed, nothing guarded and nothing styled. What leaves the engine for a
 * host or a reader, where cell() above is the RENDER's own reading and its marks must never travel.
 */
function bareCell(raw: string): string {
  return raw.replace(ESCAPED_PIPE_RE, "|").trim();
}

/**
 * The payload parsed as rows, or null when it is not a shape this supports: a pipe table of at least two columns, header
 * row MANDATORY (its cells may be empty), delimiter row, at least one data row.
 *
 * The HEADER fixes the arity and every line below must hold it, markdown's own rule. A row a cell SHORT is refused whole
 * rather than padded: guessing which column the missing one belonged to is the invention the fail-open exists to avoid.
 *
 * A row a cell LONG is the opposite case and is taken: nothing is absent, the extra pipe is a character the author wrote
 * without escaping, and rejoining it into the last column is the only reading that loses none of the line. Refusing it
 * printed the whole block raw, which reads as garbage and teaches an author who will never see the screen.
 */
interface ParsedTable {
  rows: DecoratedRow[];
  head?: DecoratedRow;
}

interface ParsedRows {
  styled: ParsedTable;
  bare: ParsedTable;
  arity: number;
  /** Past MAX_COLUMNS, the same table folded: what the render falls back to when the full one does not fit. */
  folded?: { styled: ParsedTable; bare: ParsedTable };
}

function parseRows(lines: string[]): ParsedRows | null {
  if (lines.length < 3) return null;
  const arity = arityOf(lines[0]);
  if (arity === undefined) return null;
  const { row: rowRe, delim: delimRe, tail: tailRe } = arityRes(arity);
  if (!delimRe.test(lines[1])) return null;
  const header = lines[0].match(rowRe)!.slice(1, arity + 1);
  const cellsOf: string[][] = [];
  for (const line of lines.slice(2)) {
    // Strict first, so a well-formed row never reaches the greedy tail and a bare pipe stays a column boundary.
    const m = line.match(rowRe) ?? line.match(tailRe);
    if (!m) return null;
    cellsOf.push(m.slice(1, arity + 1));
  }
  // Kept the moment ONE cell holds a word: `| | |` is what markdown forces on a table that wants no header, so an
  // all-blank one yields nothing. Judged on the RAW cells, before neutralising, since a control mark is not a word.
  // ONE walk of the cells, read twice: styled for the render, bare for whoever the engine hands the payload to.
  const both = (rowCells: string[][], headCells: string[]) => {
    const table = (read: (raw: string) => string): ParsedTable => {
      const rows = rowCells.map((cells) => rowFields(cells, read));
      const head = headCells.some((c) => c.trim() !== "") ? rowFields(headCells, read) : undefined;
      return head === undefined ? { rows } : { rows, head };
    };
    return { styled: table(cell), bare: table(bareCell) };
  };
  const parsed: ParsedRows = { ...both(cellsOf, header), arity };
  // A folded table's header names its columns in every entry already, so only its label column is left to head.
  if (arity > MAX_COLUMNS) {
    parsed.folded = both(cellsOf.flatMap((cells) => foldCells(header, cells)), [header[0], ""]);
  }
  return parsed;
}

interface Payload {
  data: Scope;
  /**
   * The same payload as WRITTEN, cell for cell: what leaves the engine for a host or a reader. `data` above is styled
   * and guarded for the RENDER alone, and its marks must never travel.
   */
  bare: Scope;
  /**
   * The kind the PAYLOAD named. Set here means the carrier leaves `dressing.type` unset, and that IS the whole
   * implementation of "the marker beats the attribute": render.ts overrides the field only when the dressing carries
   * one, so the marker wins by construction and can never select a typed FILE.
   */
  type?: string;
  /** A table past MAX_COLUMNS: its width, and the folded reading the render takes when the full one does not fit. */
  wide?: { arity: number; folded: { data: Scope; bare: Scope } };
}

/** The same lines, less the blank ones at either end. */
function trimBlanks(lines: string[]): string[] {
  let from = 0;
  let to = lines.length;
  while (from < to && lines[from] === "") from++;
  while (to > from && lines[to - 1] === "") to--;
  return lines.slice(from, to);
}

/**
 * The payload parsed as a blockquote, or null when a line of the zone is not one. `content` KEEPS the lines the author
 * wrote, so a quote of two lines is two lines on screen; a view drawing ONE band spends `flow` instead, which render.ts
 * derives from this for every way in.
 *
 * The optional marker is `[!TOKEN]` alone on the FIRST body line, reaching the template LOWERCASED in `type` because
 * the palette's classes are lowercase. A first line that is not exactly a marker STAYS the first line of the content.
 */
function parseQuote(zone: string[]): Payload | null {
  if (zone.length === 0) return null;
  const body: string[] = [];
  for (const line of zone) {
    // Prose that joined the zone (see the run rule below): no parser claims the mixture, so it fails open.
    if (!QUOTE_LINE_RE.test(line)) return null;
    body.push(line.replace(QUOTE_PREFIX_RE, ""));
  }
  const marked = body[0].trim().match(MARKER_RE);
  const type = marked === null ? undefined : marked[1].toLowerCase();
  // A blank line INSIDE the body is a paragraph break the author wrote, and it survives; the ones at either end are
  // spacing around the quote and never reach the screen.
  const lines = trimBlanks((marked === null ? body : body.slice(1)).map((l) => l.trim()));
  const pack = (content: string): Scope =>
    type === undefined
      ? { [FIELD_CONTENT]: content }
      : { [FIELD_TYPE]: type, [FIELD_CONTENT]: content };
  // Neutralised line by line, and never an empty one: a mark on a blank line is a line no reader can tell from text.
  const inertLine = (l: string): string => (l === "" ? "" : inertText(l));
  return { data: pack(lines.map(inertLine).join(NL)), bare: pack(lines.join(NL)), type };
}

/**
 * The two runs differ deliberately. A TABLE ends on the first line that no longer starts with a pipe, markdown's own
 * rule. A QUOTE ends on the first BLANK line, so prose written directly under it JOINS the zone and the whole thing
 * fails open, which is what makes "a quote must be followed by a blank line" a rule the author sees enforced.
 */
interface Shape {
  /** The name this shape rides under in Dressing.payload, where the template's own refusal judges it (render.ts). */
  payload: string;
  opens(line: string): boolean;
  holds(line: string): boolean;
  /** The zone's extent when per-line holds cannot say it: a fence ENDS ON its closing line, one line more then stop. */
  run?(lines: string[], from: number, stop: number): number;
  parse(zone: string[]): Payload | null;
}

const SHAPES: Shape[] = [
  {
    payload: PAYLOAD_TABLE,
    opens: (l) => PIPE_LINE_RE.test(l),
    holds: (l) => PIPE_LINE_RE.test(l),
    parse: (zone) => {
      const table = parseRows(zone);
      if (table === null) return null;
      const pack = (t: ParsedTable): Scope => {
        const data: Scope = { [FIELD_ROWS]: t.rows };
        if (t.head !== undefined) data[FIELD_HEAD] = t.head;
        return data;
      };
      const payload: Payload = { data: pack(table.styled), bare: pack(table.bare) };
      if (table.folded !== undefined) {
        payload.wide = {
          arity: table.arity,
          folded: { data: pack(table.folded.styled), bare: pack(table.folded.bare) },
        };
      }
      return payload;
    },
  },
  {
    payload: PAYLOAD_QUOTE,
    opens: (l) => QUOTE_LINE_RE.test(l),
    holds: (l) => l.trim() !== "",
    parse: parseQuote,
  },
  {
    payload: PAYLOAD_FENCE,
    opens: (l) => FENCE_OPEN_RE.test(l),
    // Never consulted: run() below owns the extent.
    holds: () => false,
    run: (lines, from, stop) => {
      for (let i = from + 1; i < stop; i++) if (FENCE_CLOSE_RE.test(lines[i])) return i + 1;
      return stop; // unclosed: the zone runs out with the text, and parse below refuses it
    },
    parse: (zone) => {
      // Opening line, at least one source line, closing line: anything less is a near-miss the author must see.
      if (zone.length < 3 || !FENCE_CLOSE_RE.test(zone[zone.length - 1])) return null;
      // RAW on both readings, deliberately, and UNJOINED: the body feeds a RENDERER, never a template slot, so
      // inertText here would hand the subprocess a marked source, and the engine neutralises the DRAWING instead
      // (render.ts). Line structure is the source's own syntax, so nothing trims and nothing rejoins with spaces.
      const source = zone.slice(1, -1).join("\n");
      return { data: { [FIELD_CONTENT]: source }, bare: { [FIELD_CONTENT]: source } };
    },
  },
  {
    payload: PAYLOAD_MARKDOWN,
    opens: (l) => MARKDOWN_OPEN_RE.test(l),
    holds: () => false,
    run: (lines, from, stop) => {
      const run = lines[from].match(MARKDOWN_OPEN_RE)![1];
      for (let i = from + 1; i < stop; i++) if (closesRun(lines[i], run)) return i + 1;
      return stop;
    },
    parse: (zone) => {
      const run = zone[0].match(MARKDOWN_OPEN_RE)![1];
      if (zone.length < 3 || !closesRun(zone[zone.length - 1], run)) return null;
      // RAW, as the diagram's: the engine draws it to a width and neutralises the drawing (src/markdown.ts).
      const source = zone.slice(1, -1).join("\n");
      return { data: { [FIELD_CONTENT]: source }, bare: { [FIELD_CONTENT]: source } };
    },
  },
];

/** Which shape a zone is, decided on its FIRST line and nowhere else. */
function shapeOf(line: string): Shape | undefined {
  return SHAPES.find((s) => s.opens(line));
}

function runEnd(shape: Shape | undefined, lines: string[], from: number, stop: number): number {
  if (shape?.run !== undefined) return shape.run(lines, from, stop);
  let end = from;
  if (shape !== undefined) while (end < stop && shape.holds(lines[end])) end++;
  return end;
}

/**
 * The first line past what a REFUSED decorator's shape can CLAIM: the lines that still OPEN its own kind. The run's
 * `end` is wider, since a quote run swallows prose and zones that must stay on screen to be rescanned.
 */
function claimedEnd(lines: string[], at: number): number {
  const shape = shapeOf(lines[at + 1]);
  // A split refuses on its SIDES, with no payload of its own to announce a shape: its decorator line is all it claims.
  if (shape === undefined) return at + 1;
  let end = at + 1;
  while (end < lines.length && shape.opens(lines[end])) end++;
  return end;
}

/** One decorated ZONE, as this carrier reads it before anything is drawn. */
interface Zone {
  deco: Decorator;
  /** What the payload parsed to. Null for a zone with NO payload, which is how a static view is summoned. */
  payload: Payload | null;
  /** A payload that ANNOUNCED a shape and then refused to parse: a near-miss, so the zone shows exactly as written. */
  refused: boolean;
  /** The line the zone begins on. */
  at: number;
  /** The first line PAST the zone. */
  end: number;
  /** The name of the shape that anchored, for Dressing.payload. Absent when no payload announced one. */
  form?: string;
  /** A split's two zones, in the order written. Set on a split that read both, and on nothing else. */
  sides?: Zone[];
}

/**
 * How a zone is DRESSED, in one place: see Payload.type, the unset field IS the precedence rule, and the shape rides
 * along on a parsed payload alone so a static summon announces none. The reader below hands it back untouched, or a
 * second render of the same zone could load another file than the one drawn.
 */
/** Wider than any terminal: a render there wraps no cell, which is what "it fits" is measured against. */
const UNBOUNDED_WIDTH = 1000;

/**
 * The reading of a wide table this view draws: the full one when the template declares its every column AND its render
 * at `limit` neither wraps a cell nor runs past it, the folded one otherwise. `draw` renders at a width, or at `limit`.
 */
function readingOf(
  payload: Payload,
  view: string,
  dirs: string | string[],
  type: string | undefined,
  limit: number,
  draw: (data: Scope, width?: number) => string
): { data: Scope; bare: Scope } {
  const wide = payload.wide;
  if (wide === undefined) return payload;
  const declared = loadTemplate(view, dirs, type).objectLists[FIELD_ROWS] ?? [];
  if (!declared.includes(middleField(wide.arity - MIN_COLUMNS))) return wide.folded;
  const drawn = draw(payload.data).split("\n");
  const fits =
    drawn.every((line) => printedWidth(line) <= limit) &&
    drawn.length === draw(payload.data, UNBOUNDED_WIDTH).split("\n").length;
  return fits ? payload : wide.folded;
}

function dressingOf(zone: Zone): Dressing {
  const base = zone.payload?.type === undefined ? zone.deco : { ...zone.deco, type: undefined };
  return zone.payload === null ? base : { ...base, payload: zone.form };
}

/** The views that lay out zones of their own, so neither can be one of them. */
const LAYOUTS = [SPLIT_VIEW, ASIDE_VIEW];

/**
 * One side of a split, anchored on line `at`: a decorated zone, or a bare payload taking the view its shape names. A
 * split is never a side, so one cannot nest in another.
 */
function sideAt(lines: string[], fences: Fence[], starts: number[], at: number): Zone | null {
  const deco = parseDecorator(lines[at]);
  if (deco !== null) return LAYOUTS.includes(deco.view) ? null : zoneAt(lines, fences, starts, at);
  const shape = shapeOf(lines[at]);
  const view = shape === undefined ? undefined : BARE_SIDE_VIEWS[shape.payload];
  if (shape === undefined || view === undefined) return null;
  const end = runEnd(shape, lines, at, lines.length);
  const payload = shape.parse(lines.slice(at, end));
  return { deco: { view }, payload, refused: payload === null, at, end, form: shape.payload };
}

/** A split's sides as far as they read, where they stop, and whether the text ran out before `stop` settled them. */
interface SplitRead {
  sides: Zone[];
  end: number;
  open: boolean;
}

function splitAt(lines: string[], fences: Fence[], starts: number[], at: number, stop: number): SplitRead {
  const sides: Zone[] = [];
  let next = at + 1;
  while (sides.length < SPLIT_SIDES) {
    // ONE blank line may part two sides: a quote ends on nothing else, so a quote written first needs it.
    if (sides.length && next < stop && lines[next].trim() === "") next++;
    if (next >= stop) return { sides, end: next, open: true };
    const side = sideAt(lines, fences, starts, next);
    if (side === null || side.refused) return { sides, end: next, open: side !== null && side.end >= stop };
    sides.push(side);
    next = side.end;
  }
  return { sides, end: next, open: next >= stop };
}

/** A zone drawn as a column: asked again at another width, or under a height ceiling. */
function sideOf(
  side: Zone,
  dirs: string | string[],
  options?: RenderOptions,
  host?: DisplayHost,
  cwd?: string
): Side {
  const dressing = dressingOf(side);
  return (width, height) => {
    const drawIn = (data: Scope, w?: number): string =>
      renderColumn(side.deco.view, data, dirs, undefined, options, dressing, { width: w ?? width, height });
    const read =
      side.payload === null
        ? { data: {}, bare: {} }
        : readingOf(side.payload, side.deco.view, dirs, dressing.type, width, drawIn);
    const injected = host?.inject?.(side.deco.view, namedFields(read.bare), cwd);
    const rendered = renderColumn(side.deco.view, read.data, dirs, injected, options, dressing, { width, height });
    const shown = rendered.replace(TRAILING_BLANKS_RE, "");
    if (shown.trim() === "") throw new Error(`view ${side.deco.view}: rendered hollow`);
    return shown.split("\n");
  };
}

/** One unit written after an aside's zone: a decorated zone, or a run of prose with the code fences inside it. */
interface Unit {
  zone?: Zone;
  prose?: string;
  /** The first line PAST the unit. */
  end: number;
}

/**
 * The units after an aside's zone, from line `from`, up to the first that cannot flow: a table, a layout, a view this
 * engine does not draw, a block the fenced pass already drew. `open` when the text ran out first, so more may come.
 */
function flowAt(
  lines: string[],
  fences: Fence[],
  starts: number[],
  from: number,
  stop: number,
  dirs: string | string[]
): { units: Unit[]; open: boolean } {
  const units: Unit[] = [];
  const ends = (line: string): boolean =>
    PIPE_LINE_RE.test(line) || line.search(ANSI_RE) !== -1 || parseDecorator(line) !== null;
  let i = from;
  for (;;) {
    while (i < stop && lines[i].trim() === "") i++;
    if (i >= stop) return { units, open: true };
    const deco = fenceAt(fences, starts[i]) === undefined ? parseDecorator(lines[i]) : null;
    if (deco !== null) {
      if (LAYOUTS.includes(deco.view) || defersView(deco.view) || !resolvesView(deco.view, dirs, deco.type)) break;
      const zone = zoneAt(lines, fences, starts, i);
      if (zone === null || zone.refused) return { units, open: zone !== null && zone.end >= stop };
      units.push({ zone, end: zone.end });
      i = zone.end;
      continue;
    }
    if (ends(lines[i])) break;
    let end = i;
    while (end < stop && lines[end].trim() !== "") {
      const fence = fenceAt(fences, starts[end]);
      if (fence !== undefined) {
        while (end < stop && starts[end] < fence.end) end++;
        continue;
      }
      if (ends(lines[end])) break;
      end++;
    }
    units.push({ prose: lines.slice(i, end).join(NL), end });
    i = end;
  }
  return { units, open: false };
}

/** An aside as drawn: its rows, the first line past what it took, and whether the column can still take more. */
interface Float {
  rows: string[];
  end: number;
  open: boolean;
}

function floatAt(
  lines: string[],
  fences: Fence[],
  starts: number[],
  zone: Zone,
  stop: number,
  dirs: string | string[],
  options?: RenderOptions,
  host?: DisplayHost,
  cwd?: string
): Float {
  const [figure] = zone.sides!;
  const flow = flowAt(lines, fences, starts, figure.end, stop, dirs);
  // Prose is drawn by the view a bare markdown fence takes, so the column reads as that view does in a split.
  const prose = (source: string): Zone => {
    const payload = { data: { [FIELD_CONTENT]: source }, bare: { [FIELD_CONTENT]: source } };
    const view = BARE_SIDE_VIEWS[PAYLOAD_MARKDOWN];
    return { deco: { view }, payload, refused: false, at: zone.at, end: zone.at, form: PAYLOAD_MARKDOWN };
  };
  const units = flow.units.map((unit) => sideOf(unit.zone ?? prose(unit.prose!), dirs, options, host, cwd));
  const figureSide = sideOf(figure, dirs, options, host, cwd);
  const content = maxBoxWidth(options);
  const drawn = composeFlow(figureSide, units, content);
  // Nothing beside it, the zone draws alone at the full width: a column holding nothing is a bar and a hole.
  if (drawn === undefined || drawn.taken === 0) {
    return { rows: figureSide(content), end: figure.end, open: drawn !== undefined && flow.open && !units.length };
  }
  return {
    rows: drawn.rows,
    end: flow.units[drawn.taken - 1].end,
    open: flow.open && drawn.taken === units.length,
  };
}

/**
 * The zone anchored on line `at`, or null where that line anchors none. ONE reading for the render and the reader, so
 * a gate and the screen can never disagree about where a zone starts, what it carries, or where it stops.
 */
function zoneAt(lines: string[], fences: Fence[], starts: number[], at: number): Zone | null {
  const deco = parseDecorator(lines[at]);
  // A decorator inside a code fence is being SHOWN, not written. Nothing here has an escape of its own.
  if (deco === null || fenceAt(fences, starts[at]) !== undefined) return null;
  // Short of both sides it is REFUSED, its line alone shown raw: what it failed to read is rescanned as ordinary zones.
  if (deco.view === SPLIT_VIEW) {
    const split = splitAt(lines, fences, starts, at, lines.length);
    const whole = split.sides.length === SPLIT_SIDES;
    return whole
      ? { deco, payload: null, refused: false, at, end: split.end, sides: split.sides }
      : { deco, payload: null, refused: true, at, end: at + 1 };
  }
  // The zone set aside is read as a split side is; what flows beside it is the render's to measure (floatAt).
  if (deco.view === ASIDE_VIEW) {
    const figure = sideAt(lines, fences, starts, at + 1);
    return figure === null || figure.refused
      ? { deco, payload: null, refused: true, at, end: at + 1 }
      : { deco, payload: null, refused: false, at, end: figure.end, sides: [figure] };
  }
  const below = at + 1;
  // NO payload engages with no data at all: a static view (welcome, the health check) is summoned by its line alone.
  const has = hasPayload(lines, below, lines.length);
  const shape = has ? shapeOf(lines[below]) : undefined;
  const end = runEnd(shape, lines, below, lines.length);
  const payload = shape === undefined ? null : shape.parse(lines.slice(below, end));
  return { deco, payload, refused: shape !== undefined && payload === null, at, end, form: shape?.payload };
}

/** One zone this pass did NOT draw, and the reason in the engine's own words, never reworded here. */
export interface ZoneRefusal {
  view: string;
  reason: string;
}

/** What one decorated PASS produced: the text, and the strict view's outcome when a zone here is what decided it. */
export interface Decorated {
  out: string;
  outcome: Outcome | null;
  /**
   * Every zone that did not draw, in order. The SCREEN says nothing about them, deliberately: fail-open is the runtime
   * rule and nothing may erase what the model sent. But a silence that teaches nothing at AUTHORING time is how a view
   * broken for every decorated block ever written ships unnoticed, so the reason is recorded for a caller to read.
   */
  refusals: ZoneRefusal[];
}

/** A piece's span read defensively: the walk must always advance, whatever another engine's claim states. */
function statedSpan(span: number): number {
  return Number.isInteger(span) && span >= 1 ? span : 1;
}

/**
 * Render every decorated zone of a message, each through its named template (and type), the decorator line consumed.
 * Fail-open per zone: an unknown template, an unsupported payload shape, or any render error leaves the zone EXACTLY as
 * written. The one exception is the host's STRICT view: refused, hollow or thrown, it shows the host's line instead.
 */
export function renderDecorated(
  text: string,
  dirs: string | string[],
  options?: RenderOptions,
  host?: DisplayHost,
  cwd?: string
): Decorated {
  if (!text.includes(DECORATOR_HINT)) return { out: text, outcome: null, refusals: [] };
  const lines = text.split("\n");
  const fences = fenceSpans(text);
  const starts = lineStarts(lines);
  const strict = host?.strict;
  const strictView = strict?.view;
  let outcome: Outcome | null = null;
  const refusals: ZoneRefusal[] = [];
  const refused = (view: string, reason: unknown): void => {
    refusals.push({ view, reason: reason instanceof Error ? reason.message : String(reason) });
  };
  // Every zone of a view spends its ordinal HERE, whatever branch takes it: the pre-pass counts every anchored zone
  // the same way, and a branch that skipped the count would shift every later key of that view by one.
  const ordinals = new Map<string, number>();
  const nth = (name: string): number => {
    const ordinal = ordinals.get(name) ?? 0;
    ordinals.set(name, ordinal + 1);
    return ordinal;
  };
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const zone = zoneAt(lines, fences, starts, i);
    if (zone === null) {
      out.push(lines[i]);
      continue;
    }
    const key = zoneKey(DECORATED_ZONE, zone.deco.view, nth(zone.deco.view));
    // A zone whose election this engine LOST comes before every other reading, the strict view included: deferring
    // means SILENCE, and a strict line drawn here would speak over the winner's render of this same zone. Where this
    // engine ASSEMBLES, the winner's published piece replaces the zone over the span the piece states; everywhere
    // else the zone is left exactly as written, decorator included, and reaches the winner untouched.
    if (defersView(zone.deco.view)) {
      const piece = pieceFor(key);
      if (piece === undefined) {
        out.push(lines[i]);
        continue;
      }
      out.push(...piece.text.split("\n"));
      i += statedSpan(piece.span) - 1;
      continue;
    }
    // A view this engine cannot RESOLVE is not this engine's zone: the run stays prose, exactly as a refusal leaves
    // it, and whoever holds the template answers it. The strict view alone is exempt, its failures owed a line. Won
    // (or unopposed) and declined all the same, so the verdict is published: the assembler must not wait for it.
    if (zone.deco.view !== strictView && !resolvesView(zone.deco.view, dirs, zone.deco.type)) {
      refused(zone.deco.view, `view ${zone.deco.view}: no template on this search path`);
      publishRaw(key);
      out.push(lines[i]);
      continue;
    }
    // Judged on the SHAPE, never on whether anything follows. A payload announcing itself and then refusing to parse
    // is a near-miss the author must see; prose announces nothing, claims no line, and leaves a static view summoned
    // as a line alone would. A view that spends slots throws below on no data, so arity decides, not a table here.
    if (zone.refused) {
      const reason = `view ${zone.deco.view}: payload refused`;
      refused(zone.deco.view, reason);
      // Except under the STRICT name: a near-miss is still its zone, and raw markdown is what this view was promised
      // never to show. The whole zone goes with the line, or the payload would follow the host's line raw.
      if (zone.deco.view === strictView && strict !== undefined) {
        outcome = failedOutcome(reason);
        const shown = strictLine(strict);
        // Only the lines its shape can CLAIM go with the replacement: the run also swallows prose and zones that were
        // never the payload's, and those are rescanned exactly as the non-strict path rescans them.
        const claimed = claimedEnd(lines, i);
        publishPiece(key, claimed - i, shown);
        out.push(shown);
        i = claimed - 1;
        continue;
      }
      publishRaw(key);
      out.push(lines[i]);
      continue; // a refused payload's lines follow untouched: raw markdown, valid anyway
    }
    if (zone.deco.view === ASIDE_VIEW) {
      try {
        const float = floatAt(lines, fences, starts, zone, lines.length, dirs, options, host, cwd);
        // A zone the column took spends its ordinal and is declared, never drawn alone: the piece below covers it.
        for (let at = zone.end; at < float.end; at++) {
          const flowed = zoneAt(lines, fences, starts, at);
          if (flowed === null) continue;
          publishRaw(zoneKey(DECORATED_ZONE, flowed.deco.view, nth(flowed.deco.view)));
          at = flowed.end - 1;
        }
        const shown = holdLeadingBlank(float.rows.join("\n"));
        publishPiece(key, float.end - i, shown);
        out.push(...shown.split("\n"));
        i = float.end - 1;
      } catch (e) {
        refused(zone.deco.view, e);
        publishRaw(key);
        out.push(lines[i]);
      }
      continue;
    }
    if (zone.sides !== undefined) {
      const sides = zone.sides;
      try {
        const drawn = sides.map((side) => sideOf(side, dirs, options, host, cwd));
        const shown = holdLeadingBlank(composeSplit(drawn[0], drawn[1], maxBoxWidth(options)).join("\n"));
        publishPiece(key, zone.end - i, shown);
        out.push(...shown.split("\n"));
      } catch (e) {
        // The WHOLE zone raw, never its sides rescanned: they spent no ordinal of their own in any count of the zones.
        refused(zone.deco.view, e);
        publishRaw(key);
        out.push(...lines.slice(i, zone.end));
      }
      i = zone.end - 1;
      continue;
    }
    const { deco, payload, end } = zone;
    try {
      const dressing: Dressing = dressingOf(zone);
      const drawAt = (d: Scope, width?: number): string =>
        renderView(deco.view, d, dirs, undefined, width === undefined ? options : { ...options, width }, dressing);
      const read =
        payload === null
          ? { data: {}, bare: {} }
          : readingOf(payload, deco.view, dirs, dressing.type, maxBoxWidth(options), drawAt);
      const data: Scope = read.data;
      // The host is handed the PARSED zone as WRITTEN (`bare`), in the grammar a block hands over and with lists
      // unsplit: the styled cells and their marks are the render's alone.
      const injected = host?.inject?.(deco.view, namedFields(read.bare), cwd);
      const rendered = renderView(deco.view, data, dirs, injected, options, dressing);
      // Raw over hollow, the narrowest of the three readings: render.ts owns the other two, and what is left here is
      // both of them passing while the fields all arrived BLANK (.tayomi/specs/fix/carrier-guards.md).
      if (rendered.trim() === "") {
        const reason = `view ${deco.view}: rendered hollow`;
        refused(deco.view, reason);
        if (deco.view === strictView && strict !== undefined) {
          outcome = failedOutcome(reason);
          const shown = strictLine(strict);
          publishPiece(key, end - i, shown);
          out.push(shown);
          i = end - 1;
          continue;
        }
        publishRaw(key);
        out.push(lines[i]);
        continue;
      }
      if (deco.view === strictView) outcome = okOutcome();
      // The render's own trailing blank is dropped, so the zone keeps the line structure the raw table had around it.
      const shown = holdLeadingBlank(rendered.replace(TRAILING_BLANKS_RE, ""));
      publishPiece(key, end - i, shown);
      out.push(...shown.split("\n"));
      i = end - 1;
    } catch (e) {
      refused(deco.view, e);
      if (deco.view === strictView && strict !== undefined) {
        outcome = failedOutcome(e);
        // The zone goes with the line it replaces, or the raw markdown this view was promised never to show would
        // follow it.
        const shown = strictLine(strict);
        publishPiece(key, end - i, shown);
        out.push(shown);
        i = end - 1;
        continue;
      }
      publishRaw(key);
      out.push(lines[i]); // fail-open: the decorator stays, the table follows raw
    }
  }
  return { out: out.join("\n"), outcome, refusals };
}

/** One decorated zone as a READER sees it: the view it names, what its carrier read, and where the zone begins. */
export interface DecoratedZone {
  view: string;
  data: Scope;
  /** What the render was DRESSED with here, so a second pass over this zone reads the view the screen read. */
  dressing: Dressing;
  /** The character offset of the decorator line, so zones of both carriers can be put back in the order written. */
  at: number;
}

/**
 * Every decorated zone of a message, in order, with what the CARRIER read: nothing rendered and no template loaded.
 * Every anchored zone is reported, so an unreadable payload is visible as its view carrying NOTHING, not an absence.
 */
export function decoratedZones(text: string): DecoratedZone[] {
  if (!text.includes(DECORATOR_HINT)) return [];
  const lines = text.split("\n");
  const fences = fenceSpans(text);
  const starts = lineStarts(lines);
  const zones: DecoratedZone[] = [];
  for (let i = 0; i < lines.length; i++) {
    const zone = zoneAt(lines, fences, starts, i);
    if (zone === null) continue;
    // A split draws nothing of its own: what a reader judges is the two zones it lays out, read as they are drawn.
    for (const side of zone.sides ?? []) {
      zones.push({ view: side.deco.view, data: side.payload?.bare ?? {}, dressing: dressingOf(side), at: starts[side.at] });
    }
    if (zone.sides !== undefined) {
      i = zone.end - 1;
      continue;
    }
    // The payload as WRITTEN: a reader compares words an author typed, and the styled cells are the render's alone.
    zones.push({
      view: zone.deco.view,
      data: zone.payload?.bare ?? {},
      dressing: dressingOf(zone),
      at: starts[i],
    });
    // A REFUSED run is rescanned line by line, exactly as the render rescans it: the run may have swallowed a
    // decorator of its own, which the screen draws and a reader must therefore report.
    if (!zone.refused) i = zone.end - 1;
  }
  return zones;
}

/** One decorated zone's SEAT in a composition: the view whose election owns it, and whether it can still grow. */
export interface ZoneSpan {
  view: string;
  closed: boolean;
}

/**
 * Every decorated zone with its extent settled or not, for the layer that must know what a flush still OWES: a piece
 * can only be awaited for a zone whose winner has rendered it, and the winner renders exactly the closed ones. Closed
 * is the cut's own reading, a line past the shape's run: a trailing line terminator is not a line, and a zone running
 * out with the text can still grow.
 */
export function zoneSpans(text: string): ZoneSpan[] {
  if (!text.includes(DECORATOR_HINT)) return [];
  const lines = text.split("\n");
  const fences = fenceSpans(text);
  const starts = lineStarts(lines);
  let stop = lines.length;
  if (stop > 0 && lines[stop - 1] === "") stop--;
  const spans: ZoneSpan[] = [];
  for (let i = 0; i < lines.length; i++) {
    const zone = zoneAt(lines, fences, starts, i);
    if (zone === null) continue;
    spans.push({ view: zone.deco.view, closed: zone.end < stop });
    // A REFUSED run is rescanned line by line, exactly as the render rescans it.
    if (!zone.refused) i = zone.end - 1;
  }
  return spans;
}

/**
 * Withhold a decorated zone that is still STREAMING: several raw lines collapse into fewer rendered ones, and a delta
 * already shown cannot be taken back. The zone has ended when a line after the SHAPE'S OWN RUN exists, read through the
 * same table the render uses so the two cannot disagree about where a zone stops.
 *
 * Accepted residual: anchoring needs the COMPLETE decorator line, so a token cut mid-stream ("@{view:ta") is prose here
 * and can reach the screen raw. Only the token's first characters can leak; the zone below never does.
 *
 * `resolves` says whether a name is a view THIS engine can draw. A name it cannot is not its zone: the run streams as
 * prose, nothing withheld, so nothing is ever re-emitted over what a peer holding the template answered.
 */
export function cutStreamingDecorated(
  text: string,
  resolves?: (name: string, type?: string) => boolean,
  dirs?: string | string[],
  options?: RenderOptions
): string {
  if (!text.includes(DECORATOR_HINT)) return text;
  const lines = text.split("\n");
  const fences = fenceSpans(text);
  const starts = lineStarts(lines);
  let end = lines.length;
  if (end > 0 && lines[end - 1] === "") end--; // a line terminator, not a line
  let last = -1;
  let deco: Decorator | null = null;
  for (let i = 0; i < end; i++) {
    // A fenced decorator anchors nothing, or a quoted example at the tail of a message withholds everything below it.
    const at = parseDecorator(lines[i]);
    if (at !== null && fenceAt(fences, starts[i]) === undefined) {
      last = i;
      deco = at;
    }
  }
  // A split still reading its sides is withheld from ITS line: its first side alone on screen would be drawn full width
  // and then jump into a column. The last decorator above can be its own second side, already closed, or none at all.
  let cut = -1;
  for (let i = 0; i < end && cut === -1; i++) {
    const at = parseDecorator(lines[i]);
    if (at?.view !== SPLIT_VIEW || fenceAt(fences, starts[i]) !== undefined) continue;
    if (resolves !== undefined && !resolves(SPLIT_VIEW)) continue;
    if (splitAt(lines, fences, starts, i, end).open) cut = i;
  }
  // An aside whose column can still take what is arriving is withheld whole: a paragraph shown below it now would have
  // to jump into the column at the next flush. Measured, since only a drawing knows where the zone's height runs out.
  for (let i = 0; i < end && dirs !== undefined; i++) {
    const at = parseDecorator(lines[i]);
    if (at?.view !== ASIDE_VIEW || fenceAt(fences, starts[i]) !== undefined) continue;
    if (resolves !== undefined && !resolves(ASIDE_VIEW)) continue;
    const zone = zoneAt(lines, fences, starts, i);
    if (zone === null) continue;
    // Refused while its zone is still arriving, as an unclosed fence is: refused for good, it withholds nothing.
    const shape = i + 1 < end ? shapeOf(lines[i + 1]) : undefined;
    let open = zone.refused && (i + 1 >= end || (shape !== undefined && runEnd(shape, lines, i + 1, end) >= end));
    if (!zone.refused) {
      try {
        open = floatAt(lines, fences, starts, zone, end, dirs, options).open;
      } catch {
        open = false;
      }
    }
    if (open) {
      cut = cut === -1 ? i : Math.min(cut, i);
      break;
    }
    i = zone.end - 1;
  }
  if (last !== -1 && (resolves === undefined || deco === null || resolves(deco.view, deco.type))) {
    const first = last + 1;
    const shape = first < end ? shapeOf(lines[first]) : undefined;
    // No line past the run yet: the zone can still grow.
    if (runEnd(shape, lines, first, end) >= end) cut = cut === -1 ? last : Math.min(cut, last);
  }
  if (cut === -1) return text;
  return cut === 0 ? "" : lines.slice(0, cut).join("\n") + "\n";
}
