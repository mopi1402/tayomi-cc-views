// The @box frame: the one thing a template cannot express on its own.
//
// The engine emits one line at a time and knows no block, so the width of the top
// rule depends on every line the body will produce, including the ones an @each has
// not expanded yet. The box closes that gap: it takes an already-rendered body,
// measures the produced lines, then wraps them. It sizes to its CONTENT rather than
// to the terminal, which keeps a one-line block one line wide.

import { RESET_MARK, tagMark } from "../style.js";
import { RULE_MARK, isRule } from "./marks.js";
import { printedWidth } from "./measure.js";
import { wrapLine } from "./wrap.js";

// The outline, drawn once. Every width below is DERIVED from these pieces rather
// than counted by hand, so changing the border is changing this block and nothing
// else: the day the corners go square, no arithmetic elsewhere is left believing a
// dash run is three columns long.
const V = "│";
const H = "─";
const TL = "╭";
const TR = "╮";
const BL = "╰";
const BR = "╯";
const PAD = " ";

/** The two vertical borders, or the two corners standing in their column. */
const EDGES = 2 * printedWidth(V);

/**
 * What the frame spends on every content line: "│ " on the left, " │" on the right.
 * A body line is wrapped to `limit - BOX_CHROME`, so that difference IS the box's
 * content width. Exported because a caller composing a line the frame must accept
 * whole (the @aside region) has to measure against the same number.
 */
export const BOX_CHROME = 2 * printedWidth(V + PAD);

/** An inner rule keeps no trailing space: it runs from its prefix into the border. */
const RULE_ROW_CHROME = EDGES + printedWidth(PAD);

// The short dash run that carries the top rule back into its corner past a badge.
const BADGE_TAIL = `${H}${H}${TR}`;
/** "╭" + fill + " " + badge + " " + "──╮", less the fill and the badge themselves. */
const BADGE_CHROME = printedWidth(TL + PAD + PAD + BADGE_TAIL);
// A rule never drops below one dash, so a long badge widens the box instead of
// colliding with the corner, and an empty box still draws as a box.
const MIN_FILL = 1;
const MIN_TOTAL = printedWidth(TL) + MIN_FILL + printedWidth(TR);

// A blank line between two @each blocks is emitted unconditionally by the engine, so
// a template that spaces its sections would show a gap for a section that rendered
// nothing, and two gaps between two absent ones. The box absorbs that: leading and
// trailing blanks are dropped and a run collapses to one, which turns an
// unconditional separator into one that only appears BETWEEN two sections that
// actually produced lines.
// An @rule line is conditional the same way: it separates two HALVES of one section,
// so it survives only between two lines that printed. That is what keeps a one-half
// section rule-free without the engine gaining a conditional.
export function collapseBlanks(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isRule(line)) {
      const prev = out[out.length - 1];
      const next = lines[i + 1];
      if (prev == null || printedWidth(prev) === 0) continue;
      if (next == null || printedWidth(next) === 0 || isRule(next)) continue;
      out.push(line);
      continue;
    }
    const blank = printedWidth(line) === 0;
    if (blank && (out.length === 0 || printedWidth(out[out.length - 1]) === 0)) continue;
    out.push(blank ? "" : line);
  }
  while (out.length > 0 && printedWidth(out[out.length - 1]) === 0) out.pop();
  return out;
}

const border = (edge: string): string => `${tagMark(edge)}${V}${RESET_MARK}`;

/** A rule with a prefix sets it off from its dashes; one without runs from the border. */
const ruleGap = (w: number): string => (w > 0 ? PAD : "");

/** The narrowest frame an ordinary line fits in, its two borders and padding included. */
const contentTotal = (line: string): number => printedWidth(line) + BOX_CHROME;

/**
 * The same, for a line that may be a RULE, which does not cost what it measures.
 *
 * A rule row prints its prefix, then the gap and at least one dash carrying it into the
 * border. Sized on the prefix alone it under-claims by exactly that, and the MIN_FILL
 * clamp below then pushes the row one column past the frame: a visibly broken border,
 * reachable whenever a section's label outruns the content around it.
 */
function lineTotal(line: string): number {
  if (!isRule(line)) return contentTotal(line);
  const w = printedWidth(line.slice(RULE_MARK.length));
  return RULE_ROW_CHROME + w + printedWidth(ruleGap(w)) + MIN_FILL;
}

