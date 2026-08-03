// One view rendered, and the two decisions this composition owns alone.
//
// The TONE CHAIN: four candidates, most explicit first, each falling through when the palette does not know the name.
// It is why one template renders in any colour, so the precedence is asserted rather than described.
//
// "RAW OVER HOLLOW": a non-empty block that parsed to no fields throws, so the carrier shows the block as written. An
// empty skeleton looks like the model said nothing.

import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VIEW_EXT } from "../data/markup.js";
import { hasControlMark } from "../data/marks.js";
import { ANSI_RE, renderTags, tagMark } from "../style.js";
import { renderView, traceView } from "./render.js";
import { parseTemplate } from "./parse.js";
import * as LANG from "../data/language.js";

const NAME = "probe";
const WIDTH = 60;
const options = { width: WIDTH };
const TONE_SLOT = "tone";
const ESC = "\x1b";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-render-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const view = (body: string, name = NAME, type?: string): string => {
  const file = type ? `${name}.${type}${VIEW_EXT}` : name + VIEW_EXT;
  fs.writeFileSync(path.join(dir, file), body);
  return name;
};
const render = (data: object | string, dressing?: object, injected?: object): string =>
  renderView(NAME, data as never, [dir], injected as never, options, dressing as never);
const plain = (s: string): string => s.replace(ANSI_RE, "");

describe("rendering a view", () => {
  it("substitutes the data into the template's body", () => {
    view("said: ${said}");
    expect(plain(render({ said: "it works" }))).toContain("said: it works");
  });

  it("parses RAW block text through the view's own @fields declaration", () => {
    view("${state}/${msg}");
    const template = view("@fields rows state msg\n@each rows\n${state}/${msg}\n@end");
    expect(template).toBe(NAME);
    expect(plain(render("rows:\n- ok all good"))).toContain("ok/all good");
  });

  it("leaves no engine control mark on the way out", () => {
    view('@each note bullet="- "\n${#bullet}${.}\n@end');
    expect(hasControlMark(render({ note: ["one"] }))).toBe(false);
  });

  it("resolves a code span into the pinned accent", () => {
    view("run `it` now");
    expect(render({})).toContain(ESC);
  });

  it("hands a code span's line back the style the TEMPLATE opened around it", () => {
    // The chain is the assertion: markCode has to run before fillTone and renderTags, or the span's terminator is a
    // sequence by the time the enclosing style is resolved and the rest of the line prints plain. That is the defect
    // this whole ticket is, and it is invisible to any test that composes the three passes by hand.
    const seq = (name: string): string => renderTags(tagMark(name));
    const DIM = "dim";
    view(`${tagMark(DIM)}- Read \`trace.ts\` again${tagMark("/")}`);
    expect(render({}).trim()).toBe(
      `${seq(DIM)}- Read ${seq("code")}trace.ts${seq("/")}${seq(DIM)} again${seq("/")}`
    );
  });
});

