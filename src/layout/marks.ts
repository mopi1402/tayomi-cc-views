// The two CONTROL CHANNELS a rendered line can carry.
//
// The engine emits one line at a time and knows no block, so a fact the box-level
// wrapper needs cannot be passed as an argument: renderBody hands the framer plain
// strings and has no other channel. Both marks therefore travel ON the line, as
// characters no template can produce and that cost no column.

// Marks a line as an INNER RULE, which the framer fills with dashes up to its own
// width. No template line can do that: the width is only known once the whole body
// has been measured.
export const RULE_MARK = "\\u0000";

// The hanging-indent boundary. Everything left of it is the item's PREFIX (label,
// gutter bar, bullet), which a continuation row blanks: that is what keeps a
// wrapped item in one text column and stops its bullet from printing twice. Built
// from a char code rather than written as an escape, since a control character
// typed into this source has already been mangled by an editing pass once.
export const HANG_MARK = String.fromCharCode(2);

export function isRule(line: string): boolean {
  return line.startsWith(RULE_MARK);
}
