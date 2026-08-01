// The one module that knows every layer at once, and the two properties nothing else
// can state.
//
// FAIL-OPEN: every failure path here has to end on the block as the model wrote it. A
// blank where content stood is the worst outcome the engine has, worse than the raw
// fence, because it looks like the model said nothing.
//
// THE SLICE CONTRACT: concatenated slices equal the target transform of the whole
// message. slice() holds no offset between flushes on purpose (three flushes in flight
// lost updates on a remembered one), so the property is checked by replaying a message
// at several chunk sizes and comparing the concatenation against one whole render.

import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BLOCK_HINT, DECORATOR_CLOSE, DECORATOR_HINT, FENCE, VIEW_EXT } from "./data/markup.js";
import { slice, transform, type DisplayHost } from "./pipeline.js";
import { ANSI_RE, tagMark } from "./style.js";

const NAME = "probe";
const STRICT = "strict_probe";
const WIDTH = 60;
const CHUNKS = [1, 2, 7, 23];

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-pipeline-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const view = (name: string, body: string): void =>
  fs.writeFileSync(path.join(dir, name + VIEW_EXT), body);
view(NAME, "said: ${said}\n");
view(STRICT, "said: ${said}\n");

const options = { viewsPath: [dir], width: WIDTH };
const render = (msg: string, host?: DisplayHost, final = true): string =>
  transform(msg, host, final, undefined, options);
const plain = (s: string): string => s.replace(ANSI_RE, "");

const block = (name: string, ...body: string[]): string =>
  [BLOCK_HINT + name, ...body, FENCE, ""].join("\n");

/** Replay a message flush by flush at the given boundaries, gluing what each showed. */
const replayAt = (msg: string, boundaries: number[]): string => {
  let shown = "";
  let from = 0;
  for (const to of boundaries) {
    const delta = msg.slice(from, to);
    const got = slice(msg.slice(0, from), delta, undefined, to === msg.length, undefined, options);
    shown += got ?? delta;
    from = to;
  }
  return shown;
};

const everyNth = (msg: string, size: number): number[] => {
  const at: number[] = [];
  for (let i = size; i < msg.length; i += size) at.push(i);
  at.push(msg.length);
  return at;
};

/**
 * A flush boundary at every line end. Both carrier tokens live INSIDE one line, so no
 * boundary here can fall in the middle of one: this is the shape where the identity is
 * exact, whatever the message holds.
 */
const everyLine = (msg: string): number[] => {
  const at = [...msg].flatMap((c, i) => (c === "\n" ? [i + 1] : []));
  if (at[at.length - 1] !== msg.length) at.push(msg.length);
  return at;
};

describe("transform", () => {
  it("renders a closed block and leaves the prose around it alone", () => {
    const msg = `before\n${block(NAME, "said: it works")}after`;
    const out = plain(render(msg));
    expect(out).toContain("said: it works");
    expect(out.startsWith("before\n")).toBe(true);
    expect(out.endsWith("after")).toBe(true);
    expect(out).not.toContain(FENCE);
  });

  it("renders several blocks in one message", () => {
    const msg = block(NAME, "said: one") + block(NAME, "said: two");
    const out = plain(render(msg));
    expect(out).toContain("said: one");
    expect(out).toContain("said: two");
  });

  it("hands back a message it has no business in, untouched", () => {
    const msg = "ordinary prose with a `code` span and a | pipe |";
    expect(render(msg)).toBe(msg);
  });

  it("shows the block RAW when the view resolves nowhere", () => {
    const msg = block("no_such_view", "said: x");
    expect(render(msg)).toBe(msg);
  });

  it("shows the block RAW when its text is not the data format", () => {
    const msg = block(NAME, "not the data format at all");
    expect(render(msg)).toBe(msg);
  });

  it("runs NO tag pass: a tag in the model's prose stays text", () => {
    const written = `${tagMark("warn")}danger`;
    expect(render(`prose ${written}`)).toBe(`prose ${written}`);
  });

  it("neutralises a tag the block's DATA carries, so data cannot open a colour", () => {
    const out = render(block(NAME, `said: ${tagMark("warn")}danger`));
    expect(plain(out)).toContain(`${tagMark("warn")}danger`);
  });
});

