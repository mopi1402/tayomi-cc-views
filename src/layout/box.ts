// The @box frame: the one thing a template cannot express on its own.
//
// The engine emits one line at a time and knows no block, so the width of the top
// rule depends on every line the body will produce, including the ones an @each has
// not expanded yet. The box closes that gap: it takes an already-rendered body,
// measures the produced lines, then wraps them. It sizes to its CONTENT rather than
// to the terminal, which keeps a one-line block one line wide.

import { RULE_MARK, isRule } from "./marks.js";
import { printedWidth } from "./measure.js";
import { wrapLine } from "./wrap.js";

// A blank line between two @each blocks is emitted unconditionally by the
// engine, so a template that spaces its sections would show a gap for a section
// that rendered nothing, and two gaps between two absent ones. The box absorbs
// that: leading and trailing blanks are dropped and a run of blanks collapses to
// one, which turns an unconditional separator in the template into a separator
// that only appears BETWEEN two sections that actually produced lines.
// An @rule line is conditional in the same way and for the same reason: it
// separates two HALVES of one section, so it survives only between two lines
// that actually printed. Dropped when it would lead, when it would trail, and
// when the line it would separate from is a blank (the case where the half below
// it rendered nothing), which is what keeps a one-half section rule-free without
// the engine gaining a conditional.
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

// The three shapes of a framed line, each written ONCE. They all print to the same
// total: "│ " + payload + pad + " │".
//
// `width` is passed explicitly where the payload carries styling the caller added
// AFTER measuring (the zone's tone), so the row pads on the text's own width rather
// than on a tag whose name it cannot vouch for.
function row(text: string, total: number, edge: string, width = printedWidth(text)): string {
  const pad = " ".repeat(Math.max(0, total - 4 - width));
  return `{{${edge}}}│{{/}} ${text}${pad} {{${edge}}}│{{/}}`;
}

// A full-width division. Drawn in box_rule rather than in the outline tone: it is
// internal furniture rather than the block's outline (see the palette).
function fullRule(total: number, edge: string): string {
  return `{{${edge}}}│{{/}}{{box_rule}}${"─".repeat(total - 2)}{{/}}{{${edge}}}│{{/}}`;
}

// `limit` is HANDED IN rather than probed here: where the width comes from (a fixed
// number, an env var, a probe) is platform policy resolved once at the render entry,
// and taking it as a value is what keeps this layer free of platform imports.
export function frameBox(
  head: string,
  right: string,
  rawBody: string[],
  foot: string[],
  tone: string | undefined,
  limit: number
): string[] {
  const body = collapseBlanks(rawBody).flatMap((l) =>
    isRule(l) ? [l] : wrapLine(l, limit - 4)
  );
  // The zone wraps like body content but never carries a rule or a gutter prefix:
  // it is the one thing read last, flush against the border.
  const zone = foot.flatMap((l) => wrapLine(l, limit - 4));
  const edge = tone ?? "dim";
  const h = printedWidth(head);
  const r = printedWidth(right);
  const content = [...body, ...zone].reduce((n, l) => Math.max(n, printedWidth(l)), 0);
  // Four kinds of line, all printing to the same total:
  //   top rule:  "╭" + fill + " " + right + " " + "──╮"   =  6 + r + fill
  //   title:     "│ " + head + pad + " │"                 =  4 + h + pad
  //   rule:      "│" + (total - 2) + "│"
  //   content:   "│ " + line + pad + " │"                 =  4 + line + pad
  // The fill never drops below one dash, so a long state badge widens the box
  // instead of colliding with the corner.
  const total = Math.max(content + 4, h + 4, r > 0 ? r + 7 : 3);
  const fill = total - 6 - r;
  const out: string[] = [];
  // With no badge there is nothing to set off, so the rule runs unbroken: the
  // two spaces that frame a badge would otherwise leave a gap in the border.
  out.push(
    r === 0
      ? `{{${edge}}}╭${"─".repeat(total - 2)}╮{{/}}`
      : `{{${edge}}}╭${"─".repeat(fill)} {{/}}${right}{{${edge}}} ──╮{{/}}`
  );
  out.push(row(head, total, edge, h));
  out.push(fullRule(total, edge));
  for (const line of body) {
    // An inner rule keeps its prefix (a section label and its gutter bar) and
    // then runs to the border, consuming the padding AND the trailing space a
    // content line leaves: it reads as a division of the section rather than as
    // one more line of it. The dash run never drops below one.
    if (isRule(line)) {
      const prefix = line.slice(RULE_MARK.length);
      const w = printedWidth(prefix);
      const gap = w > 0 ? " " : "";
      const dashes = Math.max(1, total - 3 - gap.length - w);
      out.push(
        `{{${edge}}}│{{/}} ${prefix}${gap}{{box_rule}}${"─".repeat(dashes)}{{/}}{{${edge}}}│{{/}}`
      );
      continue;
    }
    out.push(row(line, total, edge));
  }
  // The zone sits under its own full-width rule, below everything the body holds
  // (including any section the display layer injected), and carries the badge's
  // tone on the TEXT, not merely on the border beside it.
  if (zone.length > 0) {
    out.push(fullRule(total, edge));
    for (const line of zone) {
      const text = tone == null ? line : `{{${tone}}}${line}{{/}}`;
      out.push(row(text, total, edge, printedWidth(line)));
    }
  }
  out.push(`{{${edge}}}╰${"─".repeat(total - 2)}╯{{/}}`);
  return out;
}
