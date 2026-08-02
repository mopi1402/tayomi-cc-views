// The decorator carrier: a line that NAMES the template dressing the plain-markdown
// payload below it.
//
//   @{view:table, type:warning}
//   | Item | Info |
//   | --- | --- |
//   | Decorator | one line above the payload |
//
// The separator is a comma, whitespace, or both, and the attributes come in any
// order: `@{view:table tone:dim}` is the same token.
//
// TWO payload shapes, and the FIRST line of the zone decides which, nowhere else. A
// leading pipe is a table, which reaches the template as `rows`. A leading `>` is a
// blockquote, which reaches it as `content`, and whose optional `[!WARNING]` marker
// reaches it as the `type` field:
//
//   @{view:banner}
//   > [!WARNING]
//   > two flaky suites, publication is blocked
//
// A quote is chosen over a bare paragraph because of what happens where this hook does
// NOT run: a marked quote is still a visible, self-describing block in a raw transcript
// and a native alert box in the renderers that matter, while a bare sentence is
// indistinguishable from prose and an invented table is a shape the author never wrote.
//
// The trade it exists for: the payload IS ordinary markdown, so the fallback costs
// nothing. Re-rendered from the transcript, the human gets the decorator line above a
// native table instead of the fenced block's code wall. It engages on INTENT, never on
// shape: an undecorated table is not this carrier's business, whatever its columns
// (the lesson of the retired table POC, which matched shape and hijacked ordinary
// tables; see .tayomi/tickets/decorated-views.md). Bare rather than HTML-commented,
// because terminals print `<!-- -->` verbatim.
//
// Two attributes, one axis each, because one of them could not serve both. `type`
// names the KIND of content and may pick a typed template FILE; `tone` names the LOOK,
// a palette tag stuck on this render like a class, selecting no file and carrying no
// meaning. A look wearing a semantic name (`type:even`) would lie to the model about
// what the content IS. Both are OPTIONAL, both fail open, and the template stays the
// sole owner of what it spends them on (template/render.ts).

import { MARKER_SOURCE } from "../data/language.js";
import { DECORATOR_CLOSE, DECORATOR_HINT } from "../data/markup.js";
import { renderView, type Dressing } from "../template/render.js";
import { inert, spanClose, spanOpen } from "../style.js";
import { fenceAt, fenceSpans } from "./fences.js";
import type { RenderOptions } from "../options.js";
import type { Scope } from "../scope.js";

/** What engages the pipeline, and what the line pattern anchors on. */
export { DECORATOR_HINT };

// Parsed by string, not by one composed regex: an optional inner group plus a
// trailing anchor backtracks on a near-miss (the lesson directives.ts already
// paid for), and the SAST gate rightly refuses the shape. Every pattern left is
// a single anchored quantifier over one atom, which cannot backtrack.
const NAME_RE = /^[\w-]+$/;
const ATTR_RE = /^(type|tone):([\w-]+)$/;
/** A comma, whitespace, or both: `@{view:table, type:warning}` is `@{view:table type:warning}`. */
const ATTR_SEP = /[,\s]+/;

interface Decorator extends Dressing {
  view: string;
}

// The decorator must be ALONE on its line (surrounding whitespace aside), which is
// what keeps a decorator QUOTED in prose from engaging anything.
//
// Requiring the comma exactly voided the WHOLE token on a near-miss: `@{view:table
// type:warning}` used to print raw, decorator line included, which reads as the engine
// being broken rather than as a syntax slip. Anything that is not a known attribute
// still makes the line prose, so the token stays as hard to trigger by accident.
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
 * Does a decorator have a payload at all? The line below it exists and is not blank.
 *
 * Its EXISTENCE and its EXTENT are two questions, and conflating them was the defect.
 * The extent belongs to the payload's own shape (a table ends on the first line that
 * no longer starts with a pipe, which is markdown's rule and not this carrier's), but
 * asking the pipe scanner where the zone ends made everything it cannot read look like
 * NOTHING: the run came back empty, an empty zone is how a static view is summoned,
 * and a data-driven view was handed `{}` and drew its furniture around no content.
 *
 * A blank line is the one boundary every markdown block agrees on, so it is the one
 * this question is allowed to use. Below it, a payload EXISTS, and a payload no parser
 * here claims fails open with the decorator line and the text left exactly as written.
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

