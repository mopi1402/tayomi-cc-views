// The composition graph: which word is READ inside which container.
//
// Data rather than control flow, and that is the whole point. A catalogue describing this language has to be a DUMP of
// what the engine executes, never a second telling of it, so `renderBody` READS this table: a word taken out of an
// entry stops being read, the render changes, and the suite falls. A table the engine did not consult could be wrong
// while staying complete, and complete-but-wrong is the one thing a catalogue must never be.
//
// What is NOT here: what an opener DOES with its body. Framing, composing a column, iterating a list and measuring its
// widths is rendering, not grammar, and no table expresses it. That half is answered by running the engine.

import { ASIDE, BOX, EACH, END, ENDASIDE, ENDBOX, FOOT, FRAME, HEAD, RIGHT, RULE, USE } from "./language.js";

/**
 * A place a line can sit.
 *
 * `@box bare` is its OWN container rather than a flag on the box: it draws the same body and reads strictly fewer
 * words, which is exactly what an entry of this table says.
 */
export const TOP = "top";
export const IN_BOX = "box";
export const IN_BOX_BARE = "box-bare";
export const IN_ASIDE = "aside";
export const IN_EACH = "each";
export const CONTAINERS = [TOP, IN_BOX, IN_BOX_BARE, IN_ASIDE, IN_EACH] as const;
export type Container = (typeof CONTAINERS)[number];

/**
 * What each container's own loop READS. Anything else on a line falls through to the body, where the author sees it
 * printed rather than swallowed.
 *
 * A container's inner lines are then rendered as an ordinary body, so everything `TOP` reads works inside a box or an
 * aside through that recursion. The four chrome words are different: they are read by the BOX's loop itself, which is
 * why they exist nowhere else and why a bare container, having no border to hang them on, reads none of them.
 */
export const READS: Record<Container, readonly string[]> = {
  [TOP]: [BOX, ASIDE, RULE, EACH, USE],
  [IN_BOX]: [HEAD, RIGHT, FOOT, FRAME],
  [IN_BOX_BARE]: [],
  [IN_ASIDE]: [],
  // A divider BETWEEN items is a thing only the loop can place, and the collapsing in box.ts drops the trailing one.
  // Everything else inside an @each is a line of the item and belongs to substitution, @use included: a view drawn PER
  // ITEM is a feature nobody has designed.
  [IN_EACH]: [RULE],
};

/** Whether this container reads this word. The engine's own question, asked before every matcher. */
export const readsHere = (container: Container, word: string): boolean =>
  READS[container].includes(word);

/** What closes each block-opening word, derived from the closers the language already names. */
export const CLOSES: Record<string, string> = {
  [BOX]: ENDBOX,
  [ASIDE]: ENDASIDE,
  [EACH]: END,
};
