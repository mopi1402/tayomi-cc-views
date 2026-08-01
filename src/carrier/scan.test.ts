// The carrier's two streaming losses, pinned where they live.
//
// Both were SCREEN losses rather than render bugs, so everything here is measured on
// the screen: what one flush puts on it, and what the concatenation of every flush's
// slice adds up to. Two defects, one witness each way:
//
//   - the opening fence line arriving character by character. VIEW_OPEN waits for the
//     newline that ENDS it, so every cut inside that line left the carrier blind and
//     the fence went out raw, with no way to take a printed delta back.
//   - the block that never closes. The cut ran on the final delta too, where no later
//     flush exists to reveal what it held, so the tail of the message was swallowed.
//
// The witness is spelled character-exact, because the positions are the report: its
// prose is 7 characters, so the opening fence starts at 7 and its line closes at 19,
// and the unclosed form is 50 characters of which 7 used to survive.

import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { slice, transform } from "../pipeline.js";
import { cutUnclosedBlock } from "./scan.js";

// The view the witnesses carry: this file is about the CARRIER, so the template is
// deliberately the most boring one that renders (no box, no frame, one loop).
const NOTE_VIEW = ["@each note", " - ${.}", "@end", ""].join("\n");

const views = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-scan-"));
fs.writeFileSync(path.join(views, "note.view"), NOTE_VIEW);
afterAll(() => {
  fs.rmSync(views, { recursive: true, force: true });
});

const options = { viewsPath: [views], width: 60 };

// The fence, spelled here rather than imported from the carrier: a test that shares
// the production spelling of what it forbids on screen cannot catch a drift in it.
const FENCE = "```";
const HINT = `${FENCE}view:`;

// The witness, character by character: 7 characters of prose, the 13-character
// opening fence line (7 to 19), the body, the closing fence.
const PROSE = "Note:\n\n";
const OPEN = `${HINT}note\n`;
const WITNESS = `${PROSE}${OPEN}note:\n- first\n- second\n${FENCE}\n`;

// The same message cut off before its block ever closes: 50 characters, of which the
// final flush used to show 7 and swallow 43.
const UNCLOSED = `${PROSE}${OPEN}note:\n- the block never closed`;

// A message carrying TWO blocks, the shape the report came in on. From the first
// complete `HINT` onwards the engine owns the screen for every later flush, so the
// second opening fence arrives with no host drawing to hide behind: it is the
// carrier's own business, cut wherever the stream cuts it.
const bullets = (tag: string): string =>
  [1, 2, 3]
    .map((i) => `- ${tag} line ${i}, long enough that the body spans several flushes\n`)
    .join("");
const block = (tag: string): string => `${OPEN}note:\n${bullets(tag)}${FENCE}\n`;
// Long on purpose: at 33 chunks the FIRST one must still carry the whole opening
// hint, or that flush is a message with no view fence anywhere, which stays the
// host's own to draw. 33 * (the hint's end, 14) is the floor, and this clears it.
const TWO = [
  "Two:\n\n",
  block("first"),
  "\nA paragraph between them, which the engine leaves exactly as written.\n\n",
  block("second"),
  "\nAnd a last sentence after the second block.\n",
].join("");

// What ONE flush shows: transform of the text so far is exactly what the engine puts
// on screen for that flush.
const shown = (text: string, final = false): string =>
  transform(text, undefined, final, undefined, options);

// One message streamed as a list of deltas, and the screen it leaves behind. A flush
// the engine declines (null) is the HOST's own to draw, exactly as the live hook
// leaves it, so its delta lands on screen raw.
function streamed(deltas: string[]): { screen: string; declined: number } {
  let prev = "";
  let screen = "";
  let declined = 0;
  deltas.forEach((delta, i) => {
    const display = slice(prev, delta, undefined, i === deltas.length - 1, undefined, options);
    if (display === null) declined++;
    screen += display ?? delta;
    prev += delta;
  });
  return { screen, declined };
}

// n chunks of one message, as even as its length allows.
function chunks(text: string, n: number): string[] {
  const at = (i: number): number => Math.floor((i * text.length) / n);
  return Array.from({ length: n }, (_, i) => text.slice(at(i), at(i + 1)));
}

// The flush counts the live stream produced for one message, kept as they were
// recorded: they cut the fence lines every way a stream can.
const COUNTS = [2, 9, 17, 33];

describe("a view block arriving on a stream", () => {
  it("shows no raw fence at ANY cut point of the message", () => {
    const whole = shown(WITNESS, true);
    for (let at = 0; at <= WITNESS.length; at++) {
      const screen = shown(WITNESS.slice(0, at));
      // Ten cuts leaked before this held: 10 through 19, the opening fence line
      // arriving one character at a time under a scan that only knew complete lines.
      expect(screen).not.toContain(FENCE);
      // And what a flush shows is a PREFIX of what the message ends up showing: the
      // cut delays content, it never drops it and never has to take anything back.
      expect(whole.startsWith(screen)).toBe(true);
    }
  });

  it("renders a closed block the same whether the flush is the last or not", () => {
    expect(shown(WITNESS)).toBe(shown(WITNESS, true));
    expect(shown(WITNESS)).not.toContain(FENCE);
    expect(shown(WITNESS)).toContain("- first");
  });
});