// A two-column row. Each cell accepts an escaped pipe (`\|`), which markdown renders
// correctly: the POC's cell pattern rejected it and silently fell back, so the escape
// is part of the contract here.
const ROW_RE = /^[ \t]*\|((?:\\\||[^|\n])*)\|((?:\\\||[^|\n])*)\|[ \t]*$/;
const DELIM_RE = /^[ \t]*\|[ \t]*:?-+:?[ \t]*\|[ \t]*:?-+:?[ \t]*\|[ \t]*$/;
/** That escape, unwritten: inside a cell the pipe is content, not a column boundary. */
const ESCAPED_PIPE_RE = /\\\|/g;

/** One payload row as the template receives it. */
interface DecoratedRow {
  label: string;
  content: string;
}

// The emphasis lives in the markdown PER SPAN, so it survives every re-render from the
// transcript and the screen honours it as ANSI. Nothing is added the message did not
// carry, which is what buried the POC's whole-cell bolding.
const BOLD_SPAN_RE = /\*\*([^*\n]+)\*\*/g;
/** The weight the span renders in, framed so the line gets its own style back after it. */
const BOLD_TAG = "b";
const BOLD_SPAN = `${spanOpen(BOLD_TAG)}$1${spanClose(BOLD_TAG)}`;

/** A template file ends on a newline, and that blank is not part of the zone it fills. */
const TRAILING_BLANKS_RE = /\n+$/;

/**
 * Message text becoming a SCOPE VALUE, which is the one seam this engine holds: text
 * able to open a colour is able to close one the render meant to keep, and to paint a
 * line in a tone contradicting what the line says.
 *
 * Neutralised FIRST, styled second: both end up in one string, so the order is the whole
 * guarantee. The emphasis lives in the markdown PER SPAN, so it survives every re-render
 * from the transcript, and nothing is added the message did not carry.
 *
 * SHARED by both payload shapes, because a quote's body is message text in exactly the
 * way a cell is. A second copy is how the two would come to disagree about which of the
 * model's markup survives, on a seam where disagreeing means one of them lets a colour
 * through.
 */
function inertText(raw: string): string {
  return inert(raw.trim()).replace(BOLD_SPAN_RE, BOLD_SPAN);
}

/** One table cell: the shared treatment, plus the escape only a cell has. */
function cell(raw: string): string {
  return inertText(raw.replace(ESCAPED_PIPE_RE, "|"));
}

/**
 * The payload parsed as rows, or null when it is not the shape v1 supports: a
 * two-column pipe table, header row MANDATORY (its cells may be empty), delimiter
 * row, at least one data row. An empty label cell continues the label above, and
 * stays empty here: how a continuation looks is the template's business.
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
   * The kind the PAYLOAD named, when it named one. Set here means the carrier leaves
   * `dressing.type` unset, and that is the entire implementation of "the marker beats
   * the attribute": render.ts overrides the field from the dressing only when the
   * dressing carries one, so an unset dressing makes the marker win by construction,
   * costs no edit there, and keeps a marker from ever selecting a typed FILE.
   */
  type?: string;
}

/**
 * The payload parsed as a blockquote, or null when a line of the zone is not one.
 *
 * The `>` prefixes come off and the body joins with ONE space, which is markdown's own
 * soft-wrap semantics, so the render and the hookless fallback read the same sentence.
 *
 * The optional marker is `[!TOKEN]` alone on the FIRST body line, and it reaches the
 * template LOWERCASED in the `type` field. That lowercasing is what makes the whole
 * design need nothing from the palette: toneClass already reads that field and the
 * palette's classes are lowercase, so `[!WARNING]` paints yellow with nothing touched.
 * The uppercase the author wrote comes back at the other end, from the template's table.
 *
 * A first line that is not exactly a marker STAYS the first line of the content and
 * prints inside the band, which is this engine's standing discipline: a malformed line
 * falls through to the body where the author sees it, rather than vanishing.
 */
