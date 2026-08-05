// The engine emits one line at a time and knows no block, so a fact the box-level wrapper needs cannot be passed as an
// argument: renderBody hands the framer plain strings. Both marks therefore travel ON the line.

import { HANG_MARK, RULE_MARK, TAIL_MARK, VOID_MARK } from "../data/marks.js";

export { HANG_MARK, RULE_MARK, TAIL_MARK, VOID_MARK };

export function isRule(line: string): boolean {
  return line.startsWith(RULE_MARK);
}
