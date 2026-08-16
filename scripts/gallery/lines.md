@{view:lines}
| File | What changed |
| --- | --- |
| `src/queue.ts` | the retry counter reset on every poll, so a poisoned job never reached the dead letter |
| `src/queue.test.ts` | a case that poisons a job and asserts it lands in the dead letter on the third try |
| `docs/runbook.md` | the paragraph on draining the queue by hand, gone now that nothing needs it |
