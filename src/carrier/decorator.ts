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
  PAYLOAD_QUOTE,
  PAYLOAD_TABLE,
  middleField,
} from "../data/language.js";
import {
  DECORATOR_CLOSE,
  DECORATOR_HINT,
  DIAGRAM_INFO,
  EMPHASIS_STAR,
  FENCE,
  NAME_MARK,
  NL,
  QUOTE_MARK,
  TABLE_MARK,
} from "../data/markup.js";
import { renderView, type Dressing } from "../template/render.js";
import { resolvesView } from "../template/load.js";
import { defersView } from "../platform/peers.js";
import { DECORATED_ZONE, pieceFor, publishPiece, publishRaw, zoneKey } from "../platform/compose.js";
import { namedFields } from "../template/view-data.js";
import { inert, spanClose, spanOpen } from "../style.js";
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

/** Narrowest first: the order is what makes the search below deterministic. */
const ARITIES: readonly number[] = Array.from(
  { length: MAX_COLUMNS - MIN_COLUMNS + 1 },
  (_, i) => MIN_COLUMNS + i
);
const ROW_RES = new Map(ARITIES.map((n) => [n, re(rowSource(n, CELL))]));
const DELIM_RES = new Map(ARITIES.map((n) => [n, re(rowSource(n, DELIM_CELL))]));

/** The LAST cell of a data row, greedy to the closing delimiter, so the bare pipes of a surplus stay in it as content. */
const TAIL_CELL = String.raw`(.*)`;

/** The same row with that tail in last position. A cell short still matches nothing here: too few pipes to reach it. */
const tailSource = (n: number): string =>
  `^[ \t]*${TABLE_SOURCE}${[...Array.from({ length: n - 1 }, () => CELL), TAIL_CELL].join(TABLE_SOURCE)}${TABLE_SOURCE}[ \t]*$`;
const TAIL_RES = new Map(ARITIES.map((n) => [n, re(tailSource(n))]));

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

// PER SPAN, so the emphasis survives every re-render from the transcript and nothing is added the message did not
// carry. Whole-cell bolding is what buried the POC.
/** The star, escaped for a pattern: it is regex punctuation. */
const STAR = `\\${EMPHASIS_STAR}`;
// eslint-disable-next-line security/detect-non-literal-regexp
const BOLD_SPAN_RE = new RegExp(`${STAR}${STAR}([^${EMPHASIS_STAR}\\n]+)${STAR}${STAR}`, "g");
const BOLD_TAG = "b";
const BOLD_SPAN = `${spanOpen(BOLD_TAG)}$1${spanClose(BOLD_TAG)}`;

/** A template file ends on a newline, and that blank is not part of the zone it fills. */
const TRAILING_BLANKS_RE = /\n+$/;

/**
 * Message text becoming a SCOPE VALUE, one of the two neutralising seams (docs/architecture/architecture.md).
 * Neutralised FIRST, styled second: both end up in one string, so the ORDER is the whole guarantee.
 */
function inertText(raw: string): string {
  return inert(raw.trim()).replace(BOLD_SPAN_RE, BOLD_SPAN);
}

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
 * The payload parsed as rows, or null when it is not a shape this supports: a pipe table of two to four columns, header
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

function parseRows(lines: string[]): { styled: ParsedTable; bare: ParsedTable } | null {
  if (lines.length < 3) return null;
  const arity = ARITIES.find((n) => ROW_RES.get(n)!.test(lines[0]));
  if (arity === undefined) return null;
  if (!DELIM_RES.get(arity)!.test(lines[1])) return null;
  const rowRe = ROW_RES.get(arity)!;
  const tailRe = TAIL_RES.get(arity)!;
  const cellsOf: string[][] = [];
  for (const line of lines.slice(2)) {
    // Strict first, so a well-formed row never reaches the greedy tail and a bare pipe stays a column boundary.
    const m = line.match(rowRe) ?? line.match(tailRe);
    if (!m) return null;
    cellsOf.push(m.slice(1, arity + 1));
  }
  // Kept the moment ONE cell holds a word: `| | |` is what markdown forces on a table that wants no header, so an
  // all-blank one yields nothing. Judged on the RAW cells, before neutralising, since a control mark is not a word.
  const headCells = lines[0].match(rowRe)!.slice(1, arity + 1);
  // ONE walk of the cells, read twice: styled for the render, bare for whoever the engine hands the payload to.
  const table = (read: (raw: string) => string): ParsedTable => {
    const rows = cellsOf.map((cells) => rowFields(cells, read));
    const head = headCells.some((c) => c.trim() !== "") ? rowFields(headCells, read) : undefined;
    return head === undefined ? { rows } : { rows, head };
  };
  return { styled: table(cell), bare: table(bareCell) };
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
  const lines = (marked === null ? body : body.slice(1))
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const pack = (content: string): Scope =>
    type === undefined
      ? { [FIELD_CONTENT]: content }
      : { [FIELD_TYPE]: type, [FIELD_CONTENT]: content };
  // Neutralised line by line: inertText over a joined body would mark the separator it is joined on.
  return { data: pack(lines.map(inertText).join(NL)), bare: pack(lines.join(NL)), type };
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
      return { data: pack(table.styled), bare: pack(table.bare) };
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
  const shape = shapeOf(lines[at + 1])!; // a refusal means a payload announced its shape on this line
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
  /** The first line PAST the zone. */
  end: number;
  /** The name of the shape that anchored, for Dressing.payload. Absent when no payload announced one. */
  form?: string;
}