describe("the strict view", () => {
  const host = (failedLine: string): DisplayHost => ({ strict: { view: STRICT, failedLine } });

  it("shows the host's line instead of the raw block when it fails", () => {
    const FAILED = "the view did not render";
    const out = render(block(STRICT, "not the data format"), host(FAILED));
    expect(plain(out)).toContain(FAILED);
    expect(out).not.toContain(FENCE);
  });

  it("leaves every OTHER view failing open to its raw block", () => {
    const msg = block(NAME, "not the data format");
    expect(render(msg, host("unused"))).toBe(msg);
  });

  it("reports its outcome once, and only on the final flush", () => {
    const seen: boolean[] = [];
    const reporting: DisplayHost = {
      strict: { view: STRICT, failedLine: "x" },
      onRendered: (ok) => seen.push(ok),
    };
    const msg = block(STRICT, "said: it works");
    render(msg, reporting, false);
    expect(seen).toEqual([]);
    render(msg, reporting, true);
    expect(seen).toEqual([true]);
  });

  it("reports the failure, not merely the absence of a success", () => {
    const seen: (boolean | null)[] = [];
    const reporting: DisplayHost = {
      strict: { view: STRICT, failedLine: "x" },
      onRendered: (ok, error) => seen.push(ok, error === null),
    };
    render(block(STRICT, "not the data format"), reporting, true);
    expect(seen).toEqual([false, false]);
  });
});

describe("the host's injected scope", () => {
  it("reaches the view, for state the model never wrote", () => {
    view("injected", "${said} / ${elapsed}");
    const host: DisplayHost = { inject: () => ({ elapsed: "3s" }) };
    const msg = [BLOCK_HINT + "injected", "said: x", FENCE, ""].join("\n");
    expect(plain(render(msg, host))).toContain("x / 3s");
  });

  it("adds nothing when the host declines, and the view renders as if it had none", () => {
    const msg = block(NAME, "said: x");
    expect(render(msg, { inject: () => undefined })).toBe(render(msg));
  });
});

describe("withholding what is still arriving", () => {
  it("keeps an unclosed block off the screen on a NON-final flush", () => {
    const opening = `${BLOCK_HINT}${NAME}\nsaid: still typing`;
    expect(render(opening, undefined, false)).not.toContain("still typing");
  });

  it("shows it RAW on the final flush, where no later flush exists to reveal it", () => {
    const opening = `${BLOCK_HINT}${NAME}\nsaid: never closed`;
    expect(render(opening, undefined, true)).toContain("never closed");
  });
});

describe("the slice contract", () => {
  const cases: Record<string, string> = {
    "one block": `before\n${block(NAME, "said: it works")}after`,
    "two blocks": block(NAME, "said: one") + "between\n" + block(NAME, "said: two"),
    "a block that never closes": `${BLOCK_HINT}${NAME}\nsaid: unterminated`,
    "a failing block": block(NAME, "not the data format"),
    "a decorated table": [
      `${DECORATOR_HINT}${NAME}${DECORATOR_CLOSE}`,
      "| a | b |",
      "| --- | --- |",
      "| Status | green |",
      "",
    ].join("\n"),
  };

  for (const [what, msg] of Object.entries(cases)) {
    it(`replays ${what} to exactly the same screen, flushed line by line`, () => {
      expect(replayAt(msg, everyLine(msg))).toBe(render(msg));
    });
  }

  // The ACCEPTED RESIDUAL, pinned so it cannot quietly get worse. A carrier token cut
  // mid-way is prose to the cut that sees it, and a delta already shown cannot be
  // retracted, so its first characters can reach the screen before the token completes.
  // What the design promises even then is that NOTHING IS LOST: the corrected text is
  // re-emitted from the divergence, and only the stale marker characters stay behind.
  for (const [what, msg] of Object.entries(cases)) {
    it(`loses no line of ${what}, down to one character per flush`, () => {
      const whole = render(msg);
      for (const size of CHUNKS) {
        const shown = replayAt(msg, everyNth(msg, size));
        for (const line of whole.split("\n").filter((l) => l.trim() !== "")) {
          expect(shown, `at ${size} chars per flush`).toContain(line);
        }
      }
    });
  }

  it("leaks only the head of a carrier token, never a character of content", () => {
    const msg = block(NAME, "said: it works");
    const whole = render(msg);
    const shown = replayAt(msg, everyNth(msg, 1));
    // Everything the target holds, plus a fragment of the fence that was mid-arrival.
    expect(shown).toContain(whole);
    expect(shown.replace(whole, "")).toBe(BLOCK_HINT.slice(0, shown.length - whole.length));
  });

  it("returns null for a message with no carrier, so the host keeps its markdown", () => {
    expect(slice("", "ordinary **prose**", undefined, true, undefined, options)).toBeNull();
  });

  it("engages on a carrier the delta only STARTS, so the opening is not shown raw", () => {
    const out = slice("", BLOCK_HINT + NAME, undefined, false, undefined, options);
    expect(out).not.toBeNull();
    expect(out).not.toContain(BLOCK_HINT);
  });

  it("treats a delta that is not a string as no delta at all", () => {
    const msg = block(NAME, "said: x");
    expect(slice(msg, undefined, undefined, true, undefined, options)).toBe("");
  });
});

