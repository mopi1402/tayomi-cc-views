// Which files are THIS package's suite, stated positively.
//
// Vitest's default include walks the whole tree, so anything dropped in the working copy (a cloned
// repo under tmp/, a vendored sample, a downloaded fixture) enters `pnpm test` and can fail it on
// its own missing dependencies. The suite would then be red for a reason that is no part of this
// package, which is a gate reporting on someone else's code.
//
// The two entries are the two kinds CLAUDE.md names, and they are the whole of it: a sidecar beside
// the module it answers for, and a suite answering for a PATH rather than a module. A third location
// is a decision to take, not a glob to widen by accident.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // The suite must never write where real engines elect: each worker gets a register of its own.
    setupFiles: ["tests/env-isolation.ts"],
  },
});
