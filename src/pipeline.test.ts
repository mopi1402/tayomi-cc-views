// The two properties nothing else can state.
//
// FAIL-OPEN: every failure path ends on the block as the model wrote it. A blank where content stood is worse than the
// raw fence, because it looks like the model said nothing.
//
// THE SLICE CONTRACT: concatenated slices equal the target transform of the whole message. Checked by replaying a
// message at several chunk sizes against one whole render.

import { describe, it, expect, afterAll, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BLOCK_HINT, DECORATOR_CLOSE, DECORATOR_HINT, FENCE, VIEW_EXT } from "./data/markup.js";
import { slice, transform, type DisplayHost } from "./pipeline.js";
import { setDeferred } from "./platform/peers.js";
import { ANSI_RE, tagMark } from "./style.js";

const NAME = "probe";
/** A second view of the same shape, so one message can hold a zone that is deferred and a zone that is not. */
const OURS = "ours_alone";
const STRICT = "strict_probe";
const WIDTH = 60;
const CHUNKS = [1, 2, 7, 23];

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-pipeline-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const view = (name: string, body: string): void =>
  fs.writeFileSync(path.join(dir, name + VIEW_EXT), body);
view(NAME, "said: ${said}\n");
view(OURS, "said: ${said}\n");
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
 * A flush boundary at every line end. Both carrier tokens live INSIDE one line, so no boundary here can fall in the
 * middle of one: this is the shape where the identity is exact, whatever the message holds.
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

