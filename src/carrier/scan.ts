// The CARRIER: how a view block is marked out inside an ordinary message.
//
// This module owns every shape a STREAM can show of a fenced block: the closed one
// that renders, the opened one whose closing fence has not arrived, and the opening
// fence line itself arriving one character at a time. Only the first belongs on
// screen; the other two are withheld until a later flush completes them, which is why
// the cut below is the non-final flush's business alone (pipeline.ts owns that
// condition, being the one that knows whether a later flush exists at all).

import { BLOCK_HINT, FENCE } from "../data/markup.js";

export { BLOCK_HINT };

const TICK = FENCE[0];
const NAME_EOL = String.raw`(\S+)\r?\n`;

// Global, so a message carrying several blocks renders all of them, and so the scan
// below can take the LAST opening rather than the first.
// eslint-disable-next-line security/detect-non-literal-regexp
export const BLOCK_RE = new RegExp(
  BLOCK_HINT + NAME_EOL + String.raw`([\s\S]*?)\r?\n?` + FENCE + String.raw`[ \t]*(?:\n|$)`,
  "g"
);
// eslint-disable-next-line security/detect-non-literal-regexp
export const VIEW_OPEN = new RegExp(BLOCK_HINT + NAME_EOL, "g");

// Whitespace ends the view NAME (VIEW_OPEN reads it as \S+), so a tail carrying any
// can no longer grow into an opening. One atom, no quantifier: nothing to backtrack.
const SPACE = /\s/;
const CR = "\r";

// Where an opening fence STILL ARRIVING starts, or -1.
//
// Such a fence carries no newline yet (that is exactly what VIEW_OPEN is waiting for)
// and its name carries no whitespace either, so the whole of it lives inside the run
// of non-blank characters ENDING the text. That run is found by one backward pass and
// walked forward once, earliest backtick first, so an inline `code` span or a quoted
// fence earlier on the line is left alone and no input makes this scan quadratic.
//
// Two shapes qualify and nothing else: the hint typed so far (```v, ```view), and the
// hint complete with the name still coming (```view:tab). A trailing CR is the front
// half of a CRLF still arriving, not a boundary, because VIEW_OPEN accepts it.
function openingStart(text: string): number {
  const end = text.endsWith(CR) ? text.length - CR.length : text.length;
  let run = end;
  while (run > 0 && !SPACE.test(text[run - 1])) run--;
  for (let i = run; i < end; i++) {
    if (text[i] !== TICK) continue;
    if (i + BLOCK_HINT.length <= end) {
      if (text.startsWith(BLOCK_HINT, i)) return i; // the name is still arriving
    } else if (BLOCK_HINT.startsWith(text.slice(i))) {
      return i; // the hint itself is still arriving
    }
  }
  return -1;
}

// Suppress ONLY a genuinely trailing block, the one a later flush will complete. A
// CLOSED block that failed to render kept its raw text above (fences and all) via
// fail-open and MUST stay visible: slicing it away here is what turned a render error
// into a blank screen.
//
// The scan starts from the LAST opening. From the FIRST one, a fail-open block sitting
// above answers "closed" for the whole message with its own closing fence, so nothing
// was cut and the still-streaming block below it reached the screen raw: exactly the
// leak this function exists to prevent.
//
// The still-arriving opening is scanned SECOND, and only when no complete opening is
// waiting for its closing fence: a partial fence sits below such an opening, so the
// cut at the opening already takes it. Missing it was the other half of the same leak,
// because VIEW_OPEN cannot see an opening whose newline has not landed.
export function cutUnclosedBlock(text: string): string {
  let open = -1;
  let bodyStart = -1;
  for (const m of text.matchAll(VIEW_OPEN)) {
    open = m.index;
    bodyStart = m.index + m[0].length;
  }
  if (open !== -1 && !text.slice(bodyStart).includes(FENCE)) return text.slice(0, open);
  const arriving = openingStart(text);
  return arriving === -1 ? text : text.slice(0, arriving);
}
