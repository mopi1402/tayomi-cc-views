// The catalogue, judged where it could LIE.
//
// A dump is worthless if it merely happens to agree with the engine today. So the cases below drive it from the other
// side: the words come from the vocabulary rather than from the catalogue's own source, a container's entry is taken
// OUT and the dump has to follow, and the one view in this package that is raw escape art is used to prove the ink
// never leaves style.ts.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  liveCatalogue,
  stableCatalogue,
  type CarrierDoc,
  type LineDoc,
  type DirectiveDoc,
  type ViewDoc,
} from "./catalogue.js";
import { ARG_FIELD, ARG_VALUE, ARG_VIEW, READS, TOP } from "./data/grammar.js";
import * as LANG from "./data/language.js";
import {
  BOX,
  END,
  ENDBOX,
  FIELD_TONE,
  FIELD_TYPE,
  MAP,
  MARKER_FORM,
  PAYLOAD_QUOTE,
  PAYLOAD_TABLE,
  USE,
} from "./data/language.js";
import {
  BLOCK_HINT,
  DECORATOR_CLOSE,
  DECORATOR_HINT,
  FENCE,
  NAME_MARK,
  QUOTE_MARK,
  TABLE_MARK,
  VIEWS_DIR,
  VIEW_EXT,
} from "./data/markup.js";
import { transform } from "./pipeline.js";
import { TEXT_TABLE } from "./scope.js";
import { ANSI_RE, extendTags } from "./style.js";
import { bundledViewsDir, listViews, viewFile } from "./template/load.js";
import { parseData } from "./template/view-data.js";

const ESC = "\x1b";
const DIRECTIVES = Object.values(LANG).filter(
  (v): v is string => typeof v === "string" && v.startsWith(END[0])
);

const entry = (word: string): DirectiveDoc => {
  const found = stableCatalogue().directives.find((d) => d.word === word);
  if (found === undefined) throw new Error(`no catalogue entry for ${word}`);
  return found;
};
const view = (name: string): ViewDoc => {
  const found = stableCatalogue().views.find((v) => v.name === name);
  if (found === undefined) throw new Error(`no catalogue entry for view ${name}`);
  return found;
};

/** A word taken out of a container's entry, put back whatever the assertion does, since the table is module state. */
function without(container: keyof typeof READS, word: string, run: () => void): void {
  const table = READS as Record<string, readonly string[]>;
  const saved = table[container];
  table[container] = saved.filter((w) => w !== word);
  try {
    run();
  } finally {
    table[container] = saved;
  }
}

describe("the language it dumps", () => {
  it("carries every word the vocabulary declares, and not one more", () => {
    // Read from language.ts rather than from the catalogue's own table: a word added there and wired nowhere still has
    // to arrive here, and an entry outliving a deleted word fails the same case.
    const words = stableCatalogue().directives.map((d) => d.word);
    expect([...words].sort()).toEqual([...DIRECTIVES].sort());
  });

  it("tells an opener from a declaration by what the tables answer for it", () => {
    // No fifth list saying which is which: @box opens two regions because two are NAMED for it, and @map is a
    // declaration because nothing reads it in a container, the parser stripping it wherever it sits.
    expect(entry(BOX)).toMatchObject({ opens: ["box", "box-bare"], closedBy: ENDBOX, readIn: [TOP] });
    expect(entry(MAP)).toMatchObject({ opens: [], closedBy: null, readIn: [] });
    expect(entry(BOX).kind).not.toBe(entry(MAP).kind);
  });

  it("follows the composition table rather than describing it", () => {
    // The claim the whole file rests on. Take @use out of what the top level reads and the dump loses it too, in both
    // places it appears: a description sitting beside the code would still say yes.
    expect(entry(USE).readIn).toEqual([TOP]);
    without(TOP, USE, () => {
      expect(entry(USE).readIn).toEqual([]);
      expect(stableCatalogue().containers[TOP]).not.toContain(USE);
    });
  });
});

describe("the views it ships", () => {
  it("carries every view of the package's own views/, each under the path it occupies inside it", () => {
    const cat = stableCatalogue();
    expect(cat.views.map((v) => v.name)).toEqual(listViews(bundledViewsDir()));
    for (const v of cat.views) {
      expect(v.file).toBe(`${VIEWS_DIR}/${v.name}${VIEW_EXT}`);
      // Relative, or the generated file would carry the machine it was generated on.
      expect(path.isAbsolute(v.file)).toBe(false);
    }
  });

  it("derives the payload a view expects from the fields it spends", () => {
    expect(view("columns").payload).toBe("table");
    expect(view("banner").payload).toBe("quote");
    expect(view("hr").payload).toBeNull();
  });

  it("gives a view spending `content` ALONE the quote, the shape it leaves least unspent", () => {
    // The near-miss of the derivation: `content` belongs to both payloads, so nothing but the score parts them.
    expect(view("quote").spends).toEqual(["content"]);
    expect(view("quote").payload).toBe("quote");
  });

  it("says which views draw with no data at all", () => {
    expect(view("hr").static).toBe(true);
    expect(view("welcome").static).toBe(true);
    expect(view("banner").static).toBe(false);
  });

  it("carries what a view declares, under the names a template reaches them by", () => {
    expect(view("banner").tables).toEqual({ kinds: TEXT_TABLE });
    expect(view("columns").lists).toEqual({ rows: ["label", "content"] });
    expect(view("columns").tone).toBe("key");
    expect(view("banner").lists).toEqual({});
  });
});