describe("raw over hollow", () => {
  it("throws on a non-empty block that parsed to no fields at all", () => {
    view("${said}");
    expect(() => render("this is prose, not the data format")).toThrow(NAME);
  });

  it("renders an EMPTY block, which is a static view summoned by its name alone", () => {
    view("a static line");
    expect(plain(render(""))).toContain("a static line");
  });

  it("never lets injected fields make an empty block look parsed", () => {
    view("${said}");
    expect(() => render("prose", undefined, { injected: "x" })).toThrow(NAME);
  });

  // The SECOND reading of the rule, and the one no test of the OUTPUT can deliver: data arrived and the template reads
  // none of it. A template drawing literal furniture puts ink on screen whatever it was handed, so the ink is the wrong
  // thing to measure, and what answers is the reads the accessor RECORDED while the render ran.
  describe("data arrived that the template reads none of", () => {
    // Literal furniture around one slot: exactly the shape that defeated the ink test.
    const FURNITURE = "[[ ";
    const furnished = (): string => view(`${FURNITURE}\${said} ]]`);

    it("throws rather than drawing its furniture around nothing", () => {
      furnished();
      expect(() => render({ unrelated: "value" })).toThrow(NAME);
    });

    it("renders as soon as ONE field it reads arrived, whatever came with it", () => {
      furnished();
      expect(plain(render({ unrelated: "v", said: "here" }))).toContain("here");
    });

    it("counts NO read for an include that fell through, so the block comes back raw", () => {
      // What the user loses if this passes instead: Claude sends a warning, the include cannot use the field, and the
      // screen shows one line of template source with the content gone from the transcript. Refusing is what hands the
      // block back to the carrier, where the words are still readable (pipeline.ts).
      view(`@use ${INCLUDED} from said`);
      expect(() => render({ said: "a string, where the include wants a mapping" })).toThrow(NAME);
    });

    it("counts the read as soon as the include DRAWS, and then the view stands", () => {
      view(`@use ${INCLUDED} from said`);
      expect(plain(render({ said: { content: "drawn" } }))).toContain("drawn");
    });

    it("counts the field a DOTTED path walks into, not the path", () => {
      // The regression this guard is most prone to, and the only direction that costs anything: a template naming
      // `${row.inner.deep}` reads the key `row`, and reading the whole path here would blank a render nothing was wrong
      // with.
      view("deep: ${row.inner.deep}");
      expect(plain(render({ row: { inner: { deep: "found" } } }))).toContain("deep: found");
    });

    it("counts a field named by a DIRECTIVE, not only one inside a ${}", () => {
      // The loop names `rows` on its own line; nothing spends `${rows}` anywhere.
      view("@each rows\n- ${.}\n@end");
      expect(plain(render({ rows: ["one"] }))).toContain("one");
    });

    it("counts a field the HOST injected, since a view is meant to read those", () => {
      furnished();
      expect(plain(render({ unrelated: "v" }, undefined, { said: "from the host" }))).toContain(
        "from the host"
      );
    });

    it("exempts a STATIC template, which reads nothing by definition", () => {
      view("a static line");
      expect(plain(render({ unrelated: "value" }))).toContain("a static line");
    });

    // What MEASURING buys over gathering, beyond closing the hole. A gathered set holds every name the source mentions,
    // including ones no render can spend, so a block carrying one passed the guard and drew a skeleton. Each case below
    // rendered EMPTY before.
    it("refuses data whose only match lives inside a loop that never ran", () => {
      view("@fields rows a b\n@each rows\n${a}/${b}\n@end");
      expect(() => render({ a: "x" })).toThrow(NAME);
      // The same template with its list is untouched, or the rule would cost the loop.
      expect(plain(render({ rows: [{ a: "1", b: "2" }] }))).toContain("1/2");
    });

    it("refuses data named after a TAG, which is a palette word and no field", () => {
      // `@tone gold` mentions `gold`, so a gathered set held it and a block writing a `gold` field rendered a blank
      // line. Nothing ever looks it up.
      view(`${LANG.TONE} gold\n\${said}`);
      expect(() => render({ gold: "x" })).toThrow(NAME);
    });

    it("refuses data named after an ASIDE's view, for the same reason", () => {
      view(`${LANG.ASIDE} tayo\n\${said}\n${LANG.ENDASIDE}`);
      expect(() => render({ tayo: "x" })).toThrow(NAME);
    });

    // EVERY way a template can name a top-level field, in one table.
    //
    // The guard decides on what the render ASKED the scope for, so a naming form counts the day it resolves a field.
    // What is left for a table to catch is the one way back into the old defect: a directive reading the scope WITHOUT
    // going through lookup. The test under this one holds the language's vocabulary against the table, so a directive
    // added to language.ts arrives here whether or not anyone wrote its line.
    // The view an include points AT: this temp dir is the whole search path, and an unresolvable name reads nothing.
    const INCLUDED = view("${content}", "included");

    const NAMED_BY: Array<[string, string, object]> = [
      ["${field}", "x ${said}", { said: "v" }],
      ["${field:table}", '@text t a="A"\nx ${said:t}', { said: "a" }],
      ["a dotted path", "x ${row.inner.deep}", { row: { inner: { deep: "v" } } }],
      ["blanks inside the braces", "x ${ said }", { said: "v" }],
      ["@each", "@each note\n- ${.}\n@end", { note: ["one"] }],
      ["@fields then @each", "@fields rows a b\n@each rows\n${a}/${b}\n@end", { rows: [{ a: "1", b: "2" }] }],
      // The slot in these two is UNFILLED on purpose: it makes the template one the guard applies to, and leaves the
      // directive's own field as the only match there is. Without it the template spends nothing, the guard exempts it,
      // and the case passes whatever the directive does.
      ["@foot", "@box\n${unfilled}\n@foot cause\n@endbox", { cause: "why" }],
      ["@frame", "@box\n${unfilled}\nlit\n@frame state ok=success\n@endbox", { state: "ok" }],
      ["@head", "@box\n@head ${title}\nlit\n@endbox", { title: "T" }],
      ["@right", "@box\n@right ${badge}\nlit\n@endbox", { badge: "B" }],
      ["@rule", "@rule ${label}\nlit", { label: "L" }],
      // The bullet's own slot cannot be the sole match by construction: it is only ever substituted once the loop runs,
      // so the LIST is always in the data beside it.
      ["@each carrying a bullet", '@each rows bullet="${k} "\n${.}\n@end', { rows: ["one"] }],
      ["@each nested in a @box", "@box\n@each note\n- ${.}\n@end\n@endbox", { note: ["one"] }],
      ["@aside around a slot", "@aside tayo\n${said}\n@endaside", { said: "v" }],
      // Nothing else here spends a slot: a view made of includes alone is still one the guard must be able to refuse.
      ["@use pointed at a field", `@use ${INCLUDED} from said`, { said: { content: "v" } }],
    ];

    // Rendering IS the assertion: had the field been read by a path the accessor never saw, the recorded set would not
    // hold it and this render would be refused.
    //
    // Which only holds if the entry is one the guard can REFUSE, and two were not: a template spending no slot is
    // exempt, so `@foot` and `@frame` passed whatever those directives did. The two expectations below are that hole
    // made impossible.
    it.each(NAMED_BY)("renders when the field is named by %s", (_label, body, data) => {
      expect(parseTemplate(body).spendsSlots).toBe(true);
      expect(Object.keys(data)).toHaveLength(1);
      view(body);
      expect(() => render(data)).not.toThrow();
    });

    // The forcing function. The words are read from the VOCABULARY, not listed here, so a directive added to
    // language.ts arrives the moment it is declared, and its author has two ways forward: drive it in the table above,
    // or write down here that it names no field. Both are a decision; neither can be forgotten.
    const DIRECTIVES = Object.values(LANG).filter(
      (v): v is string => typeof v === "string" && v.startsWith("@")
    );

    /** A directive whose argument is not a field, each with what it names instead. */
    const NAMES_NO_FIELD: Record<string, string> = {
      [LANG.MAP]: "declares a lookup table, under a name no scope holds",
      [LANG.TEXT]: "the same, for the enum-to-word half of the registry",
      [LANG.TONE]: "names a palette class, resolved against the tags and never the data",
      [LANG.ASIDE]: "names a VIEW file, whose body is taken as text and never substituted",
      [LANG.BOX]: "structure alone: it takes no argument at all",
      [LANG.ENDBOX]: "a terminator, which takes none either",
      [LANG.ENDASIDE]: "a terminator, which takes none either",
      [LANG.END]: "a terminator, which takes none either",
    };

    const DRIVEN = new Set(
      NAMED_BY.flatMap(([, body]) => body.split("\n"))
        .map((l) => /^@\w+/.exec(l)?.[0])
        .filter((w): w is string => w !== undefined)
    );

    it.each(DIRECTIVES)("%s is either driven by the table above, or says why it names no field", (word) => {
      if (NAMES_NO_FIELD[word] !== undefined) return;
      expect([...DRIVEN]).toContain(word);
    });

    it("holds no exemption for a word the language no longer declares", () => {
      // The other direction, or the list rots into a list of excuses: a directive that is renamed or dropped leaves an
      // entry answering for nothing.
      expect(DIRECTIVES.length).toBeGreaterThan(Object.keys(NAMES_NO_FIELD).length);
      expect(Object.keys(NAMES_NO_FIELD).filter((w) => !DIRECTIVES.includes(w))).toEqual([]);
    });
  });
});