describe("a message carrying two view blocks", () => {
  const whole = (): string => {
    const single = slice("", TWO, undefined, true, undefined, options);
    expect(single).not.toBeNull();
    return single as string;
  };

  it("puts no raw fence on screen at any cut, and lands on the unchunked screen", () => {
    const target = whole();
    for (let at = 0; at <= TWO.length; at++) {
      // A flush whose text carries no view fence ANYWHERE is the host's own to draw,
      // and this fix does not widen what engages the engine: those cuts are not the
      // carrier's to answer for. From the first complete hint on, they all are.
      if (at !== 0 && !TWO.slice(0, at).includes(HINT)) continue;
      const { screen, declined } = streamed([TWO.slice(0, at), TWO.slice(at)]);
      expect(declined).toBe(at === 0 ? 1 : 0);
      expect(screen).not.toContain(FENCE);
      expect(screen).toBe(target);
    }
  });

  it("converges on the same screen at 2, 9, 17 and 33 chunks", () => {
    const target = whole();
    for (const n of COUNTS) {
      const deltas = chunks(TWO, n);
      expect(deltas).toHaveLength(n);
      expect(deltas.join("")).toBe(TWO);
      // The precondition the witness is sized for: the engine owns the screen from
      // the very first flush, so nothing on it was drawn by the host.
      expect(deltas[0]).toContain(HINT);
      const { screen, declined } = streamed(deltas);
      expect(declined).toBe(0);
      expect(screen).not.toContain(FENCE);
      expect(screen).toBe(target);
    }
  });
});

describe("a block that never closes", () => {
  it("reaches the screen WHOLE on the final flush, all 50 characters of it", () => {
    expect(UNCLOSED).toHaveLength(50);
    // One flush, and it is the last: nothing may be held back, because no later flush
    // exists to reveal it. The cut used to leave 7 characters and lose 43.
    expect(slice("", UNCLOSED, undefined, true, undefined, options)).toBe(UNCLOSED);
  });

  it("is still withheld on a flush that is not the last", () => {
    expect(shown(UNCLOSED)).toBe(PROSE);
    // A caller that omits the flag keeps that behaviour: the cut asks for `final`
    // to be true, it never assumes it.
    expect(transform(UNCLOSED, undefined, undefined, undefined, options)).toBe(PROSE);
  });

  it("loses nothing at any cut point: the last flush re-emits every withheld character", () => {
    for (let at = 0; at <= UNCLOSED.length; at++) {
      if (at !== 0 && !UNCLOSED.slice(0, at).includes(HINT)) continue;
      const { screen } = streamed([UNCLOSED.slice(0, at), UNCLOSED.slice(at)]);
      expect(screen).toBe(UNCLOSED);
      expect(screen).toHaveLength(50);
    }
  });

  it("fails open on the final flush for a view that does not exist either", () => {
    const absent = `${PROSE}${FENCE}view:nosuch\nnote:\n- kept`;
    expect(slice("", absent, undefined, true, undefined, options)).toBe(absent);
  });
});

describe("cutUnclosedBlock", () => {
  it("withholds the opening fence line character by character, before VIEW_OPEN can see it", () => {
    let arriving = "";
    for (const ch of OPEN.slice(0, -1)) {
      arriving += ch;
      expect(cutUnclosedBlock(PROSE + arriving)).toBe(PROSE);
    }
    // And the complete line, which is what it already did.
    expect(cutUnclosedBlock(PROSE + OPEN)).toBe(PROSE);
    expect(cutUnclosedBlock(`${PROSE}${OPEN}note:\n- half a bod`)).toBe(PROSE);
  });

  it("hands back an ordinary code fence as soon as it cannot be a view opening", () => {
    // Three backticks alone could still become a view opening, so they wait one
    // flush: withholding is always transient, and the next flush settles it.
    expect(cutUnclosedBlock(`prose\n${FENCE}`)).toBe("prose\n");
    const bash = `prose\n${FENCE}bash`;
    expect(cutUnclosedBlock(bash)).toBe(bash);
    expect(cutUnclosedBlock(`${bash}\nls\n`)).toBe(`${bash}\nls\n`);
  });

  it("leaves a line whose backticks are not an opening exactly as written", () => {
    for (const text of [
      "run the `ls` command\n",
      "run the `ls",
      `${PROSE}${FENCE}view:two names\n`,
      "",
    ]) {
      expect(cutUnclosedBlock(text)).toBe(text);
    }
  });

  it("keeps a CLOSED block that failed to render, fences and all", () => {
    const failed = `${PROSE}${OPEN}not a field line\n${FENCE}\n`;
    expect(cutUnclosedBlock(failed)).toBe(failed);
  });

  it("cuts from the LAST opening, complete or still arriving", () => {
    const above = `${PROSE}${OPEN}note:\n- a\n${FENCE}\nmore\n`;
    expect(cutUnclosedBlock(`${above}${OPEN}note:\n- b`)).toBe(above);
    expect(cutUnclosedBlock(`${above}${HINT}no`)).toBe(above);
  });
});
