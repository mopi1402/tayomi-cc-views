// The two control channels a rendered line can carry, and the one question the framer asks about them.
//
// The engine emits one line at a time and knows no block, so a fact the box-level wrapper needs cannot be passed as an
// argument: renderBody hands the framer plain strings and has no other channel. Both marks therefore travel ON the
// line.

import { HANG_MARK, RULE_MARK } from "../data/marks.js";

export { HANG_MARK, RULE_MARK };

export function isRule(line: string): boolean {
  return line.startsWith(RULE_MARK);
}
