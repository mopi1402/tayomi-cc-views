// The control codes the engine reserves, shared because three modules must agree.
//
// Every one is a C0 control, which buys both properties at once: width.ts counts a C0 as zero columns, and no message
// can type one. RULE_MARK was a six-character escape SEQUENCE until 2026-08-01, stripped by printedWidth wherever it
// appeared, so a value carrying that text measured six columns short and pulled its box open. Hence a code, never a
// spelling.

const control = (n: number): string => String.fromCharCode(n);

/** A line the framer fills with dashes up to its own width. */
export const RULE_MARK = control(1);

/** The hanging-indent boundary: left of it is the prefix a wrapped row blanks. */
export const HANG_MARK = control(2);

/** Breaks the tag shape inside a value the MESSAGE supplied, so data cannot style. */
export const INERT_MARK = control(3);

/**
 * What a span the ENGINE inserted closes on, where `{{/}}` clears: the style the span interrupted comes back. A code
 * and not a tag, because a tag needs a NAME the palette answers for and every such name is one a carrier may fill the
 * tone slot with, putting the engine's terminator one `tone:` field from a message.
 */
export const RESUME_MARK = control(4);

/**
 * Where a span the ENGINE inserted BEGINS, which is how its resume knows how far to unwind. A resume ends a FRAME,
 * everything opened since this code. Pop one entry instead and the style that comes back is the body's last tag.
 */
export const SPAN_MARK = control(5);

/** Where the folded prefix starts PAINTING: left of it goes to bare spaces, tags and all. */
export const VOID_MARK = control(6);

/**
 * Where a line's closing furniture begins. Drawn whole while the line fits; the moment it folds the tail is dropped and
 * every row is squared to the width instead, which is what turns a wrapped band from a staircase into a rectangle.
 */
export const TAIL_MARK = control(7);

export const CONTROL_MARKS: readonly string[] = [
  RULE_MARK,
  HANG_MARK,
  INERT_MARK,
  RESUME_MARK,
  SPAN_MARK,
  VOID_MARK,
  TAIL_MARK,
];

export function hasControlMark(s: string): boolean {
  return CONTROL_MARKS.some((m) => s.includes(m));
}

/**
 * Every reserved code OUT of a string, for text arriving from a message. "No message can type one" is a property of the
 * keyboard, not of the channel: a payload is JSON, and JSON spells any code point. Dropped rather than escaped, a
 * control having no visible text to preserve.
 */
export function dropControl(s: string): string {
  return CONTROL_MARKS.reduce((out, m) => (out.includes(m) ? out.split(m).join("") : out), s);
}
