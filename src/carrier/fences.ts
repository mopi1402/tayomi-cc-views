// Where a carrier must NOT look: the fenced code blocks of a message, so a message SHOWING the syntax does not run it.
//
// The OUTERMOST fence decides, and depth is not tracked: inside a shield, a nested `view:` block and a decorator line
// are text, which is what an example needs.
//
// Called ONCE PER TEXT, by each carrier on the text it is about to read, never shared: the pipeline replaces the block
// carrier's zones before the decorator runs, so an offset measured before that pass names a different character.

import { BLOCK_INFO, FENCE } from "../data/markup.js";

const TICK = FENCE[0];
/** Three, and the shortest run that opens anything. Longer runs are how a fence quotes a fence. */
const MIN_RUN = FENCE.length;
const INDENT = " \t";
const NL = "\n";

/**
 * One fenced block, as a half-open character range over the text it was found in.
 *
 * `carrier` marks the fence the BLOCK carrier owns (its info string opens `view:`). It is a span all the same, because
 * the two readings differ: the decorator skips every fence, its own sibling's included, while the block carrier skips
 * every fence EXCEPT the one it renders.
 */
export interface Fence {
  start: number;
  end: number;
  carrier: boolean;
}

/** The backtick run opening or closing a fence on this line, or null for an ordinary line. */
function runOf(line: string): { run: number; info: string } | null {
  let i = 0;
  while (i < line.length && INDENT.includes(line[i])) i++;
  let run = 0;
  while (i + run < line.length && line[i + run] === TICK) run++;
  return run < MIN_RUN ? null : { run, info: line.slice(i + run).trim() };
}

/**
 * Every OUTERMOST fenced block of a text, in order.
 *
 * A fence opens on a run of three or more backticks at the start of a line (markdown allows the indent) and closes on a
 * run at least as long carrying NO info string. Requiring the closing run to be bare is what lets a longer fence quote
 * a shorter one: without it, the ```view: line inside a ```` block would close the block it is being shown inside.
 *
 * A fence that never closes runs to the end of the text, markdown's own reading and what a still-streaming message
 * needs.
 */
export function fenceSpans(text: string): Fence[] {
  if (!text.includes(FENCE)) return [];
  const spans: Fence[] = [];
  const lines = text.split(NL);
  let offset = 0;
  let open: { at: number; run: number; carrier: boolean } | null = null;
  for (const line of lines) {
    const next = offset + line.length + NL.length;
    const fence = runOf(line);
    if (fence !== null) {
      if (open === null) {
        open = { at: offset, run: fence.run, carrier: fence.info.startsWith(BLOCK_INFO) };
      } else if (fence.run >= open.run && fence.info === "") {
        spans.push({ start: open.at, end: Math.min(next, text.length), carrier: open.carrier });
        open = null;
      }
    }
    offset = next;
  }
  if (open !== null) spans.push({ start: open.at, end: text.length, carrier: open.carrier });
  return spans;
}

/** The fence an offset falls inside, or undefined for an offset in the open. */
export function fenceAt(spans: Fence[], offset: number): Fence | undefined {
  return spans.find((s) => offset >= s.start && offset < s.end);
}
