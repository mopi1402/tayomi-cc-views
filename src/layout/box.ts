// The @box frame: the one thing a template cannot express on its own, since the width of the top rule depends on every
// line the body will produce. It takes an already-rendered body, measures it, then wraps. It sizes to its CONTENT and
// not to the terminal, which keeps a one-line block one line wide.

import { RESET_MARK, tagMark } from "../style.js";
import { RULE_MARK, isRule } from "./marks.js";
import { printedWidth } from "./measure.js";
import { wrapLine } from "./wrap.js";

// Every width below is DERIVED from these pieces rather than counted by hand, so the day the corners go square no
// arithmetic elsewhere is left believing a dash run is three columns long.
const V = "│";
const H = "─";
const TL = "╭";
const TR = "╮";
const BL = "╰";
const BR = "╯";
const PAD = " ";

const EDGES = 2 * printedWidth(V);

/**
 * What the frame spends on every content line: "│ " on the left, " │" on the right, so that difference IS the box's
 * content width. Exported because a caller composing a line the frame must accept whole (the @aside region) measures
 * against the same number.
 */
export const BOX_CHROME = 2 * printedWidth(V + PAD);

/** An inner rule keeps no trailing space: it runs from its prefix into the border. */
const RULE_ROW_CHROME = EDGES + printedWidth(PAD);

const BADGE_TAIL = `${H}${H}${TR}`;
/** "╭" + fill + " " + badge + " " + "──╮", less the fill and the badge themselves. */
const BADGE_CHROME = printedWidth(TL + PAD + PAD + BADGE_TAIL);
// A rule never drops below one dash, so a long badge widens the box instead of colliding with the corner, and an empty
// box still draws as a box.
const MIN_FILL = 1;
const MIN_TOTAL = printedWidth(TL) + MIN_FILL + printedWidth(TR);

// A blank line between two @each blocks is emitted unconditionally, so a template that spaces its sections would show a
// gap for a section that rendered nothing. Collapsing a run turns that into a separator appearing only BETWEEN two
// sections that produced lines, and an @rule is conditional the same way.
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

const contentTotal = (line: string): number => printedWidth(line) + BOX_CHROME;

/** Shared by the two containers, which agree on where a rule's dashes begin and differ only in what surrounds them. */
function rulePrefix(line: string): { text: string; width: number } {
  const carried = line.slice(RULE_MARK.length);
  const w = printedWidth(carried);
  const gap = ruleGap(w);
  return { text: carried + gap, width: w + printedWidth(gap) };
}

/** The dashes a rule fills with. Never fewer than one, or a rule squeezed to nothing reads as a line the body lost. */
const dashRun = (n: number): string =>
  `${tagMark("box_rule")}${H.repeat(Math.max(MIN_FILL, n))}${RESET_MARK}`;

/**
 * The same, for a line that may be a RULE, which does not cost what it measures: sized on its prefix alone it
 * under-claims by the gap and the minimum dash, and the MIN_FILL clamp then pushes the row one column past the frame.
 */
function lineTotal(line: string): number {
  if (!isRule(line)) return contentTotal(line);
  return RULE_ROW_CHROME + rulePrefix(line).width + MIN_FILL;
}

// `width` is passed explicitly where the payload carries styling the caller added AFTER measuring (the zone's tone), so
// the row pads on the text's own width rather than on a tag whose name it cannot vouch for.
function row(text: string, total: number, edge: string, width = printedWidth(text)): string {
  const pad = PAD.repeat(Math.max(0, total - BOX_CHROME - width));
  return `${border(edge)}${PAD}${text}${pad}${PAD}${border(edge)}`;
}

function fullRule(total: number, edge: string): string {
  const dashes = H.repeat(total - EDGES);
  return `${border(edge)}${tagMark("box_rule")}${dashes}${RESET_MARK}${border(edge)}`;
}

// `limit` is HANDED IN rather than probed here: taking it as a value is what keeps this layer free of platform imports.
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
  // The zone wraps like body content but never carries a rule or a gutter prefix.
  const zone = foot.flatMap((l) => wrapLine(l, limit - BOX_CHROME));
  const edge = tone ?? "dim";
  const h = printedWidth(head);
  const r = printedWidth(right);
  // A zone line is measured plainly whatever it holds, exactly as the loop below draws it: only a BODY line is a rule.
  const fits = [...body.map(lineTotal), ...zone.map(contentTotal)].reduce(
    (n, x) => Math.max(n, x),
    0
  );
  const total = Math.max(fits, h + BOX_CHROME, r > 0 ? r + BADGE_CHROME + MIN_FILL : MIN_TOTAL);
  const fill = total - BADGE_CHROME - r;
  const out: string[] = [];
  // With no badge the rule runs unbroken: the two spaces framing a badge would otherwise leave a gap in the border.
  out.push(
    r === 0
      ? `${tagMark(edge)}${TL}${H.repeat(total - EDGES)}${TR}${RESET_MARK}`
      : `${tagMark(edge)}${TL}${H.repeat(fill)}${PAD}${RESET_MARK}` +
          `${right}${tagMark(edge)}${PAD}${BADGE_TAIL}${RESET_MARK}`
  );
  out.push(row(head, total, edge, h));
  out.push(fullRule(total, edge));
  for (const line of body) {
    // An inner rule keeps its prefix and then runs to the border, consuming the padding AND the trailing space a
    // content line leaves.
    if (isRule(line)) {
      const p = rulePrefix(line);
      out.push(
        `${border(edge)}${PAD}${p.text}` +
          `${dashRun(total - RULE_ROW_CHROME - p.width)}${border(edge)}`
      );
      continue;
    }
    out.push(row(line, total, edge));
  }
  // The zone carries the badge's tone on the TEXT and not merely on the border beside it.
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

/**
 * The same container with no outline: the body machinery, and none of the chrome. A border, a title, a badge and a zone
 * never reach this function, those four directives falling through to the body where an author reads them on screen.
 *
 * Body lines are handed back unpadded: with no right border to meet, a pad would be trailing blanks and nothing else.
 */
export function flowBody(rawBody: string[], limit: number): string[] {
  // A rule with nothing to divide IS the content, and the two laws below would each undo it: the collapsing drops a
  // rule for want of neighbours, and a width measured over the body has nothing to measure. So it takes the width it
  // was HANDED. This is what a lone `@rule` in a bare container draws, and it is the whole of views/hr.view.
  const drawn = rawBody.filter((l) => isRule(l) || printedWidth(l) > 0);
  if (drawn.length > 0 && drawn.every(isRule)) {
    return drawn.map((l) => `${rulePrefix(l).text}${dashRun(limit - rulePrefix(l).width)}`);
  }
  const body = collapseBlanks(rawBody).flatMap((l) => (isRule(l) ? [l] : wrapLine(l, limit)));
  const total = body.reduce(
    (n, l) => Math.max(n, isRule(l) ? rulePrefix(l).width + MIN_FILL : printedWidth(l)),
    0
  );
  return body.map((l) => (isRule(l) ? `${rulePrefix(l).text}${dashRun(total - rulePrefix(l).width)}` : l));
}
