// The hook's scratch directory: the one place on disk this subsystem writes.
//
// Two things live there, both caches rather than records: the per-message stream
// state, and the probed terminal width. Neither is worth an error, so the write is
// total and silent: a scratch dir that cannot be written only costs a re-probe or a
// message rendered from scratch, never a crash on screen.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The default only: a host that must not share scratch with another host on the
// same machine passes its own dir through RenderOptions.stateDir.
export const DEFAULT_STATE_DIR = path.join(os.tmpdir(), "cc-views");

export function writeScratch(file: string, data: string): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  } catch {
    // a scratch write is best-effort by construction
  }
}
