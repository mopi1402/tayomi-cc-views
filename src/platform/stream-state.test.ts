// The oracles for the delta log, and for the failure that made it necessary.
//
// The bug they pin down was not hypothetical: on 2026-07-28 a turn whose text was
// perfect rendered as an EMPTY box, because the flush carrying the block's body
// and the flush carrying its closing fence ran at the same time over one shared
// state file and the body lost the write. So the tests here assert the property
// that replaces that file: what a flush renders depends on its INDEX and never on
// which process happened to run first. The full regression at the render seam
// lives with the host that hit it (plugins/core, display-integration).

import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import {
  awaitEarlier,
  dropMessage,
  readEarlier,
  recordDelta,
  sweepStale,
  STALE_MS,
} from "./stream-state.js";

const ids: string[] = [];
let n = 0;
function newId(): string {
  const id = `test-stream-${process.pid}-${n++}`;
  ids.push(id);
  return id;
}

afterEach(() => {
  for (const id of ids.splice(0)) dropMessage(id);
});

describe("the delta log", () => {
  it("rebuilds the prefix in INDEX order, whatever order the deltas were written in", () => {
    const id = newId();
    // The order below is the one concurrency produces: a later flush lands first.
    recordDelta(id, 2, "third\n");
    recordDelta(id, 0, "first\n");
    recordDelta(id, 1, "second\n");
    expect(readEarlier(id, 3)).toEqual({ text: "first\nsecond\nthird\n", complete: true });
  });

  it("asks for everything BEFORE its own index, and nothing from its own", () => {
    const id = newId();
    recordDelta(id, 0, "a");
    recordDelta(id, 1, "b");
    expect(readEarlier(id, 1).text).toBe("a");
    expect(readEarlier(id, 0)).toEqual({ text: "", complete: true });
  });

  it("reports a hole as incomplete, and hands back NO text for it", () => {
    const id = newId();
    recordDelta(id, 0, "a");
    recordDelta(id, 2, "c");
    // A partial prefix would let a caller compute an offset into text the screen does
    // not hold, which is the mis-slice this module exists to make impossible.
    expect(readEarlier(id, 3)).toEqual({ text: "", complete: false });
  });

  it("waits for a predecessor that is still starting up", async () => {
    const id = newId();
    recordDelta(id, 0, "prose\n");
    setTimeout(() => recordDelta(id, 1, "body\n"), 30);
    const prefix = await awaitEarlier(id, 2);
    expect(prefix).toEqual({ text: "prose\nbody\n", complete: true });
  });

  it("gives up on a predecessor that never lands, rather than hanging the flush", async () => {
    const id = newId();
    recordDelta(id, 0, "prose\n");
    const prefix = await awaitEarlier(id, 2, 20);
    expect(prefix.complete).toBe(false);
  });

  it("forgets a message on drop, and sweeps only what is old enough to be garbage", () => {
    const id = newId();
    recordDelta(id, 0, "a");
    expect(readEarlier(id, 1).complete).toBe(true);
    dropMessage(id);
    expect(readEarlier(id, 1).complete).toBe(false);

    const live = newId();
    recordDelta(live, 0, "fresh");
    sweepStale(STALE_MS);
    expect(readEarlier(live, 1).complete).toBe(true); // in flight, untouched
    sweepStale(-1); // everything counts as old
    expect(readEarlier(live, 1).complete).toBe(false);
  });

  it("keeps two state dirs fully apart", () => {
    // Two hosts on one machine must not read each other's flushes: the dir is the
    // isolation boundary RenderOptions.stateDir promises.
    const id = newId();
    const otherDir = path.join(os.tmpdir(), `cc-views-test-${process.pid}`);
    recordDelta(id, 0, "here");
    recordDelta(id, 0, "there", otherDir);
    expect(readEarlier(id, 1).text).toBe("here");
    expect(readEarlier(id, 1, otherDir).text).toBe("there");
    dropMessage(id, otherDir);
  });
});