describe("the tone chain", () => {
  const slot = (): string => view(tagMark(TONE_SLOT) + "x");
  const coloured = (data: object, dressing?: object): string => {
    slot();
    return render(data, dressing);
  };
  const neutral = (): string => coloured({});

  it("takes the carrier's own tone first, over everything else", () => {
    const out = coloured({ tone: "success", type: "error" }, { tone: "warning", type: "error" });
    expect(out).not.toBe(neutral());
    expect(out).toBe(coloured({}, { tone: "warning" }));
  });

  it("takes the block's tone field when the carrier named none", () => {
    expect(coloured({ tone: "warning" })).toBe(coloured({}, { tone: "warning" }));
  });

  it("takes the kind under either name when no tone was given", () => {
    expect(coloured({ type: "warning" })).toBe(coloured({}, { tone: "warning" }));
    expect(coloured({}, { type: "warning" })).toBe(coloured({}, { tone: "warning" }));
  });

  it("falls back to what the template declared with @tone", () => {
    view(`${LANG.TONE} warning\n${tagMark(TONE_SLOT)}x`);
    const declared = render({});
    view(`${LANG.TONE} success\n${tagMark(TONE_SLOT)}x`);
    expect(declared).not.toBe(render({}));
  });

  it("falls THROUGH a name the palette does not know, rather than blanking the slot", () => {
    expect(coloured({ tone: "not_a_palette_name", type: "warning" })).toBe(
      coloured({}, { tone: "warning" })
    );
  });

  it("keeps the neutral when nothing in the chain resolves", () => {
    expect(coloured({ tone: "not_a_palette_name" })).toBe(neutral());
  });
});

