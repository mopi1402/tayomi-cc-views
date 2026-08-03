// The decorator carrier: a line that NAMES the template dressing the plain-markdown payload below it.
//
//   @{view:table, type:warning}
//   | Item | Info |
//   | --- | --- |
//   | Decorator | one line above the payload |
//
// Separator is a comma, whitespace or both, and attributes come in any order.
//
// TWO payload shapes, decided by the zone's FIRST line and nowhere else. A leading pipe is a table, reaching the
// template as `rows`. A leading `>` is a blockquote, reaching it as `content`, its optional `[!WARNING]` marker as
// `type`.
//
// Why a quote rather than a paragraph, why the trade is worth it, and why engagement is on INTENT and never on shape:
// docs/architecture/architecture.md, "The decorator's trade". The two attributes are docs/architecture/view-language.md's.

import { MARKER_SOURCE } from "../data/language.js";
import { DECORATOR_CLOSE, DECORATOR_HINT } from "../data/markup.js";
import { renderView, type Dressing } from "../template/render.js";
import { inert, spanClose, spanOpen } from "../style.js";
import { fenceAt, fenceSpans } from "./fences.js";
import type { RenderOptions } from "../options.js";
import type { Scope } from "../scope.js";

/** What engages the pipeline, and what the line pattern anchors on. */
export { DECORATOR_HINT };

// Parsed by string, not by one composed regex: an optional inner group plus a trailing anchor backtracks on a near-miss
// (the lesson directives.ts already paid for), and the SAST gate rightly refuses the shape.
const NAME_RE = /^[\w-]+$/;
const ATTR_RE = /^(type|tone):([\w-]+)$/;
/** A comma, whitespace, or both: `@{view:table, type:warning}` is `@{view:table type:warning}`. */
const ATTR_SEP = /[,\s]+/;

interface Decorator extends Dressing {
  view: string;
}

// ALONE on its line (whitespace aside), which is what keeps a decorator quoted in prose from engaging anything.
//
// Requiring the comma exactly voided the WHOLE token on a near-miss: `@{view:table type:warning}` printed raw,
// decorator line included, which reads as the engine being broken rather than as a syntax slip.
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
    if (m[1] === "type") deco.type = m[2];
    else deco.tone = m[2];
  }
  return deco;
}

/**
 * Does a decorator have a payload at all? Its EXISTENCE and its EXTENT are two questions, and conflating them was the
 * defect: asking the pipe scanner where the zone ends made everything it cannot read look like NOTHING, and an empty
 * zone is how a static view is summoned, so a data-driven view was handed `{}` and drew furniture around no content.
 */
function hasPayload(lines: string[], below: number, stop: number): boolean {
  return below < stop && lines[below].trim() !== "";
}

/** Anything pipe-shaped: the table payload's own line shape, and where its zone ends. */
const PIPE_LINE_RE = /^[ \t]*\|/;
/** Anything quote-shaped: the blockquote payload's own line shape. */
const QUOTE_LINE_RE = /^[ \t]*>/;
/** The marker off a body line, and the one optional space markdown allows after `>`. */
const QUOTE_PREFIX_RE = /^[ \t]*>[ \t]?/;
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

// A two-column row. Each cell accepts an escaped pipe (`\|`), which markdown renders correctly: the POC's cell pattern
// rejected it and silently fell back.
const ROW_RE = /^[ \t]*\|((?:\\\||[^|\n])*)\|((?:\\\||[^|\n])*)\|[ \t]*$/;
const DELIM_RE = /^[ \t]*\|[ \t]*:?-+:?[ \t]*\|[ \t]*:?-+:?[ \t]*\|[ \t]*$/;
/** That escape, unwritten: inside a cell the pipe is content, not a column boundary. */
const ESCAPED_PIPE_RE = /\\\|/g;

/** One payload row as the template receives it. */
interface DecoratedRow {
  label: string;
  content: string;
}

// PER SPAN, so the emphasis survives every re-render from the transcript and nothing is added the message did not
// carry. Whole-cell bolding is what buried the POC.
const BOLD_SPAN_RE = /\*\*([^*\n]+)\*\*/g;
/** The weight the span renders in, framed so the line gets its own style back after it. */
const BOLD_TAG = "b";
const BOLD_SPAN = `${spanOpen(BOLD_TAG)}$1${spanClose(BOLD_TAG)}`;