describe("the block a message writes", () => {
  const block = () => stableCatalogue().block;
  const carrier = (kind: string): CarrierDoc => {
    const found = block().carriers.find((c) => c.kind === kind);
    if (found === undefined) throw new Error(`no carrier ${kind}`);
    return found;
  };
  /** One declared line form, with real names put where the placeholders are. */
  const fill = (line: LineDoc, field: string, value: string): string =>
    line.form.replace(ARG_FIELD, field).replace(ARG_VALUE, value);

  it("spells both carriers from the token that ENGAGES the pipeline", () => {
    // Not a form typed twice: what the catalogue shows an author is what the scanner looks for, character for
    // character, so a renamed fence reaches the reader with no edit beside it.
    expect(carrier("fenced").opens.startsWith(BLOCK_HINT)).toBe(true);
    expect(carrier("fenced").closedBy).toBe(FENCE);
    expect(carrier("decorator").opens.startsWith(DECORATOR_HINT)).toBe(true);
    expect(carrier("decorator").opens.endsWith(DECORATOR_CLOSE)).toBe(true);
    expect(carrier("decorator").withoutPayload).not.toBeNull();
  });

  it("names the two attributes from the fields they land in, and the engine accepts exactly those", () => {
    // Declared, then VERIFIED: the names are read out of the catalogue and handed to the real carrier, so an
    // attribute the dump invented, or one the matcher stopped reading, fails here.
    const attrs = carrier("decorator").attributes.map((a) => a.name);
    expect(attrs).toEqual([FIELD_TYPE, FIELD_TONE]);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-block-"));
    try {
      fs.writeFileSync(path.join(dir, `probe${VIEW_EXT}`), `\${${FIELD_TYPE}} \${content}\n`);
      const line = carrier("decorator")
        .opens.replace(ARG_VIEW, "probe")
        .replace(DECORATOR_CLOSE, `, ${FIELD_TYPE}${NAME_MARK}warning${DECORATOR_CLOSE}`);
      const out = transform(`${line}\n> the payload\n`, undefined, true, undefined, {
        viewsPath: [dir],
        width: 80,
      });
      expect(out).toContain("warning the payload");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("states every line the data parser recognises, and each form parses to what it claims", () => {
    // The forms are taken from the dump and fed to the parser itself, so a shape stated here and matched nowhere is
    // caught. The last entry is the near-miss the whole format rests on: an unrecognised line is DROPPED, never
    // refused, which is what keeps a block total.
    const [scalar, opener, item, nested, other] = block().lines;
    expect(parseData(fill(scalar, "title", "hello"))).toEqual({ title: "hello" });
    expect(parseData(fill(opener, "notes", ""))).toEqual({ notes: [] });
    expect(parseData(`${fill(opener, "notes", "")}\n${fill(item, "", "one")}`)).toEqual({
      notes: ["one"],
    });
    expect(parseData(`${fill(opener, "alert", "")}\n${fill(nested, "kind", "fail")}`)).toEqual({
      alert: { kind: "fail" },
    });
    expect(parseData(other.form)).toEqual({});
  });

  it("says what selects each payload and gives the quote its kind marker", () => {
    const { payloads } = stableCatalogue();
    expect(payloads[PAYLOAD_TABLE].selectedBy).toContain(TABLE_MARK);
    expect(payloads[PAYLOAD_QUOTE].selectedBy).toContain(QUOTE_MARK);
    expect(payloads[PAYLOAD_QUOTE].marker).toBe(MARKER_FORM);
    expect(payloads[PAYLOAD_TABLE].marker).toBeNull();
    expect(payloads[PAYLOAD_QUOTE].fields).toContain(FIELD_TYPE);
  });
});

describe("what never reaches it", () => {
  it("carries no ESC byte, though one view it ships IS raw escape art", () => {
    // Not a vacuous case: tayo.view is a wall of SGR sequences, and it is IN the catalogue. What is dumped is what a
    // view declares, never its body, which is what keeps the palette's values inside style.ts.
    expect(fs.readFileSync(viewFile(bundledViewsDir(), "tayo"), "utf8")).toContain(ESC);
    expect(view("tayo").name).toBe("tayo");
    for (const dumped of [JSON.stringify(stableCatalogue()), JSON.stringify(liveCatalogue())]) {
      expect(dumped).not.toContain(ESC);
      expect(dumped.match(ANSI_RE)).toBeNull();
    }
  });
});

describe("the two halves", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-catalogue-"));
  const HOST_TAG = "catalogue_test_host_tone";
  const SHADOWED_VIEW = "hr";
  const HOST_FIELD = "headline";

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("keeps a host's own tag out of the stable half and carries it in the live one", () => {
    extendTags({ [HOST_TAG]: `${ESC}[35m` });
    expect(liveCatalogue().tags.names).toContain(HOST_TAG);
    expect(stableCatalogue().tags.names).not.toContain(HOST_TAG);
  });

  it("resolves views in path order, first hit winning, and says which path it read", () => {
    fs.writeFileSync(path.join(dir, SHADOWED_VIEW + VIEW_EXT), `\${${HOST_FIELD}}\n`);
    const dirs = [dir, bundledViewsDir()];
    const live = liveCatalogue(dirs);
    const shadowed = live.views.filter((v) => v.name === SHADOWED_VIEW);

    expect(live.viewsPath).toEqual(dirs);
    expect(shadowed).toHaveLength(1);
    expect(shadowed[0].file).toBe(viewFile(dir, SHADOWED_VIEW));
    expect(shadowed[0].spends).toEqual([HOST_FIELD]);
    // The stable half answers for the VERSION, so it never saw the dir the host put first.
    expect(view(SHADOWED_VIEW).file).toBe(`${VIEWS_DIR}/${SHADOWED_VIEW}${VIEW_EXT}`);
    expect(JSON.stringify(stableCatalogue())).not.toContain(dir);
  });
});
