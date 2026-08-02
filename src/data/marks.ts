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
 * and not a tag for one reason more than the others: a tag shape needs a NAME the palette answers for, and every such
 * name is one a carrier may fill the tone slot with, which puts the engine's terminator one `tone:` field from a
 * message.
 */
export const RESUME_MARK = control(4);

/**
 * Where a span the ENGINE inserted BEGINS, which is how its resume knows how far to unwind. A resume ends a FRAME,
 * everything opened since this code: the span's own tag and every tag its BODY wrote. Pop one entry instead and the
 * style that comes back is the body's last tag, which is what shipped until this mark existed.
 */
export const SPAN_MARK = control(5);

export const CONTROL_MARKS: readonly string[] = [
  RULE_MARK,
  HANG_MARK,
  INERT_MARK,
  RESUME_MARK,
  SPAN_MARK,
];

export function hasControlMark(s: string): boolean {
  return CONTROL_MARKS.some((m) => s.includes(m));
}

/**
 * Every reserved code OUT of a string, for text arriving from a message.
 *
 * "No message can type one" is a property of the keyboard, not of the channel: a payload is JSON, and JSON spells any
 * code point. It cost nothing while a stray mark only moved a wrap, and it costs a colour now that a resume ends a
 * span. Dropped rather than escaped: a control prints nothing, so there is no visible text to preserve.
 */
export function dropControl(s: string): string {
  return CONTROL_MARKS.reduce((out, m) => (out.includes(m) ? out.split(m).join("") : out), s);
}