/** A template file ends on a newline, and that blank is not part of the zone it fills. */
const TRAILING_BLANKS_RE = /\n+$/;

/**
 * Message text becoming a SCOPE VALUE, one of the two neutralising seams (docs/architecture/architecture.md).
 *
 * Neutralised FIRST, styled second: both end up in one string, so the ORDER is the whole guarantee. Shared by both
 * payload shapes, because a second copy is how the two would come to disagree on it.
 */
function inertText(raw: string): string {
  return inert(raw.trim()).replace(BOLD_SPAN_RE, BOLD_SPAN);
}

/** One table cell: the shared treatment, plus the escape only a cell has. */
function cell(raw: string): string {
  return inertText(raw.replace(ESCAPED_PIPE_RE, "|"));
}

/**
 * The payload parsed as rows, or null when it is not the shape v1 supports: a two-column pipe table, header row
 * MANDATORY (its cells may be empty), delimiter row, at least one data row. An empty label cell continues the label
 * above and stays empty here: how a continuation looks is the template's business.
 */
function parseRows(lines: string[]): DecoratedRow[] | null {
  if (lines.length < 3) return null;
  if (!ROW_RE.test(lines[0])) return null;
  if (!DELIM_RE.test(lines[1])) return null;
  const rows: DecoratedRow[] = [];
  for (const line of lines.slice(2)) {
    const m = line.match(ROW_RE);
    if (!m) return null;
    rows.push({ label: cell(m[1]), content: cell(m[2]) });
  }
  return rows;
}

/** A payload a parser claimed, as the render entry receives it. */
interface Payload {
  /** The fields the template renders against. */
  data: Scope;
  /**
   * The kind the PAYLOAD named. Set here means the carrier leaves `dressing.type` unset, and that IS the whole
   * implementation of "the marker beats the attribute": render.ts overrides the field only when the dressing carries
   * one, so the marker wins by construction and can never select a typed FILE.
   */
  type?: string;
}

/**
 * The payload parsed as a blockquote, or null when a line of the zone is not one.
 *
 * The `>` prefixes come off and the body joins with ONE space, markdown's own soft-wrap semantics, so the render and
 * the hookless fallback read the same sentence.
 *
 * The optional marker is `[!TOKEN]` alone on the FIRST body line, reaching the template LOWERCASED in `type`: the
 * palette's classes are lowercase, so `[!WARNING]` paints yellow with nothing else touched. A first line that is not
 * exactly a marker STAYS the first line of the content, where the author sees it.
 */
function parseQuote(zone: string[]): Payload | null {
  if (zone.length === 0) return null;
  const body: string[] = [];
  for (const line of zone) {
    // Prose that joined the zone (see the run rule below): no parser claims the mixture, so the whole thing fails open
    // with the quote left as written.
    if (!QUOTE_LINE_RE.test(line)) return null;
    body.push(line.replace(QUOTE_PREFIX_RE, ""));
  }
  const marked = body[0].trim().match(MARKER_RE);
  const type = marked === null ? undefined : marked[1].toLowerCase();
  const content = inertText(
    (marked === null ? body : body.slice(1))
      .map((l) => l.trim())
      .filter((l) => l !== "")
      .join(" ")
  );
  return { data: type === undefined ? { content } : { type, content }, type };
}

/**
 * The payload shapes, one entry each, so a third one is a row here rather than a second scan through the message.
 *
 * The two runs differ deliberately. A TABLE ends on the first line that no longer starts with a pipe, markdown's own
 * rule. A QUOTE ends on the first BLANK line, so prose written directly under it JOINS the zone and the whole thing
 * fails open, which is what makes "a quote must be followed by a blank line" a rule the author sees enforced.
 */
interface Shape {
  opens(line: string): boolean;
  holds(line: string): boolean;
  parse(zone: string[]): Payload | null;
}

const SHAPES: Shape[] = [
  {
    opens: (l) => PIPE_LINE_RE.test(l),
    holds: (l) => PIPE_LINE_RE.test(l),
    parse: (zone) => {
      const rows = parseRows(zone);
      return rows === null ? null : { data: { rows } };
    },
  },
  {
    opens: (l) => QUOTE_LINE_RE.test(l),
    holds: (l) => l.trim() !== "",
    parse: parseQuote,
  },
];

/** Which shape a zone is, decided on its FIRST line and nowhere else. */
function shapeOf(line: string): Shape | undefined {
  return SHAPES.find((s) => s.opens(line));
}

