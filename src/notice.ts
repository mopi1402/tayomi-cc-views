// A NOTICE: what a hook says to the OPERATOR through the host's own `systemMessage` channel, dressed to be seen. An
// accent header above an auto-sized box of rows, the shape TAYOMI's session notices proved on screen (rendered ANSI
// and box-drawing, verified live 2026-08-14).
//
// Why the ENGINE ships it: every host with something to say at a session edge re-invents this same kit, and the one
// non-trivial part is the measure. A box is only square when its padding counts VISIBLE columns, escapes discounted
// and wide glyphs counted double, and displayWidth is the ruler this package already owns. The kit stays dumb on
// purpose: no wrapping, no terminal probe (a hook has no TTY), so a row wider than the operator's terminal is the
// caller's to shorten, and middleEllipsis below is the shears.
//
// One glyph class the measure cannot save: AMBIGUOUS-width characters (the one-char ellipsis "…" first of all), which
// a host renderer may draw a column wider than a terminal does, snapping the right border on exactly that row
// (measured 2026-08-14 in Claude Code). ASCII and ANSI rows render square everywhere; keep exotic glyphs out of rows
// meant for a host's dialog, which is why middleEllipsis folds with ASCII dots.
//
// And one escape the rows must not carry: a full RESET (SGR 0) anywhere but a line's very end. The host paints its
// dialog line in a colour of its own, a RESET cancels that too, and the rest of the row (padding and right border
// included) renders default-bright against it (measured 2026-08-14). Close a row's styles narrow instead: SGR 22
// ends bold and dim, SGR 39 ends a foreground colour, and the host's own dress survives to the border.

import { displayWidth } from "./layout/width.js";
import { ANSI_RE } from "./style.js";

/** Visible width: what the terminal shows, with the ANSI escapes discounted. */
function visibleWidth(text: string): number {
  return displayWidth(text.replace(ANSI_RE, ""));
}

/**
 * An accent header, then the rows in one closed box, padded to the widest VISIBLE row; a `null` row draws a divider,
 * which is how a notice separates its facts from its call to action. With no rows at all the header stands alone: a
 * notice can be a single line, and a frame around nothing dresses nothing.
 */
export function notice(header: string, rows: ReadonlyArray<string | null>): string {
  const body = rows.filter((row): row is string => row !== null);
  if (body.length === 0) return header;
  const width = Math.max(...body.map(visibleWidth));
  const rule = (left: string, right: string): string => `${left}${"─".repeat(width + 2)}${right}`;
  const pad = (row: string): string => `│ ${row}${" ".repeat(width - visibleWidth(row))} │`;
  const framed = rows.map((row) => (row === null ? rule("├", "┤") : pad(row)));
  return [header, rule("╭", "╮"), ...framed, rule("╰", "╯")].join("\n");
}

/** What a fold leaves in a shortened row: ASCII on purpose, the one-char "…" being ambiguous-width (header note). */
const ELLIPSIS = "...";

/**
 * `text` held under `budget` characters by folding its MIDDLE: both ends of a path are the identifying ones, the
 * prefix saying whose machine and the tail saying which file. Total: a budget too small to fold into returns the text
 * whole, a row too wide beating a row made meaningless.
 */
export function middleEllipsis(text: string, budget: number): string {
  if (text.length <= budget || budget <= ELLIPSIS.length + 1) return text;
  const head = Math.ceil((budget - ELLIPSIS.length) / 2);
  const tail = budget - ELLIPSIS.length - head;
  return text.slice(0, head) + ELLIPSIS + text.slice(text.length - tail);
}
