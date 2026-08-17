// What the engine says about ITSELF, as data an agent reads instead of touring the source.
//
// A DUMP and never a second telling: every entry comes from the module that owns it, so a word taken out of the
// composition table stops being read, the render changes, and this file changes with it.
//
// The STABLE half is true of a VERSION and is what `agent/catalogue.json` holds, generated and gated at the byte. The
// LIVE half is true of an INSTALL: what a host registered with `extendTags` and what THIS search path resolves.

import {
  ARG_FIELD,
  ARG_KIND,
  ARG_TAG,
  ARG_VALUE,
  ARG_VIEW,
  CLOSES,
  CONTAINERS,
  READS,
  TAKES,
  opensContainers,
  readsHere,
} from "./data/grammar.js";
import {
  FIELD_CONTENT,
  FIELD_TONE,
  FIELD_TYPE,
  MARKER_FORM,
  PAYLOAD_FENCE,
  PAYLOAD_FIELDS,
  PAYLOAD_QUOTE,
  PAYLOAD_TABLE,
} from "./data/language.js";
import {
  BLOCK_HINT,
  DECORATOR_CLOSE,
  DECORATOR_HINT,
  DIAGRAM_INFO,
  FENCE,
  ITEM_MARK,
  NAME_MARK,
  NEST_INDENT,
  QUOTE_MARK,
  TABLE_MARK,
  VIEWS_DIR,
  VIEW_EXT,
} from "./data/markup.js";
import { TAG_SUFFIXES, builtinTagNames, tagNames } from "./style.js";
import {
  bundledViewsDir,
  defaultViewsPath,
  listViews,
  loadTemplate,
  viewFile,
} from "./template/load.js";

/** What a word IS, told from what the tables above answer for it rather than from a fifth list to keep in step. */
const OPENER = "opener";
const TERMINATOR = "terminator";
const LINE = "line";
const DECLARATION = "declaration";

export interface DirectiveDoc {
  word: string;
  kind: string;
  /** What follows the word, as an author types it. */
  takes: string;
  opens: string[];
  closedBy: string | null;
  /** The containers whose own loop reads this word. Empty for a declaration, which the PARSER reads wherever it sits. */
  readIn: string[];
}

export interface ViewDoc {
  name: string;
  file: string;
  /** Draws with no data at all, which is what parts a health check from a view waiting on a block. */
  static: boolean;
  /** The payload shape this view expects, derived from the fields it spends, or null when it expects none. */
  payload: string | null;
  spends: string[];
  tone: string | null;
  /** Every @map and @text table, under the name a substitution reaches it by, with which of the two declared it. */
  tables: Record<string, string>;
  /** Every @fields declaration: the list, and the names its items split into. */
  lists: Record<string, readonly string[]>;
}

export interface AttributeDoc {
  name: string;
  takes: string;
  does: string;
}

export interface CarrierDoc {
  kind: string;
  opens: string;
  closedBy: string | null;
  carries: string;
  attributes: AttributeDoc[];
  /** What asks for a STATIC view, on the carriers that have such a form, and null on the ones that do not. */
  withoutPayload: string | null;
}

export interface LineDoc {
  form: string;
  does: string;
}

export interface PayloadDoc {
  /** The fields this shape yields. Spending one of them is what says a view expects it. */
  fields: readonly string[];
  selectedBy: string;
  /** The kind marker this shape may open with, on the one shape that has one. */
  marker: string | null;
}

export interface BlockDoc {
  carriers: CarrierDoc[];
  lines: LineDoc[];
}

export interface Catalogue {
  directives: DirectiveDoc[];
  /** Which words each container reads. The composition graph, as the engine executes it. */
  containers: Record<string, readonly string[]>;
  block: BlockDoc;
  payloads: Record<string, PayloadDoc>;
  tags: { names: string[]; suffixes: readonly string[] };
  views: ViewDoc[];
}

export interface LiveCatalogue extends Catalogue {
  /** The dirs a view name resolves through, in order, first hit winning. */
  viewsPath: string[];
}

/** A path INSIDE the published package: posix, so the generated file is the same bytes on every platform. */
const POSIX_SEP = "/";

const TERMINATORS = new Set(Object.values(CLOSES));

function kindOf(word: string, opens: string[], readIn: string[]): string {
  if (opens.length) return OPENER;
  if (TERMINATORS.has(word)) return TERMINATOR;
  return readIn.length ? LINE : DECLARATION;
}

function directives(): DirectiveDoc[] {
  return Object.keys(TAKES).map((word) => {
    const opens = [...opensContainers(word)];
    const readIn = CONTAINERS.filter((container) => readsHere(container, word));
    return {
      word,
      kind: kindOf(word, opens, readIn),
      takes: TAKES[word],
      opens,
      closedBy: CLOSES[word] ?? null,
      readIn: [...readIn],
    };
  });
}

