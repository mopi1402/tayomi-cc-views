// The decorator carrier, driven exactly the way the live hook meets it: whole
// messages through transform/slice, streamed flushes through handleMessageDisplay.
// The scenarios are the acceptance list of .tayomi/tickets/cc-views-04.md, and the
// expectations the retired table POC could never satisfy (engage on intent, name
// the template, name the type, keep the fallback native).

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { transform, slice } from "../pipeline.js";
import { handleMessageDisplay } from "../hook/runner.js";
import { cutStreamingDecorated, DECORATOR_HINT } from "./decorator.js";
import { VIEW_EXT } from "../template/load.js";
import { ANSI_RE } from "../style.js";

const ESC = "\x1b";
const RESET = `${ESC}[0m`;
const CYAN = `${ESC}[1;36m`;
const BOLD = `${ESC}[1m`;

// The token as a MODEL writes it, spelled independently of the production
// constant on purpose: inputs built here, assertions on DECORATOR_HINT, so a
// drift in either spelling is caught instead of shared.
const decorator = (view: string, type?: string): string =>
  type === undefined ? `@{view:${view}}` : `@{view:${view}, type:${type}}`;

// The payload furniture, written once.
const EMPTY_HEADER = "| | |";
const DELIM = "| --- | --- |";
const KV_ROW = "| k | v |";
// A table too wide for the carrier, spelled once for both tests that need one.
const THREE_COLS = ["| a | b | c |", "| --- | --- | --- |", "| 1 | 2 | 3 |"];

// The fixture names, written once: every write() below must agree with every
// decorator() call in the tests.
const ITEM = "item";
const ALERT = "alert";
const LOUD = "loud";
const SHADE = "shade";
const STALE = "stale";
// The separator item.view renders between its two columns; the cap assertions
// find the label column's end by it.
const SEP = " > ";
// KV_ROW as item.view shows it.
const KV_SHOWN = `k${SEP}v`;
const lines = (...rows: string[]): string => [...rows, ""].join("\n");
const decorated = (deco: string, ...rows: string[]): string =>
  lines(deco, EMPTY_HEADER, DELIM, ...rows);

// Every fixture view is the same loop around one body line.
const rowsView = (line: string, attrs = ""): string =>
  lines("@fields rows label content", `@each rows${attrs}`, line, "@end");
const viewFile = (name: string, type?: string): string =>
  (type === undefined ? name : `${name}.${type}`) + VIEW_EXT;

// Two view dirs, so the type-shadowing tests have an order to observe.
const first = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-deco-a-"));
const second = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-deco-b-"));
const write = (dir: string, name: string, body: string): void =>
  fs.writeFileSync(path.join(dir, name), body);

write(second, viewFile(ITEM), rowsView("{{cyan}}${label}{{/}}" + SEP + "${content}", ' cap="1/3"'));
write(second, viewFile(ITEM, ALERT), rowsView("!! ${label} ${content}"));
write(first, viewFile(ITEM, LOUD), rowsView("A[${label}|${content}]"));
write(second, viewFile(ITEM, LOUD), rowsView("B[${label}|${content}]"));

const WIDTH = 60;
// The item.view fixture declares cap="1/3", so this is where a label cell stops.
const CAP = Math.floor(WIDTH / 3);
const options = { viewsPath: [first, second], width: WIDTH };

const DECORATED = lines(decorator(ITEM), "| Item | Info |", DELIM, "| Decorator | one line above |");

