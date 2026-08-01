// The CARRIER: how a view block is marked out inside an ordinary message.
//
// Today there is exactly one carrier, a fenced ```view:<name> block, and this module
// owns every shape a STREAM can show of it: the closed block that renders, the opened
// block whose closing fence has not arrived, and the opening fence line itself
// arriving one character at a time. Only the first belongs on screen; the other two
// are withheld until a later flush completes them, which is why the cut below is the
// non-final flush's business alone (pipeline.ts owns that condition, because it is the
// one that knows whether a later flush exists at all).

// A complete block: the opening fence with its view name, the body, the closing
// fence. Global, so a message carrying several blocks renders all of them.
export const BLOCK_RE = /```view:(\S+)\r?\n([\s\S]*?)\r?\n?```[ \t]*(?:\n|$)/g;

// An opening fence alone, used to find a block that has not closed yet. Global,
// because the scan below wants the LAST opening rather than the first.
export const VIEW_OPEN = /```view:(\S+)\r?\n/g;

// What every opening fence starts with. The pattern above waits for the newline that
// ENDS the fence line; the scan below watches that same line arrive, character by
// character, and the two must agree on what an opening begins as.
const OPEN_HINT = "```view:";
const TICK = "`";

// Whitespace ends the view NAME (VIEW_OPEN reads it as \S+), so a tail carrying any
// can no longer grow into an opening. One atom, no quantifier: nothing to backtrack.
const SPACE = /\s/;

// Where an opening fence STILL ARRIVING starts, or -1.
//
// Such a fence carries no newline yet (that is exactly what VIEW_OPEN is waiting for)
// and its name carries no whitespace either, so the whole of it lives inside the run
// of non-blank characters ENDING the text. That run is found by one backward pass and
// walked forward once, earliest backtick first, so an inline `code` span or a quoted
// fence earlier on the line is left alone and no input makes this scan quadratic.
//
// Two shapes qualify, and nothing else: the hint typed so far (```v, ```view), and
// the hint complete with the name still coming (```view:tab). A trailing CR is the
// front half of a CRLF still arriving, not a boundary, because VIEW_OPEN accepts it.
function openingStart(text: string): number {
  const end = text.endsWith("\r") ? text.length - 1 : text.length;
  let run = end;
  while (run > 0 && !SPACE.test(text[run - 1])) run--;
  for (let i = run; i < end; i++) {
    if (text[i] !== TICK) continue;
    if (i + OPEN_HINT.length <= end) {
      if (text.startsWith(OPEN_HINT, i)) return i; // the name is still arriving
    } else if (OPEN_HINT.startsWith(text.slice(i))) {
      return i; // the hint itself is still arriving
    }
  }
  return -1;
}

// Suppress ONLY a genuinely trailing block, the one a later flush will complete: an
// opening ```view: with no closing fence after it, or an opening fence line still
// arriving character by character. A CLOSED block that failed to render kept its raw
// text above (fences and all) via fail-open, and MUST stay visible: slicing it away
// here is what turned a render error into a blank screen. Show the raw block instead
// of dropping the message.
//
// The scan starts from the LAST opening. From the FIRST one, a fail-open block
// sitting above answers "closed" for the whole message with its own closing
// fence, so nothing was cut and the still-streaming block below it reached the
// screen raw: exactly the leak this function exists to prevent.
//
// The still-arriving opening is scanned SECOND, and only when no complete opening is
// waiting for its closing fence: a partial fence sits below such an opening, so the
// cut at the opening already takes it. Missing it was the other half of the same
// leak, because VIEW_OPEN cannot see an opening whose newline has not landed.
export function cutUnclosedBlock(text: string): string {
  let open = -1;
  let bodyStart = -1;
  for (const m of text.matchAll(VIEW_OPEN)) {
    open = m.index;
    bodyStart = m.index + m[0].length;
  }
  if (open !== -1 && !text.slice(bodyStart).includes("```")) return text.slice(0, open);
  const arriving = openingStart(text);
  return arriving === -1 ? text : text.slice(0, arriving);
}