describe("the carrier's kind", () => {
  it("picks a TYPED template file when one exists beside the plain form", () => {
    // A type no other case passes: a typed file written here outlives this test in the shared dir, and would silently
    // answer for a later one.
    const OWN_TYPE = "boxed";
    view("plain form");
    view("typed form", NAME, OWN_TYPE);
    expect(plain(render({}, { type: OWN_TYPE }))).toContain("typed form");
    expect(plain(render({}))).toContain("plain form");
  });

  it("reaches the template as an ordinary field, so a view can print it", () => {
    view("kind: ${type}");
    expect(plain(render({}, { type: "warning" }))).toContain("kind: warning");
  });

  it("OVERRIDES a field of the same name: a block cannot be of two kinds", () => {
    view("kind: ${type}");
    expect(plain(render({ type: "error" }, { type: "warning" }))).toContain("kind: warning");
  });
});

describe("injected fields", () => {
  it("reach the scope, for state the model never wrote", () => {
    view("${said} / ${elapsed}");
    expect(plain(render({ said: "x" }, undefined, { elapsed: "3s" }))).toContain("x / 3s");
  });

  it("win over a field of the same name the block wrote", () => {
    view("${said}");
    expect(plain(render({ said: "model" }, undefined, { said: "display" }))).toContain("display");
  });
});

// The set the render builds to answer its own third refusal, handed back rather than discarded. It is what `check`
// reads to name a field that arrived and was read nowhere, and the reason it is a RETURN value is asserted here: a
// scope carrying its own would be carrying a field.
describe("what a render recorded", () => {
  it("holds the fields the body ASKED FOR, and not the ones it merely received", () => {
    view("${said}");
    const { out, read } = traceView(NAME, { said: "x", spare: "y" }, [dir], undefined, options);
    expect(plain(out)).toContain("x");
    expect([...read]).toEqual(["said"]);
  });

  it("leaves the caller's own scope exactly as it arrived, every piece of bookkeeping taken back off", () => {
    // `full` IS the caller's object when nothing is injected, so what the engine writes on it for the duration of the
    // render has to come back off: the read set would count as a field that ARRIVED on a second render, and the label
    // width belongs to the TEMPLATE, so a scope keeping one would hand the next view its predecessor's column.
    view("${said}");
    const scope: Record<string, unknown> = { said: "x" };
    const { read } = traceView(NAME, scope, [dir], undefined, options);
    expect(Object.keys(scope)).toEqual(["said"]);
    expect([...read]).toEqual(["said"]);
  });

  it("takes them back off the scope a render THREW on, which is when a caller retries", () => {
    view("${said}");
    const scope: Record<string, unknown> = {};
    expect(() => traceView(NAME, scope, [dir], undefined, options)).toThrow();
    expect(Object.keys(scope)).toEqual([]);
  });
});
