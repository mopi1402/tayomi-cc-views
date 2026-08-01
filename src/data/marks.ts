// The control codes the engine reserves, shared because three modules must agree.
//
// Every one is a C0 control, and that buys both properties at once: width.ts counts
// a C0 as zero columns, and no message can type one. A mark spelled as ordinary text
// has neither. RULE_MARK was a six-character escape SEQUENCE until 2026-08-01, which
// printedWidth stripped wherever it appeared, so a value carrying that text measured
// six columns short and pulled its box open. Hence a code, never a spelling.

const control = (n: number): string => String.fromCharCode(n);

/** A line the framer fills with dashes up to its own width. */
export const RULE_MARK = control(1);

/** The hanging-indent boundary: left of it is the prefix a wrapped row blanks. */
export const HANG_MARK = control(2);

/** Breaks the tag shape inside a value the MESSAGE supplied, so data cannot style. */
export const INERT_MARK = control(3);

export const CONTROL_MARKS: readonly string[] = [RULE_MARK, HANG_MARK, INERT_MARK];

export function hasControlMark(s: string): boolean {
  return CONTROL_MARKS.some((m) => s.includes(m));
}