// `width` is passed explicitly where the payload carries styling the caller added
// AFTER measuring (the zone's tone), so the row pads on the text's own width rather
// than on a tag whose name it cannot vouch for.
function row(text: string, total: number, edge: string, width = printedWidth(text)): string {
  const pad = PAD.repeat(Math.max(0, total - BOX_CHROME - width));
  return `${border(edge)}${PAD}${text}${pad}${PAD}${border(edge)}`;
}

// A full-width division, drawn in box_rule: internal furniture rather than outline.
function fullRule(total: number, edge: string): string {
  const dashes = H.repeat(total - EDGES);
  return `${border(edge)}${tagMark("box_rule")}${dashes}${RESET_MARK}${border(edge)}`;
}

// `limit` is HANDED IN rather than probed here: where the width comes from is
// platform policy resolved once at the render entry, and taking it as a value is what
// keeps this layer free of platform imports.
export function frameBox(
  head: string,
  right: string,
  rawBody: string[],
  foot: string[],
  tone: string | undefined,
  limit: number
): string[] {
  const body = collapseBlanks(rawBody).flatMap((l) =>
    isRule(l) ? [l] : wrapLine(l, limit - BOX_CHROME)
  );
  // The zone wraps like body content but never carries a rule or a gutter prefix: it
  // is the one thing read last, flush against the border.
  const zone = foot.flatMap((l) => wrapLine(l, limit - BOX_CHROME));
  const edge = tone ?? "dim";
  const h = printedWidth(head);
  const r = printedWidth(right);
  // The narrowest frame every line fits in. A zone line is measured plainly whatever it
  // holds, exactly as the loop below draws it: only a BODY line is read as a rule.
  const fits = [...body.map(lineTotal), ...zone.map(contentTotal)].reduce(
    (n, x) => Math.max(n, x),
    0
  );
  const total = Math.max(fits, h + BOX_CHROME, r > 0 ? r + BADGE_CHROME + MIN_FILL : MIN_TOTAL);
  const fill = total - BADGE_CHROME - r;
  const out: string[] = [];
  // With no badge there is nothing to set off, so the rule runs unbroken: the two
  // spaces that frame a badge would otherwise leave a gap in the border.
  out.push(
    r === 0
      ? `${tagMark(edge)}${TL}${H.repeat(total - EDGES)}${TR}${RESET_MARK}`
      : `${tagMark(edge)}${TL}${H.repeat(fill)}${PAD}${RESET_MARK}` +
          `${right}${tagMark(edge)}${PAD}${BADGE_TAIL}${RESET_MARK}`
  );
  out.push(row(head, total, edge, h));
  out.push(fullRule(total, edge));
  for (const line of body) {
    // An inner rule keeps its prefix (a section label and its gutter bar) and then
    // runs to the border, consuming the padding AND the trailing space a content line
    // leaves: it reads as a division of the section rather than one more line of it.
    if (isRule(line)) {
      const prefix = line.slice(RULE_MARK.length);
      const w = printedWidth(prefix);
      const gap = ruleGap(w);
      // The floor is what lineTotal sized the frame to honour, so it never bites here.
      // Kept as a floor all the same: a negative count is not something to repeat.
      const dashes = Math.max(MIN_FILL, total - RULE_ROW_CHROME - printedWidth(gap) - w);
      out.push(
        `${border(edge)}${PAD}${prefix}${gap}` +
          `${tagMark("box_rule")}${H.repeat(dashes)}${RESET_MARK}${border(edge)}`
      );
      continue;
    }
    out.push(row(line, total, edge));
  }
  // The zone sits under its own full-width rule, below everything the body holds
  // (including any section the display layer injected), and carries the badge's tone
  // on the TEXT, not merely on the border beside it.
  if (zone.length > 0) {
    out.push(fullRule(total, edge));
    for (const line of zone) {
      const text = tone == null ? line : `${tagMark(tone)}${line}${RESET_MARK}`;
      out.push(row(text, total, edge, printedWidth(line)));
    }
  }
  out.push(`${tagMark(edge)}${BL}${H.repeat(total - EDGES)}${BR}${RESET_MARK}`);
  return out;
}