describe("a decorated payload", () => {
  it("renders through the named template, decorator line and furniture gone", () => {
    const out = transform(DECORATED, undefined, true, undefined, options);
    expect(out).toContain(CYAN);
    expect(out).toContain("Decorator");
    expect(out).toContain("> one line above");
    expect(out).not.toContain(DECORATOR_HINT);
    expect(out).not.toContain("|");
    expect(out).not.toContain("---");
  });

  it("keeps the message itself free of any colour marker", () => {
    // The split the carrier exists for: the transcript keeps plain markdown.
    expect(DECORATED).not.toContain("{{");
    expect(DECORATED).not.toContain(ESC);
  });

  it("renders between two paragraphs, prose untouched", () => {
    const out = transform(`before\n\n${DECORATED}\nafter\n`, undefined, true, undefined, options);
    expect(out).toContain("before");
    expect(out).toContain("after");
    expect(out).not.toContain("|");
  });

  it("honours a bold span the message authored, and adds none elsewhere", () => {
    const out = transform(decorated(decorator(ITEM), "| a | so **very** bold |"), undefined, true, undefined, options);
    expect(out).toContain(`${BOLD}very`);
    expect(out).not.toContain("*");
  });

  it("renders a cell holding an escaped pipe, pipe on screen", () => {
    const out = transform(decorated(decorator(ITEM), "| a\\|b | c |"), undefined, true, undefined, options);
    expect(out.replace(ANSI_RE, "")).toContain("a|b > c");
  });

  it("renders continuation rows one per line, label blank but aligned", () => {
    const msg = decorated(decorator(ITEM), "| key-name | one |", "| | two |");
    const shown = transform(msg, undefined, true, undefined, options).replace(ANSI_RE, "").split("\n");
    const one = shown.find((l) => l.endsWith("> one"));
    const two = shown.find((l) => l.endsWith("> two"));
    expect(one).toBeDefined();
    expect(two).toBeDefined();
    // The alignment must survive a label WIDER than one column: the blank cell
    // pads to the label's width, not to a single space.
    expect(one!.indexOf(">")).toBeGreaterThan("key-name".length);
    expect(two!.indexOf(">")).toBe(one!.indexOf(">"));
  });

  it("caps the label column at a third of the width, on an ellipsis", () => {
    const long = "an unreasonably long label that would eat the row";
    const msg = decorated(decorator(ITEM), `| ${long} | x |`);
    const plain = transform(msg, undefined, true, undefined, options).replace(ANSI_RE, "");
    const line = plain.split("\n").find((l) => l.includes("…"));
    expect(line).toBeDefined();
    // Exactly the cap: a column clamped tighter would be a regression too.
    expect(line!.indexOf(SEP)).toBe(CAP);
    expect(line).toContain("x");
  });

  it("cuts a capped bold label without leaking markup or leaving the style open", () => {
    const msg = decorated(decorator(ITEM), "| aaaaaaaaaaaaaaaaa**bold and more** | tail |");
    const out = transform(msg, undefined, true, undefined, options);
    expect(out).not.toContain("{{");
    expect(out).not.toContain("*");
    const plain = out.replace(ANSI_RE, "");
    const line = plain.split("\n").find((l) => l.includes("…"));
    expect(line).toBeDefined();
    expect(line!.indexOf(SEP)).toBe(CAP);
    expect(line).toContain("tail");
    // The cut lands inside the bold span: its style must be CLOSED before the
    // template's own separator, never left bleeding into the content column.
    const cell = out.split("\n").find((l) => l.includes("…"));
    expect(cell!.indexOf(RESET)).toBeLessThan(cell!.indexOf(SEP));
  });
});

describe("the type", () => {

  it("picks the typed form, and the same payload renders differently under two types", () => {
    const plain = transform(decorated(decorator(ITEM), KV_ROW), undefined, true, undefined, options);
    const alert = transform(decorated(decorator(ITEM, ALERT), KV_ROW), undefined, true, undefined, options);
    expect(alert.replace(ANSI_RE, "")).toContain("!! k v");
    expect(alert).not.toBe(plain);
  });

  it("resolves the typed file through the ordered path, first hit wins", () => {
    const out = transform(decorated(decorator(ITEM, LOUD), KV_ROW), undefined, true, undefined, options);
    expect(out).toContain("A[k|v]");
    expect(out).not.toContain("B[");
  });

  it("lets an earlier dir's default beat a later dir's typed form: path order outranks specificity", () => {
    write(first, viewFile(SHADE), rowsView("D[${label}|${content}]"));
    const type = "warning";
    write(second, viewFile(SHADE, type), rowsView("T[${label}|${content}]"));
    const out = transform(decorated(decorator(SHADE, type), KV_ROW), undefined, true, undefined, options);
    expect(out).toContain("D[k|v]");
    expect(out).not.toContain("T[");
  });

  it("falls back to the default form on a type the template does not know", () => {
    const out = transform(decorated(decorator(ITEM, "sarcastic"), KV_ROW), undefined, true, undefined, options);
    expect(out).toContain(CYAN);
    expect(out.replace(ANSI_RE, "")).toContain(KV_SHOWN);
  });
});