/**
 * The zone anchored on line `at`, or null where that line anchors none. ONE reading for the render and the reader, so
 * a gate and the screen can never disagree about where a zone starts, what it carries, or where it stops.
 */
function zoneAt(lines: string[], fences: Fence[], starts: number[], at: number): Zone | null {
  const deco = parseDecorator(lines[at]);
  // A decorator inside a code fence is being SHOWN, not written. Nothing here has an escape of its own.
  if (deco === null || fenceAt(fences, starts[at]) !== undefined) return null;
  const below = at + 1;
  // NO payload engages with no data at all: a static view (welcome, the health check) is summoned by its line alone.
  const has = hasPayload(lines, below, lines.length);
  const shape = has ? shapeOf(lines[below]) : undefined;
  const end = runEnd(shape, lines, below, lines.length);
  const payload = shape === undefined ? null : shape.parse(lines.slice(below, end));
  return { deco, payload, refused: shape !== undefined && payload === null, end, form: shape?.payload };
}

/** What one decorated PASS produced: the text, and the strict view's outcome when a zone here is what decided it. */
export interface Decorated {
  out: string;
  outcome: Outcome | null;
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
  if (!text.includes(DECORATOR_HINT)) return { out: text, outcome: null };
  const lines = text.split("\n");
  const fences = fenceSpans(text);
  const starts = lineStarts(lines);
  const strict = host?.strict;
  const strictView = strict?.view;
  let outcome: Outcome | null = null;
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
      publishRaw(key);
      out.push(lines[i]);
      continue;
    }
    // Judged on the SHAPE, never on whether anything follows. A payload announcing itself and then refusing to parse
    // is a near-miss the author must see; prose announces nothing, claims no line, and leaves a static view summoned
    // as a line alone would. A view that spends slots throws below on no data, so arity decides, not a table here.
    if (zone.refused) {
      // Except under the STRICT name: a near-miss is still its zone, and raw markdown is what this view was promised
      // never to show. The whole zone goes with the line, or the payload would follow the host's line raw.
      if (zone.deco.view === strictView && strict !== undefined) {
        outcome = failedOutcome(`view ${zone.deco.view}: payload refused`);
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
    const { deco, payload, end } = zone;
    try {
      const data: Scope = payload === null ? {} : payload.data;
      // See Payload.type: the unset field IS the precedence rule. The shape rides along on a PARSED payload alone, so
      // the template's own refusal (render.ts) judges the form the author actually wrote, and a static summon none.
      const base = payload?.type === undefined ? deco : { ...deco, type: undefined };
      const dressing: Dressing = payload === null ? base : { ...base, payload: zone.form };
      // The host is handed the PARSED zone as WRITTEN (`bare`), in the grammar a block hands over and with lists
      // unsplit: the styled cells and their marks are the render's alone.
      const injected = host?.inject?.(deco.view, namedFields(payload === null ? {} : payload.bare), cwd);
      const rendered = renderView(deco.view, data, dirs, injected, options, dressing);
      // Raw over hollow, the narrowest of the three readings: render.ts owns the other two, and what is left here is
      // both of them passing while the fields all arrived BLANK (.tayomi/specs/fix/carrier-guards.md).
      if (rendered.trim() === "") {
        if (deco.view === strictView && strict !== undefined) {
          outcome = failedOutcome(`view ${deco.view}: rendered hollow`);
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
      const shown = rendered.replace(TRAILING_BLANKS_RE, "");
      publishPiece(key, end - i, shown);
      out.push(...shown.split("\n"));
      i = end - 1;
    } catch (e) {
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
  return { out: out.join("\n"), outcome };
}

/** One decorated zone as a READER sees it: the view it names, what its carrier read, and where the zone begins. */
export interface DecoratedZone {
  view: string;
  data: Scope;
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
    // The payload as WRITTEN: a reader compares words an author typed, and the styled cells are the render's alone.
    zones.push({ view: zone.deco.view, data: zone.payload?.bare ?? {}, at: starts[i] });
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
  resolves?: (name: string, type?: string) => boolean
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
  if (last === -1) return text;
  if (resolves !== undefined && deco !== null && !resolves(deco.view, deco.type)) return text;
  const first = last + 1;
  const shape = first < end ? shapeOf(lines[first]) : undefined;
  const after = runEnd(shape, lines, first, end);
  if (after < end) return text; // a line past the run exists: the zone is closed
  return last === 0 ? "" : lines.slice(0, last).join("\n") + "\n";
}