function parseQuote(zone: string[]): Payload | null {
  if (zone.length === 0) return null;
  const body: string[] = [];
  for (const line of zone) {
    // Prose that joined the zone (see the run rule below): no parser claims the
    // mixture, so the whole thing fails open with the quote left as written.
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
 * The payload shapes, one entry each: the line that OPENS the shape, the run that
 * BELONGS to it, and the parser that claims it. One table and one dispatch site, so a
 * third shape later is a row here rather than a second scan through the message.
 *
 * The two runs differ, and deliberately. A TABLE ends on the first line that no longer
 * starts with a pipe, which is markdown's own rule and the one this carrier already
 * shipped. A QUOTE ends on the first BLANK line, so prose written directly under it
 * JOINS the zone: no parser claims the mixture and the whole thing fails open, which is
 * what makes "a quote must be followed by a blank line or end the message" a rule the
 * author sees enforced rather than one they have to remember.
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
 * Render every decorated zone of a message, each through its named template (and
 * type), the decorator line consumed. Fail-open per zone: an unknown template, a
 * payload that is not the supported shape, or any render error leaves the zone
 * EXACTLY as written, decorator line included, so the screen shows what the
 * transcript holds.
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
    // A decorator inside a code fence is being SHOWN, not written, which is what
    // documentation about this package is made of. Nothing here has an escape of its
    // own, so the fence is it.
    if (deco === null || fenceAt(fences, starts[i]) !== undefined) {
      out.push(lines[i]);
      continue;
    }
    // A decorator with NO payload engages with no data at all: a static view
    // (welcome, the health check) is summoned by its line alone. A payload that
    // EXISTS but is not a shape a parser here claims fails open: half a table is a
    // mistake to show, never an empty scope to render. hasPayload is what tells the
    // two apart, and it does not consult the table parser to do it.
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
      // The payload's own kind takes the dressing's place rather than joining it: see
      // Payload.type for why that unset field IS the precedence rule.
      const dressing = payload?.type === undefined ? deco : { ...deco, type: undefined };
      const rendered = renderView(deco.view, data, dirs, undefined, options, dressing);
      // Raw over hollow, the LAST of the three readings, and the narrowest. render.ts
      // owns the two that matter: no data arrived, and data arrived the template reads
      // none of. What is left for the output to answer is the case where both of those
      // pass and the screen still gets nothing: the fields the template reads all
      // arrived BLANK. A blank line where content stood is the same lie as an empty
      // skeleton, so it fails open too.
      //
      // This used to carry the second reading as well, by asking whether the render put
      // ink on screen. It could not: a template drawing literal furniture (banner.view
      // fills a band and draws two caps against it) always puts ink on screen, so a
      // table handed to the banner was swallowed behind a pill around nothing.
      if (rendered.trim() === "") {
        out.push(lines[i]);
        continue;
      }
      // The render replaces the whole zone; its own trailing blank line (a
      // template file ends on a newline) is dropped so the zone keeps exactly
      // the line structure the raw table had around it.
      out.push(...rendered.replace(TRAILING_BLANKS_RE, "").split("\n"));
      i = end - 1;
    } catch {
      out.push(lines[i]); // fail-open: the decorator stays, the table follows raw
    }
  }
  return out.join("\n");
}

/**
 * Withhold a decorated zone that is still STREAMING: several raw lines collapse
 * into fewer rendered ones, and a delta already shown cannot be taken back. The
 * decorator line is the anchor (the POC had to GUESS from a trailing run of pipe
 * lines): from the last decorator whose zone has not ended yet, everything is
 * held back, and the final delta reveals the zone rendered, or raw on failure.
 *
 * The zone has ended when a line after the SHAPE'S OWN RUN exists, and each shape
 * answers for its own: a table ends on the first line that no longer starts with a pipe
 * (markdown's own block rule), a quote on the first blank line. One line's first
 * character is enough to know either. Reading the run through the same table the render
 * does is what keeps the two from disagreeing about where a zone stops, which is a
 * disagreement that costs the screen: hold too little and a half-parsed band reaches it
 * before the flush that completes it, and a delta already shown cannot be retracted.
 *
 * Accepted residual, the same class as the mid-marker note in pipeline.ts: the
 * anchoring needs the COMPLETE decorator line, so a token cut mid-stream
 * ("@{view:ta") is prose to this cut and can reach the screen raw before it
 * completes, and a delta already shown cannot be retracted. Only the token's
 * own first characters can leak; the zone below the anchor never does.
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
    // A fenced decorator anchors nothing, for the same reason it renders nothing:
    // otherwise a quoted example at the tail of a message withholds everything below
    // it until the flush that closes the fence.
    if (parseDecorator(lines[i]) !== null && fenceAt(fences, starts[i]) === undefined) last = i;
  }
  if (last === -1) return text;
  const first = last + 1;
  const shape = first < end ? shapeOf(lines[first]) : undefined;
  const after = runEnd(shape, lines, first, end);
  if (after < end) return text; // a line past the run exists: the zone is closed
  return last === 0 ? "" : lines.slice(0, last).join("\n") + "\n";
}
