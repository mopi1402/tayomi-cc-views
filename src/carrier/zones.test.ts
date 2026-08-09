// The reader a host's GATE judges with: what a message carries, both carriers, without drawing any of it. Pinned here
// is the CONTRACT: which zones are reported, in what order, in whose grammar, and where the reading stops.

import { describe, it, expect } from "vitest";
import { viewZones } from "./zones.js";
import { FIELD_CONTENT, FIELD_HEAD, FIELD_ROWS, FIELD_TYPE } from "../data/language.js";
import { BLOCK_HINT, DECORATOR_CLOSE, DECORATOR_HINT, FENCE } from "../data/markup.js";

const NAME = "probe";
const OTHER = "other_probe";

const lines = (...rows: string[]): string => [...rows, ""].join("\n");
const block = (view: string, ...body: string[]): string =>
  lines(BLOCK_HINT + view, ...body, FENCE);
const decorator = (view: string): string => `${DECORATOR_HINT}${view}${DECORATOR_CLOSE}`;
const table = (view: string, ...rows: string[]): string =>
  lines(decorator(view), "| | |", "| --- | --- |", ...rows);

describe("a fenced block", () => {
  it("is reported by name, with its body parsed", () => {
    expect(viewZones(block(NAME, "said: it works"))).toEqual([
      { view: NAME, data: { said: "it works" } },
    ]);
  });

  it("keeps a LIST unsplit, which is this reader's documented limit", () => {
    // @fields belongs to the template, and no template is loaded here: a gate reads the items as the message wrote
    // them, exactly as it always has.
    const [zone] = viewZones(block(NAME, `${FIELD_ROWS}:`, "- ok all good"));
    expect(zone.data[FIELD_ROWS]).toEqual(["ok all good"]);
  });

  it("is reported whether or not it would ever DRAW, no template being loaded", () => {
    expect(viewZones(block("no_such_view", "said: x"))).toEqual([
      { view: "no_such_view", data: { said: "x" } },
    ]);
  });
});

describe("a decorated zone", () => {
  it("reports a two-column table in the grammar a block writes, rows and all", () => {
    const [zone] = viewZones(table(NAME, "| said | it works |"));
    expect(zone.view).toBe(NAME);
    expect(zone.data.said).toBe("it works");
    expect(zone.data[FIELD_ROWS]).toHaveLength(1);
  });

  it("reports a value as WRITTEN, emphasis and braces included: the styled cell is the render's alone", () => {
    const [zone] = viewZones(table(NAME, "| said | a **bold** {brace} |"));
    expect(zone.data.said).toBe("a **bold** {brace}");
  });

  it("builds a list from item cells, a continuation row appending to it", () => {
    const [zone] = viewZones(table(NAME, "| note | - one |", "| | - two |"));
    expect(zone.data.note).toEqual(["one", "two"]);
  });

  it("reports a WIDER table as rows alone, the named reading being two columns' own", () => {
    const [zone] = viewZones(
      lines(decorator(NAME), "| | | |", "| --- | --- | --- |", "| a | b | c |")
    );
    expect(Object.keys(zone.data)).toEqual([FIELD_ROWS]);
  });

  it("reports the header row a table said something in", () => {
    const [zone] = viewZones(
      lines(decorator(NAME), "| Largeur | Verdict |", "| --- | --- |", "| 4 | tient |")
    );
    expect(zone.data[FIELD_HEAD]).toBeDefined();
  });

  it("reports a blockquote as its content and its kind", () => {
    const [zone] = viewZones(lines(decorator(NAME), "> [!WARNING]", "> two flaky suites", ""));
    expect(zone.data[FIELD_CONTENT]).toBe("two flaky suites");
    expect(zone.data[FIELD_TYPE]).toBe("warning");
  });

  it("reports a payload-LESS decorator, which is how a static view is summoned", () => {
    expect(viewZones(lines(decorator(NAME), "", "prose"))).toEqual([{ view: NAME, data: {} }]);
  });

  it("reports a zone whose payload it could NOT read, carrying nothing", () => {
    // The alternative is worse than useless to a gate: an unreadable payload would be indistinguishable from a message
    // that never named the view at all.
    expect(viewZones(lines(decorator(NAME), "| ragged |", "| --- |", "| x |"))).toEqual([
      { view: NAME, data: {} },
    ]);
  });

  it("reports a zone a REFUSED run swallowed, which the render rescans and draws", () => {
    // A quote run holds any non-blank line, so the second decorator joins the first zone and refuses it; the render
    // rescans and draws it, so a reader that skipped the run would miss a zone the screen shows.
    const msg = lines(decorator(NAME), "> quote", ...table(OTHER, "| said | y |").split("\n"));
    expect(viewZones(msg).map((z) => z.view)).toEqual([NAME, OTHER]);
  });
});

describe("what the pipeline flattens, this reader flattens the same way", () => {
  it("reads a CRLF transcript exactly as its LF twin, both carriers", () => {
    const lf = block(NAME, "said: x") + table(OTHER, "| said | y |");
    expect(viewZones(lf)).toHaveLength(2);
    expect(viewZones(lf.split("\n").join("\r\n"))).toEqual(viewZones(lf));
  });
});

describe("a message carrying both", () => {
  it("reports every zone in the order it was written", () => {
    const msg = table(OTHER, "| said | second |") + block(NAME, "said: first");
    expect(viewZones(msg).map((z) => z.view)).toEqual([OTHER, NAME]);
    const msg2 = block(NAME, "said: first") + table(OTHER, "| said | second |");
    expect(viewZones(msg2).map((z) => z.view)).toEqual([NAME, OTHER]);
  });

  it("reports nothing for a message that carries neither", () => {
    expect(viewZones("ordinary prose with a | pipe | in it")).toEqual([]);
  });
});

describe("what a message merely SHOWS", () => {
  const quoted = (...body: string[]): string => lines(FENCE, ...body, FENCE);

  it("is no zone: a carrier quoted inside an ordinary fence is an example", () => {
    expect(viewZones(quoted(...block(NAME, "said: x").split("\n")))).toEqual([]);
    expect(viewZones(quoted(...table(NAME, "| said | x |").split("\n")))).toEqual([]);
  });
});