/** Where the run belonging to `shape` ends, counting from the first payload line. */
function runEnd(shape: Shape | undefined, lines: string[], from: number, stop: number): number {
  let end = from;
  if (shape !== undefined) while (end < stop && shape.holds(lines[end])) end++;
  return end;
}

/**
 * Render every decorated zone of a message, each through its named template (and type), the decorator line consumed.
 * Fail-open per zone: an unknown template, an unsupported payload shape, or any render error leaves the zone EXACTLY as
 * written, so the screen shows what the transcript holds.
 */
export function renderDecorated(
  text: string,
  dirs: string | string[],
  options?: RenderOptions
): string {
  if (!text.includes(DECORATOR_HINT)) return text;
  const lines = text.split("\n");
  const fences = fenceSpans(text);
  const starts = lineStarts(lines);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const deco = parseDecorator(lines[i]);
    // A decorator inside a code fence is being SHOWN, not written, which is what documentation about this package is
    // made of. Nothing here has an escape of its own.
    if (deco === null || fenceAt(fences, starts[i]) !== undefined) {
      out.push(lines[i]);
      continue;
    }
    // NO payload engages with no data at all: a static view (welcome, the health check) is summoned by its line alone.
    // A payload that EXISTS but fits no parser fails open: half a table is a mistake to show, never an empty scope to
    // render.
    const has = hasPayload(lines, i + 1, lines.length);
    const shape = has ? shapeOf(lines[i + 1]) : undefined;
    const end = runEnd(shape, lines, i + 1, lines.length);
    const payload = shape === undefined ? null : shape.parse(lines.slice(i + 1, end));
    if (has && payload === null) {
      out.push(lines[i]);
      continue; // the payload lines follow untouched: raw markdown, valid anyway
    }
    try {
      const data = payload === null ? {} : payload.data;
      // The payload's own kind takes the dressing's place rather than joining it: see Payload.type for why that unset
      // field IS the precedence rule.
      const dressing = payload?.type === undefined ? deco : { ...deco, type: undefined };
      const rendered = renderView(deco.view, data, dirs, undefined, options, dressing);
      // Raw over hollow, the narrowest of the three readings: render.ts owns the other two, and what is left here is
      // both of them passing while the fields all arrived BLANK (.tayomi/specs/fix/carrier-guards.md).
      if (rendered.trim() === "") {
        out.push(lines[i]);
        continue;
      }
      // The render's own trailing blank (a template file ends on a newline) is dropped, so the zone keeps exactly the
      // line structure the raw table had around it.
      out.push(...rendered.replace(TRAILING_BLANKS_RE, "").split("\n"));
      i = end - 1;
    } catch {
      out.push(lines[i]); // fail-open: the decorator stays, the table follows raw
    }
  }
  return out.join("\n");
}

/**
 * Withhold a decorated zone that is still STREAMING: several raw lines collapse into fewer rendered ones, and a delta
 * already shown cannot be taken back. The decorator line is the anchor, and the zone has ended when a line after the
 * SHAPE'S OWN RUN exists. Reading that run through the same table the render does is what keeps the two from
 * disagreeing about where a zone stops.
 *
 * Accepted residual: anchoring needs the COMPLETE decorator line, so a token cut mid-stream ("@{view:ta") is prose here
 * and can reach the screen raw. Only the token's first characters can leak; the zone below never does.
 */
export function cutStreamingDecorated(text: string): string {
  if (!text.includes(DECORATOR_HINT)) return text;
  const lines = text.split("\n");
  const fences = fenceSpans(text);
  const starts = lineStarts(lines);
  let end = lines.length;
  if (end > 0 && lines[end - 1] === "") end--; // a line terminator, not a line
  let last = -1;
  for (let i = 0; i < end; i++) {
    // A fenced decorator anchors nothing, for the same reason it renders nothing: otherwise a quoted example at the
    // tail of a message withholds everything below it.
    if (parseDecorator(lines[i]) !== null && fenceAt(fences, starts[i]) === undefined) last = i;
  }
  if (last === -1) return text;
  const first = last + 1;
  const shape = first < end ? shapeOf(lines[first]) : undefined;
  const after = runEnd(shape, lines, first, end);
  if (after < end) return text; // a line past the run exists: the zone is closed
  return last === 0 ? "" : lines.slice(0, last).join("\n") + "\n";
}