describe("a message written with Windows line endings", () => {
  /** The same message, every boundary spelled the way Windows spells it. */
  const crlf = (msg: string): string => msg.split("\n").join("\r\n");

  const FENCED = `before\n${block(NAME, "said: it works")}after`;
  const DECORATED = [
    `${DECORATOR_HINT}${NAME}${DECORATOR_CLOSE}`,
    "| a | b |",
    "| --- | --- |",
    "| Status | green |",
    "",
  ].join("\n");

  // BOTH carriers used to fail open on this, and that is why the normalisation sits at
  // the entry rather than in either of them: every matcher here anchors on a line
  // boundary, so a CR standing between the boundary and what the matcher expects on it
  // defeats the match. The block showed its raw fence and the decorator left its token
  // on screen, on input that is perfectly well formed.
  it("renders a fenced block exactly as the LF message renders", () => {
    expect(render(crlf(FENCED))).toBe(render(FENCED));
  });

  it("renders a decorated table exactly as the LF message renders", () => {
    expect(render(crlf(DECORATED))).toBe(render(DECORATED));
  });

  it("flattens the endings of a message it has no business in, and changes nothing else", () => {
    const prose = "ordinary prose\nover two lines\n";
    expect(render(crlf(prose))).toBe(prose);
  });

  // The normalisation is CRLF to LF, never "drop every CR". The distinction is what
  // keeps the two cases below working, and a blunt strip would pass the tests above
  // while breaking both.
  it("keeps a lone CR that no LF follows: it is content, not a boundary", () => {
    const prose = "prose with a \r bare CR in it\n";
    expect(render(prose)).toBe(prose);
  });

  it("still withholds an opening fence cut on the CR of its own line ending", () => {
    // The front half of a CRLF still arriving, which carrier/scan.ts reads as exactly
    // that. Flattened away here, the cut would go blind and show the raw fence.
    expect(render(`${BLOCK_HINT}${NAME}\r`, undefined, false)).not.toContain(BLOCK_HINT);
  });

  it("replays to the same screen, flushed line by line, once a carrier is in view", () => {
    // No leading prose, so the FIRST flush already carries the hint and every delta
    // from then on goes through the engine: the identity is exact.
    const msg = crlf(block(NAME, "said: it works") + "after");
    expect(replayAt(msg, everyLine(msg))).toBe(render(msg));
  });

  // What CRLF costs on a stream, and it is the residual the slice contract already
  // names. Prose flushed BEFORE any carrier is in view went out through the HOST, which
  // returns null there so the host keeps its own markdown, and no delta already on
  // screen can be retracted. Nothing is lost: the flattening starts at the flush that
  // first sees a carrier, and everything after it matches the whole render.
  it("leaves a CR already shown as prose before the engine engaged", () => {
    const msg = crlf(FENCED);
    const shown = replayAt(msg, everyLine(msg));
    expect(shown).toContain("before\r\n");
    expect(shown.replace("before\r\n", "before\n")).toBe(render(msg));
  });

  it("loses no line down to one character per flush, cut between CR and LF included", () => {
    const msg = crlf(FENCED);
    const whole = render(msg);
    for (const size of CHUNKS) {
      const shown = replayAt(msg, everyNth(msg, size));
      for (const line of whole.split("\n").filter((l) => l.trim() !== "")) {
        expect(shown, `at ${size} chars per flush`).toContain(line);
      }
    }
  });
});