describe("what the carrier must NOT touch", () => {
  it("leaves an undecorated table byte-identical, whatever its rows or columns", () => {
    for (const table of [
      lines("| left | right |", DELIM, "| value | **bold** |"),
      lines(...THREE_COLS),
      lines("| l | r |", DELIM, "| 1 | 2 |", "| 3 | 4 |"),
    ]) {
      expect(transform(table, undefined, true, undefined, options)).toBe(table);
    }
  });

  it("never engages on @{Name='x'}, the PowerShell shape the token guards against", () => {
    expect(slice("", "@{Name='x'} and @{$ref} stay text\n", undefined, true, undefined, options)).toBeNull();
  });

  it("treats an unknown attribute as text, not as the token", () => {
    const msg = lines("@{view:item, junk:x}", EMPTY_HEADER, DELIM, KV_ROW);
    expect(transform(msg, undefined, true, undefined, options)).toBe(msg);
  });
});

describe("fail-open, decorator line included", () => {
  const raw = (msg: string): string => transform(msg, undefined, true, undefined, options);

  it("shows the raw zone on an unknown template name", () => {
    const msg = decorated(decorator("nosuch"), KV_ROW);
    expect(raw(msg)).toBe(msg);
  });

  it("shows the raw zone when the template exists but reads none of the rows", () => {
    // The old two-cell table.view shape: it throws nothing and renders only
    // whitespace, and a blank where content stood must fail open, not ship.
    write(second, viewFile(STALE), lines("@fields left right", "${left}  ${right}"));
    const msg = decorated(decorator(STALE), KV_ROW);
    expect(raw(msg)).toBe(msg);
  });

  it("shows the raw zone on a malformed payload", () => {
    for (const msg of [
      lines(decorator(ITEM), ...THREE_COLS), // three columns
      lines(decorator(ITEM), EMPTY_HEADER, DELIM), // no data row
      lines(decorator(ITEM), "no table at all"), // no payload
    ]) {
      expect(raw(msg)).toBe(msg);
    }
  });
});

describe("streaming", () => {
  it("withholds the zone until its end is known, on an in-order stream", () => {
    const chunks = ["intro", decorator(ITEM), EMPTY_HEADER, DELIM, "| k | **v** |", "after"].map(
      (l) => `${l}\n`
    );
    let prev = "";
    let screen = "";
    chunks.forEach((delta, i) => {
      const display = slice(prev, delta, undefined, i === chunks.length - 1, undefined, options);
      prev += delta;
      screen += display === null ? delta : display;
    });
    expect(screen).toContain("intro");
    expect(screen).toContain("after");
    expect(screen).toContain(`${BOLD}v`);
    expect(screen).not.toContain("|");
    expect(screen).not.toContain(DECORATOR_HINT);
  });

  it("withholds through handleMessageDisplay, out-of-order flushes included", async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-deco-state-"));
    const opts = { ...options, stateDir };
    const id = `deco-stream-${process.pid}`;
    const payload = (index: number, delta: string, final = false): Record<string, unknown> => ({
      message_id: id,
      index,
      delta,
      final,
    });
    const outs: string[] = [];
    const shown = (envelope: string | null): string =>
      envelope === null
        ? ""
        : (JSON.parse(envelope) as { hookSpecificOutput: { displayContent: string } })
            .hookSpecificOutput.displayContent;

    outs.push(shown(await handleMessageDisplay(payload(0, lines("intro", decorator(ITEM), EMPTY_HEADER)), undefined, opts)));
    // The flush carrying the table's body lands LATE, while the final is waiting.
    setTimeout(() => {
      void handleMessageDisplay(payload(1, lines(DELIM, KV_ROW)), undefined, opts);
    }, 30);
    outs.push(shown(await handleMessageDisplay(payload(2, lines("after"), true), undefined, opts)));

    for (const out of outs) {
      expect(out).not.toContain(DECORATOR_HINT);
      expect(out).not.toContain("---");
    }
    const screen = outs.join("");
    expect(screen).toContain("intro");
    expect(screen.replace(ANSI_RE, "")).toContain(KV_SHOWN);
    expect(screen).toContain("after");
  });

  it("holds back a decorator line whose payload has not even started", () => {
    expect(cutStreamingDecorated(lines("prose", decorator(ITEM)))).toBe(lines("prose"));
    expect(cutStreamingDecorated(lines(decorator(ITEM), EMPTY_HEADER))).toBe("");
  });
});
