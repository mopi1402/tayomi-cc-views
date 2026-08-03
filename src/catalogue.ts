// What the engine says about ITSELF, as data an agent reads instead of touring the source.
//
// A DUMP and never a second telling: every entry comes from the module that owns it, so a word taken out of the
// composition table stops being read, the render changes, and this file changes with it. A hand-written description
// could stay complete while being wrong, which is the one thing a catalogue must never be.
//
// Two halves, and the split is the whole design. The STABLE half is true of a VERSION: the language, the names this
// package defines, the views it ships. It is what `agent/catalogue.json` holds, generated and gated at the byte. The
// LIVE half is true of an INSTALL: what a host registered with `extendTags` and what THIS search path resolves, which
// no committed file could ever state.

import {
  ARG_FIELD,
  ARG_LIST,
  CLOSES,
  CONTAINERS,
  READS,
  TAKES,
  opensContainers,
  readsHere,
} from "./data/grammar.js";
import { INDEX_REF, PAYLOAD_FIELDS, TOKEN_SEP } from "./data/language.js";
import { VIEWS_DIR, VIEW_EXT } from "./data/markup.js";
import { SUBST_RE } from "./scope.js";
import { TAG_SUFFIXES, builtinTagNames, tagNames } from "./style.js";
import {
  bundledViewsDir,
  defaultViewsPath,
  listViews,
  loadTemplate,
  viewFile,
} from "./template/load.js";
import type { Template } from "./template/parse.js";

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
  /** The containers this word opens, empty for everything that opens none. */
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
  /** The fields it spends, which is the derivation's own evidence and what an agent has to put in the block. */
  spends: string[];
  tone: string | null;
  /** Every @map and @text table, under the name a substitution reaches it by, with which of the two declared it. */
  tables: Record<string, string>;
  /** Every @fields declaration: the list, and the names its items split into. */
  lists: Record<string, readonly string[]>;
}

export interface Catalogue {
  directives: DirectiveDoc[];
  /** Which words each container reads. The composition graph, as the engine executes it. */
  containers: Record<string, readonly string[]>;
  /** Which fields each payload shape yields, so a view spending one of them is asking for that shape. */
  payloads: Record<string, readonly string[]>;
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

/** The words whose FIRST argument names a field of the block, read off the shape each one declares. */
const NAMES_A_FIELD = new Set(
  Object.keys(TAKES).filter(
    (word) => TAKES[word].startsWith(ARG_FIELD) || TAKES[word].startsWith(ARG_LIST)
  )
);

function kindOf(word: string, opens: string[], readIn: string[]): string {
  if (opens.length > 0) return OPENER;
  if (TERMINATORS.has(word)) return TERMINATOR;
  return readIn.length > 0 ? LINE : DECLARATION;
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

/** The field a substitution reaches for, or null when it reaches for the engine's own bookkeeping instead. */
function slotField(ref: string): string | null {
  const base = ref.split(":")[0].split(".")[0];
  return base === "" || base.startsWith(INDEX_REF) ? null : base;
}

/**
 * Every field name a template spends: each substitution's own, each field a directive NAMES, and everything an @fields
 * declares. The three together are what a block has to carry, and what the payload below is derived from.
 */
function spentFields(tpl: Template): string[] {
  const spent = new Set<string>();
  for (const [, ref] of tpl.body.join("\n").matchAll(SUBST_RE)) {
    const field = slotField(ref);
    if (field !== null) spent.add(field);
  }
  for (const line of tpl.body) {
    // UnTRIMMED: a directive sits at column 0, so an indented line splits on a leading empty token and matches nothing.
    const [word, arg] = line.split(TOKEN_SEP);
    if (arg !== undefined && NAMES_A_FIELD.has(word)) spent.add(arg);
  }
  for (const [list, fields] of Object.entries(tpl.objectLists)) {
    spent.add(list);
    for (const field of fields) spent.add(field);
  }
  return [...spent].sort();
}

/**
 * Which payload a view is asking for, scored on what it spends: a hit for each of the shape's fields it spends, a miss
 * for each it leaves alone. Nothing but scoring can answer it, since `content` belongs to both shapes and a view
 * spending it ALONE (quote.view) is asking for the one that leaves the least unspent.
 *
 * A view spending none of them expects no payload at all, and a tie is reported as none rather than guessed.
 */
function payloadOf(spent: readonly string[]): string | null {
  const held = new Set(spent);
  const scored = Object.entries(PAYLOAD_FIELDS).map(([shape, fields]) => {
    const hits = fields.filter((field) => held.has(field)).length;
    return { shape, hits, score: hits - (fields.length - hits) };
  });
  if (scored.every((s) => s.hits === 0)) return null;
  const best = Math.max(...scored.map((s) => s.score));
  const winners = scored.filter((s) => s.score === best);
  return winners.length === 1 ? winners[0].shape : null;
}

function viewDoc(name: string, dir: string, file: string): ViewDoc {
  const tpl = loadTemplate(name, [dir]);
  const spends = spentFields(tpl);
  return {
    name,
    file,
    static: !tpl.spendsSlots,
    payload: payloadOf(spends),
    spends,
    tone: tpl.tone ?? null,
    tables: Object.fromEntries(
      Object.entries(tpl.tables).map(([tableName, table]) => [tableName, table.kind])
    ),
    lists: { ...tpl.objectLists },
  };
}

/** The half both callers share, so neither states the language a second time. */
function assemble(views: ViewDoc[], tags: string[]): Catalogue {
  return {
    directives: directives(),
    containers: { ...READS },
    payloads: { ...PAYLOAD_FIELDS },
    tags: { names: tags, suffixes: TAG_SUFFIXES },
    views,
  };
}

/**
 * What is true of this VERSION: the language, the names this package defines, and the views it ships, each named by the
 * path it occupies INSIDE the package so an agent can copy one and adapt it under another name.
 */
export function stableCatalogue(): Catalogue {
  const dir = bundledViewsDir();
  const views = listViews(dir).map((name) =>
    viewDoc(name, dir, `${VIEWS_DIR}${POSIX_SEP}${name}${VIEW_EXT}`)
  );
  return assemble(views, builtinTagNames());
}

/**
 * What is true of this INSTALL: the tags a host registered here, and the views THIS search path resolves, in resolution
 * order with the first hit winning, each named by the file it was actually read from.
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
