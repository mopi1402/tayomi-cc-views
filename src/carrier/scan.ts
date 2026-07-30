// The CARRIER: how a view block is marked out inside an ordinary message.
//
// Today there is exactly one carrier, a fenced ```view:<name> block, and this module
// owns both of its shapes: the closed block that renders, and the still-opening one
// that must not reach the screen raw.

// A complete block: the opening fence with its view name, the body, the closing
// fence. Global, so a message carrying several blocks renders all of them.
export const BLOCK_RE = /```view:(\S+)\r?\n([\s\S]*?)\r?\n?```[ \t]*(?:\n|$)/g;

// An opening fence alone, used to find a block that has not closed yet. Global,
// because the scan below wants the LAST opening rather than the first.
export const VIEW_OPEN = /```view:(\S+)\r?\n/g;

// Suppress ONLY a genuinely unclosed (still-streaming) trailing block: an
// opening ```view: with no closing fence after it. A CLOSED block that failed
// to render kept its raw text above (fences and all) via fail-open, and MUST
// stay visible: slicing it away here is what turned a render error into a
// blank screen. Show the raw block instead of dropping the message.
//
// The scan starts from the LAST opening. From the FIRST one, a fail-open block
// sitting above answers "closed" for the whole message with its own closing
// fence, so nothing was cut and the still-streaming block below it reached the
// screen raw: exactly the leak this function exists to prevent.
export function cutUnclosedBlock(text: string): string {
  let open = -1;
  let bodyStart = -1;
  for (const m of text.matchAll(VIEW_OPEN)) {
    open = m.index;
    bodyStart = m.index + m[0].length;
  }
  if (open === -1) return text;
  return text.slice(bodyStart).includes("```") ? text : text.slice(0, open);
}