function viewDoc(name: string, dir: string, file: string): ViewDoc {
  // Spends and payload come OFF the template (parse.ts): the render's refusal is decided on the same value this
  // publishes, so the catalogue cannot promise a shape the engine would turn away.
  const tpl = loadTemplate(name, [dir]);
  return {
    name,
    file,
    static: !tpl.spendsSlots,
    payload: tpl.payload,
    spends: tpl.spends,
    tone: tpl.tone ?? null,
    tables: Object.fromEntries(
      Object.entries(tpl.tables).map(([tableName, table]) => [tableName, table.kind])
    ),
    lists: { ...tpl.objectLists },
  };
}

/**
 * How a message CARRIES data to a view: knowing that `banner` wants a quote spending `content` says nothing about what
 * to type. Every form is spelled from the token the engine ENGAGES on, so a rename reaches this dump with no edit here.
 */
function block(): BlockDoc {
  const attribute = (name: string, takes: string, does: string): AttributeDoc => ({
    name,
    takes,
    does,
  });
  return {
    carriers: [
      {
        kind: "fenced",
        opens: BLOCK_HINT + ARG_VIEW,
        closedBy: FENCE,
        carries: "the data lines below it, to the closing fence",
        attributes: [],
        withoutPayload: null,
      },
      {
        kind: "decorator",
        opens: DECORATOR_HINT + ARG_VIEW + DECORATOR_CLOSE,
        closedBy: null,
        carries: "the plain markdown on the NEXT line, which still reads where this engine does not run",
        attributes: [
          attribute(FIELD_TYPE, ARG_KIND, "the KIND of content, and it may select a typed view file"),
          attribute(FIELD_TONE, ARG_TAG, "the LOOK only, and it outranks the kind"),
        ],
        withoutPayload: "a blank line under it, or the end of the message",
      },
    ],
    lines: [
      { form: `${ARG_FIELD}${NAME_MARK} ${ARG_VALUE}`, does: "a scalar field, the value opaque to end of line" },
      { form: `${ARG_FIELD}${NAME_MARK}`, does: "opens a list field" },
      { form: `${ITEM_MARK} ${ARG_VALUE}`, does: "appends an item to the list the key above opened" },
      {
        form: `${NEST_INDENT}${ARG_FIELD}${NAME_MARK} ${ARG_VALUE}`,
        does: "a pair of the mapping that key holds, ONE level and no deeper",
      },
      { form: "anything else", does: "ignored: no line of a block is ever refused" },
    ],
  };
}

/** What selects each payload, on its first line and nowhere else, beside the fields it yields. */
function payloads(): Record<string, PayloadDoc> {
  const selector: Record<string, string> = {
    [PAYLOAD_TABLE]: TABLE_MARK,
    [PAYLOAD_QUOTE]: QUOTE_MARK,
  };
  return {
    ...Object.fromEntries(
      Object.entries(PAYLOAD_FIELDS).map(([shape, fields]) => [
        shape,
        {
          fields,
          selectedBy: `a first line starting with ${selector[shape]}`,
          marker: shape === PAYLOAD_QUOTE ? MARKER_FORM : null,
        },
      ])
    ),
    // Not in PAYLOAD_FIELDS: a fence is never derived from what a view spends, only claimed by @diagram (parse.ts).
    [PAYLOAD_FENCE]: {
      fields: [FIELD_CONTENT],
      selectedBy: `a first line of exactly ${FENCE}${DIAGRAM_INFO}, the source running to the closing ${FENCE}`,
      marker: null,
    },
  };
}

function assemble(views: ViewDoc[], tags: string[]): Catalogue {
  return {
    directives: directives(),
    containers: { ...READS },
    block: block(),
    payloads: payloads(),
    tags: { names: tags, suffixes: TAG_SUFFIXES },
    views,
  };
}

/** What is true of this VERSION, each view named by the path it occupies INSIDE the package. */
export function stableCatalogue(): Catalogue {
  const dir = bundledViewsDir();
  const views = listViews(dir).map((name) =>
    viewDoc(name, dir, `${VIEWS_DIR}${POSIX_SEP}${name}${VIEW_EXT}`)
  );
  return assemble(views, builtinTagNames());
}

/**
 * What is true of this INSTALL: the tags a host registered here, and the views THIS search path resolves, first hit
 * winning, each named by the file it was actually read from.
 */
export function liveCatalogue(dirs: string[] = defaultViewsPath()): LiveCatalogue {
  const views: ViewDoc[] = [];
  const claimed = new Set<string>();
  for (const dir of dirs) {
    for (const name of listViews(dir)) {
      if (claimed.has(name)) continue;
      claimed.add(name);
      views.push(viewDoc(name, dir, viewFile(dir, name)));
    }
  }
  return { ...assemble(views, tagNames()), viewsPath: [...dirs] };
}
