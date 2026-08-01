// The decorator carrier: a line that NAMES the template (and the semantic type)
// dressing the plain-markdown payload below it.
//
//   @{view:table, type:warning}
//   | Item | Info |
//   | --- | --- |
//   | Decorator | one line above the payload |
//
// The separator is a comma, whitespace, or both, and the attributes come in any
// order: `@{view:table tone:dim}` is the same token.
//
// The trade this carrier exists for: the payload IS ordinary markdown, so the
// fallback costs nothing. Re-rendered from the transcript (the hook only ever
// transforms what reaches the screen), the human gets the decorator line above a
// native table instead of the fenced block's code wall. It engages on INTENT,
// never on shape: an undecorated table, whatever its rows or columns, is not this
// carrier's business (the lesson of the retired table POC, which matched shape and
// hijacked ordinary tables; see .tayomi/tickets/decorated-views.md).
//
// The token begins with `@{view:` and nothing shorter: PowerShell writes
// `@{Name='x'}` and Perl writes `@{$ref}`, so a bare `@{` would capture them.
// Bare, not HTML-commented, because terminals print `<!-- -->` verbatim.
//
// Two attributes, one axis each, because ONE of them could not serve both:
//
// `type` names the KIND of content (warning, error, success), never a look: markdown
// admonitions are the prior art, and the decorator is text the model re-reads, so the
// name must inform. It picks a typed template when the SHAPE differs (load.ts resolves
// `<name>.<type>.view`), and dresses the default template when only the colour does.
//
// `tone` names the LOOK, a palette tag stuck on this render like a class: it selects
// no file and carries no meaning. It exists because the alternative was a near-copy of
// a template per colour, and because a look wearing a semantic name (`type:even`) lies
// to the model about what the content IS.
//
// Both are OPTIONAL and both fail open. The template stays the sole owner of what it
// spends them ON: the tone slot it writes, the file it is (see template/render.ts).

import { renderView, type Dressing } from "../template/render.js";
import { RESET_MARK, tagMark } from "../style.js";
import type { RenderOptions } from "../options.js";

/** What engages the pipeline, and what the line pattern anchors on. */
export const DECORATOR_HINT = "@{view:";
const TOKEN_CLOSE = "}";

// Parsed by string, not by one composed regex: an optional inner group plus a
// trailing anchor backtracks on a near-miss (the lesson directives.ts already
// paid for), and the SAST gate rightly refuses the shape. Every pattern left is
// a single anchored quantifier over one atom, which cannot backtrack.
const NAME_RE = /^[\w-]+$/;
const ATTR_RE = /^(type|tone):([\w-]+)$/;

interface Decorator extends Dressing {
  view: string;
}

// The decorator must be ALONE on its line (surrounding whitespace aside), which
// is what keeps a decorator QUOTED in prose from engaging anything.
//
// The view name comes first, its attributes follow in any order, and the separator is
// a comma, whitespace, or both: a model writes all three, and requiring the comma
// exactly voided the WHOLE token on a near-miss (`@{view:table type:warning}` used to
// print raw, decorator line included, which reads as the engine being broken rather
// than as a syntax slip). Anything that is not a known attribute still makes the line
// prose, so the token stays as hard to trigger by accident as it was.
function parseDecorator(line: string): Decorator | null {
  const t = line.trim();
  if (!t.startsWith(DECORATOR_HINT) || !t.endsWith(TOKEN_CLOSE)) return null;
  const inner = t.slice(DECORATOR_HINT.length, -TOKEN_CLOSE.length);
  const [view, ...attrs] = inner.split(/[,\s]+/).filter((part) => part !== "");
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

/** Anything pipe-shaped: the payload's own line shape, and the block rule's boundary. */
const PIPE_LINE_RE = /^[ \t]*\|/;

// A two-column row. Each cell accepts an escaped pipe (`\|`), which markdown
// renders correctly: the POC's cell pattern rejected it and silently fell back,
// so the escape is part of the contract here.
const ROW_RE = /^[ \t]*\|((?:\\\||[^|\n])*)\|((?:\\\||[^|\n])*)\|[ \t]*$/;
const DELIM_RE = /^[ \t]*\|[ \t]*:?-+:?[ \t]*\|[ \t]*:?-+:?[ \t]*\|[ \t]*$/;

export interface DecoratedRow {
  label: string;
  content: string;
}

// The cell as the template receives it. Unescapes the pipe, and converts the
// AUTHORED bold spans to the engine's markup: the emphasis lives in the markdown
// per span (so it survives every re-render from the transcript), and the screen
// honours it as ANSI. Nothing is added the message did not carry, which is what
// buried the POC's whole-cell bolding.
const BOLD_SPAN_RE = /\*\*([^*\n]+)\*\*/g;

function cell(raw: string): string {
  return raw
    .trim()
    .replace(/\\\|/g, "|")
    .replace(BOLD_SPAN_RE, `${tagMark("b")}$1${RESET_MARK}`);
}

/**
 * The payload parsed as rows, or null when it is not the shape v1 supports: a
 * two-column pipe table, header row MANDATORY (its cells may be empty), delimiter
 * row, at least one data row. An empty label cell continues the label above, and
 * stays empty here: how a continuation looks is the template's business.
 */
export function parseRows(lines: string[]): DecoratedRow[] | null {
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
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const deco = parseDecorator(lines[i]);
    if (deco === null) {
      out.push(lines[i]);
      continue;
    }
    let end = i + 1;
    while (end < lines.length && PIPE_LINE_RE.test(lines[end])) end++;
    const payload = lines.slice(i + 1, end);
    // A decorator with NO payload engages with no data at all: a static view
    // (welcome, the health check) is summoned by its line alone. A payload that
    // EXISTS but is not the supported shape still fails open: half a table is a
    // mistake to show, never an empty scope to render. The hollow-render guard
    // below keeps the trade safe: a data-driven view summoned bare renders
    // whitespace and falls back to the raw line.
    const rows = parseRows(payload);
    if (payload.length > 0 && rows === null) {
      out.push(lines[i]);
      continue; // the payload lines follow untouched: raw markdown, valid anyway
    }
    try {
      const data = rows === null ? {} : { rows };
      const rendered = renderView(deco.view, data, dirs, undefined, options, deco);
      // Raw over hollow, this carrier's side of render.ts's guard (which only
      // sees string data): a template that exists but reads none of the rows
      // renders whitespace, and a blank where content stood is worse than raw.
      if (rendered.trim() === "") {
        out.push(lines[i]);
        continue;
      }
      // The render replaces the whole zone; its own trailing blank line (a
      // template file ends on a newline) is dropped so the zone keeps exactly
      // the line structure the raw table had around it.
      out.push(...rendered.replace(/\n+$/, "").split("\n"));
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
 * The zone has ended when a line after the pipe run EXISTS: markdown's own block
 * rule, a table ends on the first line that no longer starts with a pipe, and
 * that line's first character is enough to know it.
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
  let end = lines.length;
  if (end > 0 && lines[end - 1] === "") end--; // a line terminator, not a line
  let last = -1;
  for (let i = 0; i < end; i++) {
    if (parseDecorator(lines[i]) !== null) last = i;
  }
  if (last === -1) return text;
  let after = last + 1;
  while (after < end && PIPE_LINE_RE.test(lines[after])) after++;
  if (after < end) return text; // a line past the run exists: the zone is closed
  return last === 0 ? "" : lines.slice(0, last).join("\n") + "\n";
}