// WHOSE decision it is stays at the hook edge, which asks the machine's register once per flush. What this module owes
// is to honour it per ZONE, so the state is set here directly and no register is involved.
describe("a zone a newer engine also draws", () => {
  afterEach(() => setDeferred(new Set()));

  it("leaves the block exactly as written, fences included", () => {
    const msg = block(NAME, "said: theirs");
    setDeferred(new Set([NAME]));
    expect(render(msg)).toBe(msg);
  });

  it("renders, in that same message, the block the decision does NOT name", () => {
    // The whole reason the decision is per zone: standing down for the MESSAGE took this second block with it, and
    // nobody downstream had the view to draw it.
    setDeferred(new Set([NAME]));
    const out = plain(render(block(NAME, "said: theirs") + block(OURS, "said: ours")));
    expect(out).toContain(BLOCK_HINT + NAME);
    expect(out).toContain("said: ours");
  });

  it("hands the whole zone over across a stream, flushed line by line", () => {
    // Withholding runs whatever the decision says, so a non-final flush still cuts an unclosed block: what the newer
    // engine receives is the zone WHOLE at the end, and the identity is over the message, never per flush.
    const msg = block(NAME, "said: theirs");
    setDeferred(new Set([NAME]));
    expect(replayAt(msg, everyLine(msg))).toBe(msg);
  });

  it("leaks only the head of the fence, cut one character per flush", () => {
    // The same accepted residual a rendered zone carries, and it must be no worse here: everything downstream needs
    // arrives, and the stale characters are the opening token's alone.
    const msg = block(NAME, "said: theirs");
    setDeferred(new Set([NAME]));
    const shown = replayAt(msg, everyNth(msg, 1));
    expect(shown).toContain(msg);
    expect(shown.replace(msg, "")).toBe(BLOCK_HINT.slice(0, shown.length - msg.length));
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

  it("arrives PARSED, so a host never re-reads a body the engine already read", () => {
    const seen: Record<string, unknown>[] = [];
    const host: DisplayHost = {
      inject: (_view, data) => {
        seen.push(data);
        return undefined;
      },
    };
    render(block(NAME, "said: it works", "note:", "- one", "- two"), host);
    expect(seen).toEqual([{ said: "it works", note: ["one", "two"] }]);
  });
});

// The property the whole ticket rests on: a view carried by a decorated table draws EXACTLY what the same view
// carried by a fenced block draws, injection included.
describe("the two carriers, on one payload", () => {
  const TLDR = "tldr_probe";
  const HEADLINE = "it shipped";
  const ITEMS = ["the suite is green", "the pack is signed"];
  // NO closing newline, deliberately: a template ending on a blank line would leave the fenced render one blank
  // longer than the decorated one and turn an exact comparison into an approximate one.
  view(TLDR, ["${headline}", "@each notes", "- ${.}", "@end", "${elapsed}"].join("\n"));

  const fenced = block(TLDR, `headline: ${HEADLINE}`, "notes:", ...ITEMS.map((i) => `- ${i}`));
  const table = [
    `${DECORATOR_HINT}${TLDR}${DECORATOR_CLOSE}`,
    "| | |",
    "| --- | --- |",
    `| headline | ${HEADLINE} |`,
    `| notes | - ${ITEMS[0]} |`,
    `| | - ${ITEMS[1]} |`,
    "",
  ].join("\n");
  const host: DisplayHost = { inject: () => ({ elapsed: "3s" }) };

  it("draws the same bytes, injection included", () => {
    expect(render(table, host)).toBe(render(fenced, host));
  });

  it("draws what the payload actually said, so the identity is not two blanks", () => {
    const out = plain(render(table, host));
    expect(out).toContain(HEADLINE);
    for (const item of ITEMS) expect(out).toContain(`- ${item}`);
    expect(out).toContain("3s");
  });
});

describe("the strict view, whichever carrier drew it", () => {
  const FAILED = "the view did not render";
  const reporting = (seen: (boolean | string | null)[]): DisplayHost => ({
    strict: { view: STRICT, failedLine: FAILED },
    onRendered: (ok, error) => seen.push(ok, error),
  });
  /** The strict view, decorated, over a table it can read: `said` is named by the first cell. */
  const decorated = (value: string): string =>
    [
      `${DECORATOR_HINT}${STRICT}${DECORATOR_CLOSE}`,
      "| | |",
      "| --- | --- |",
      `| said | ${value} |`,
      "",
    ].join("\n");

  it("reports the success of a decorated zone, once and on the final flush alone", () => {
    const seen: (boolean | string | null)[] = [];
    const host = reporting(seen);
    render(decorated("it works"), host, false);
    expect(seen).toEqual([]);
    render(decorated("it works"), host, true);
    expect(seen).toEqual([true, null]);
  });

  it("reports the failure of a decorated zone, with the engine's own words", () => {
    const seen: (boolean | string | null)[] = [];
    // A quote where the view reads `said`: nothing it draws could come from the payload, so render.ts refuses.
    const msg = [`${DECORATOR_HINT}${STRICT}${DECORATOR_CLOSE}`, "> a band, and no field", ""].join("\n");
    const out = render(msg, reporting(seen), true);
    expect(plain(out)).toContain(FAILED);
    expect(seen[0]).toBe(false);
    expect(String(seen[1])).toContain(STRICT);
  });

  it("decides ONCE per message, on the zone written last", () => {
    const seen: (boolean | string | null)[] = [];
    const msg = block(STRICT, "not the data format") + decorated("it works");
    render(msg, reporting(seen), true);
    expect(seen).toEqual([true, null]);
  });

  it("is decided by WRITTEN order, never by pass order", () => {
    // The decorator pass merely RUNS second: were the verdict its, this decorated success would mask the fenced
    // failure the screen shows after it.
    const seen: (boolean | string | null)[] = [];
    const msg = decorated("it works") + block(STRICT, "not the data format");
    render(msg, reporting(seen), true);
    expect(seen[0]).toBe(false);
    expect(String(seen[1])).toContain(STRICT);
  });

  it("hands inject the same field bytes on either carrier", () => {
    // A brace is what the decorated render neutralises for the SCREEN, and a bold span is what it styles: the host
    // reads data, so neither treatment may reach it, or the same zone reads differently by carrier.
    const braced = "a **bold** {brace} in prose";
    const seen: Record<string, unknown>[] = [];
    const spy: DisplayHost = {
      inject: (_view, data) => {
        seen.push(data);
        return undefined;
      },
    };
    render(block(NAME, `said: ${braced}`), spy);
    render(
      [`${DECORATOR_HINT}${NAME}${DECORATOR_CLOSE}`, "| | |", "| --- | --- |", `| said | ${braced} |`, ""].join(
        "\n"
      ),
      spy
    );
    expect(seen[1].said).toBe(seen[0].said);
    expect(seen[0].said).toBe(braced);
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

  // The ACCEPTED RESIDUAL, pinned so it cannot quietly get worse. A carrier token cut mid-way is prose to the cut that
  // sees it, and a delta already shown cannot be retracted, so its first characters can reach the screen before the
  // token completes. What the design promises even then is that NOTHING IS LOST: the corrected text is re-emitted from
  // the divergence, and only the stale marker characters stay behind.
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
    // Null, not "": there is nothing to replace, and an empty DEFINED answer would be a suppression of nothing.
    expect(slice(msg, undefined, undefined, true, undefined, options)).toBeNull();
  });

  it("stays silent on a prose delta of an engaged message: an echo defines nothing", () => {
    // The delta reaches the screen through the host either way. What the null buys is the CHAIN: a defined copy of the
    // delta was the answer the dispatcher kept over a peer's render of this same flush (measured 2026-08-12).
    const prev = block(NAME, "said: drawn") + "and then ";
    expect(slice(prev, "plain prose after it", undefined, false, undefined, options)).toBeNull();
  });
});

// The leak of 2026-08-12, pinned at its root: a view NO directory of this engine's search path resolves. Opening a
// zone on it withheld flushes ("" answered) and re-emitted them raw at the close, a DEFINED answer that overwrote,
// order permitting, the render a peer holding the template had answered for the same flush.
describe("a zone whose view this engine cannot resolve", () => {
  const FOREIGN = "elsewhere";
  const decorated = [
    `${DECORATOR_HINT}${FOREIGN}${DECORATOR_CLOSE}`,
    "| | |",
    "| --- | --- |",
    "| said | - hello |",
    "| did | - world |",
    "",
  ].join("\n");

  it("answers NULL on every flush of it, the streamed close included: nothing withheld, nothing echoed", () => {
    for (const size of CHUNKS) {
      let prev = "";
      for (const at of everyNth(decorated, size)) {
        const delta = decorated.slice(prev.length, at);
        const got = slice(prev, delta, undefined, at === decorated.length, undefined, options);
        expect(got, `flush ending at ${at}, ${size} chars each`).toBeNull();
        prev += delta;
      }
    }
  });

  it("answers NULL on the whole-message pass too", () => {
    expect(slice("", decorated, undefined, true, undefined, options)).toBeNull();
  });

  it("still draws, streamed line by line, the view it CAN resolve", () => {
    // Line flushes for the exact-screen claim: cut mid-token, the head's characters leak by design, and that residual
    // is already pinned by "leaks only the head of a carrier token".
    const ours = decorated.split(FOREIGN).join(NAME);
    const target = render(ours);
    expect(plain(target)).toContain("hello");
    expect(replayAt(ours, everyLine(ours))).toBe(target);
  });

  it("answers NULL on every LINE flush of a fenced block naming it, the closing fence included", () => {
    // Line flushes on purpose: a flush cut INSIDE the head line is withheld before the name can be judged, which is
    // the same accepted residual the carrier token already pins ("leaks only the head of a carrier token").
    const fenced = `intro\n${block(FOREIGN, "said: kept")}`;
    let prev = "";
    for (const at of everyLine(fenced)) {
      const delta = fenced.slice(prev.length, at);
      expect(slice(prev, delta, undefined, at === fenced.length, undefined, options)).toBeNull();
      prev += delta;
    }
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

  // BOTH carriers used to fail open on this, and that is why the normalisation sits at the entry rather than in either
  // of them: every matcher here anchors on a line boundary, so a CR standing between the boundary and what the matcher
  // expects on it defeats the match. The block showed its raw fence and the decorator left its token on screen, on
  // input that is perfectly well formed.
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

  // The normalisation is CRLF to LF, never "drop every CR". The distinction is what keeps the two cases below working,
  // and a blunt strip would pass the tests above while breaking both.
  it("keeps a lone CR that no LF follows: it is content, not a boundary", () => {
    const prose = "prose with a \r bare CR in it\n";
    expect(render(prose)).toBe(prose);
  });

  it("still withholds an opening fence cut on the CR of its own line ending", () => {
    // The front half of a CRLF still arriving, which carrier/scan.ts reads as exactly that. Flattened away here, the
    // cut would go blind and show the raw fence.
    expect(render(`${BLOCK_HINT}${NAME}\r`, undefined, false)).not.toContain(BLOCK_HINT);
  });

  it("replays to the same screen, flushed line by line, once a carrier is in view", () => {
    // No leading prose, so the FIRST flush already carries the hint and every delta from then on goes through the
    // engine: the identity is exact.
    const msg = crlf(block(NAME, "said: it works") + "after");
    expect(replayAt(msg, everyLine(msg))).toBe(render(msg));
  });

  // What CRLF costs on a stream, and it is the residual the slice contract already names. Prose flushed BEFORE any
  // carrier is in view went out through the HOST, which returns null there so the host keeps its own markdown, and no
  // delta already on screen can be retracted. Nothing is lost: the flattening starts at the flush that first sees a
  // carrier, and everything after it matches the whole render.
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
