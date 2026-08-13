// One write a reader can trust: the file appears WHOLE or not at all. Two modules write registers other processes
// read mid-write (the election's claims, the stream's deltas), and both must spell the idiom identically or one of
// them reinvents it wrong.

import fs from "node:fs";
import path from "node:path";

/**
 * Write `body` at `target` atomically: parents made, written beside, renamed over. The tmp name carries the pid so two
 * processes writing one target never collide on the intermediate. Throws the way fs does; the caller owns the policy.
 */
export function writeAtomic(target: string, body: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.part`;
  fs.writeFileSync(tmp, body, "utf8");
  fs.renameSync(tmp, target);
}
