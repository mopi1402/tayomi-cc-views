// The composition graph: which word is READ inside which container.
//
// Data rather than control flow, and that is the whole point. A catalogue describing this language has to be a DUMP of
// what the engine executes, never a second telling of it, so `renderBody` READS this table: a word taken out of an
// entry stops being read, the render changes, and the suite falls. A table the engine did not consult could be wrong
// while staying complete, and complete-but-wrong is the one thing a catalogue must never be.
//
// What is NOT here: what an opener DOES with its body. Framing, composing a column, iterating a list and measuring its
// widths is rendering, not grammar, and no table expresses it. That half is answered by running the engine.

import {
  ALIGNS,
  ASIDE,
  BARE,
  BOX,
  DECLS,
  EACH,
  END,
  ENDASIDE,
  ENDBOX,
  FIELDS,
  FOOT,
  FRAME,
  FROM,
  HEAD,
  MAP,
  PAIR_SEP,
  QUOTED,
  RIGHT,
  RULE,
  TEXT,
  TONE,
  USE,
  stem,
} from "./language.js";

/**
 * A place a line can sit.
 *
 * `@box bare` is its OWN container rather than a flag on the box: it draws the same body and reads strictly fewer
 * words, which is exactly what an entry of this table says.
 */
export const TOP = "top";
export const IN_BOX = stem(BOX);
export const IN_BOX_BARE = `${IN_BOX}-${BARE}`;
export const IN_ASIDE = stem(ASIDE);
export const IN_EACH = stem(EACH);
export const CONTAINERS = [TOP, IN_BOX, IN_BOX_BARE, IN_ASIDE, IN_EACH] as const;
export type Container = (typeof CONTAINERS)[number];

/**
 * What each container's own loop READS. Anything else on a line falls through to the body, where the author sees it
 * printed rather than swallowed.
 *
 * A container's inner lines are then rendered as an ordinary body, so everything `TOP` reads works inside a box or an
 * aside through that recursion. The four chrome words are different: they are read by the BOX's loop itself, which is
 * why they exist nowhere else and why a bare container, having no border to hang them on, reads none of them.
 */
export const READS: Record<Container, readonly string[]> = {
  [TOP]: [BOX, ASIDE, RULE, EACH, USE],
  [IN_BOX]: [HEAD, RIGHT, FOOT, FRAME],
  [IN_BOX_BARE]: [],
  [IN_ASIDE]: [],
  // A divider BETWEEN items is a thing only the loop can place, and the collapsing in box.ts drops the trailing one.
  // Everything else inside an @each is a line of the item and belongs to substitution, @use included: a view drawn PER
  // ITEM is a feature nobody has designed.
  [IN_EACH]: [RULE],
};

/** Whether this container reads this word. The engine's own question, asked before every matcher. */
export const readsHere = (container: Container, word: string): boolean =>
  READS[container].includes(word);

/**
 * The containers a word OPENS. Derived from the naming above rather than tabled a second time: a container is named for
 * the word that opens it, and `@box` alone opens two, the bare form reading strictly fewer words.
 */
export const opensContainers = (word: string): Container[] =>
  CONTAINERS.filter((c) => c === stem(word) || c.startsWith(`${stem(word)}-`));

/** What closes each block-opening word, derived from the closers the language already names. */
export const CLOSES: Record<string, string> = {
  [BOX]: ENDBOX,
  [ASIDE]: ENDASIDE,
  [EACH]: END,
};

/** One argument, named by the KIND of thing it holds. The kind is the whole information here. */
const arg = (kind: string): string => `<${kind}>`;
const opt = (form: string): string => `[${form}]`;
const MORE = "...";
const QUOTE = `"${MORE}"`;
/** The one @each declaration whose value is not free text. Told apart by the shape DECLS itself holds for it. */
const FRACTION_FORM = `"n/d"`;
const declForm = (d: string): string =>
  opt(d + PAIR_SEP + (DECLS[d] === QUOTED ? QUOTE : FRACTION_FORM));

export const ARG_FIELD = arg("field");
export const ARG_VIEW = arg("view");
export const ARG_TEXT = arg("text");
export const ARG_TAG = arg("tag");
export const ARG_NAME = arg("name");
export const ARG_LIST = arg("list");
export const ARG_VALUE = arg("value");
/** Not a directive's, but the same placeholder vocabulary: what a decorator's `type:` attribute takes. */
export const ARG_KIND = arg("kind");

/**
 * What each word takes after it, written as an author types it.
 *
 * DECLARED, and that is not a shortcut: `@foot message` and `@aside tayo` are the same one-word matcher, so no pattern
 * on earth tells a field of the block from the name of a file. The kind is written by hand whatever we do, and what
 * catches a wrong one is `check`, running the engine over a template built from this table.
 *
 * Every token it names comes from language.ts, so renaming `bare`, `from` or an @each declaration reaches a reader of
 * this table with no edit here. A terminator takes nothing, and its empty entry says so.
 */
export const TAKES: Record<string, string> = {
  [MAP]: `${ARG_NAME} ${ARG_VALUE}${PAIR_SEP}${ARG_TAG} ${MORE}`,
  [TEXT]: `${ARG_NAME} ${ARG_VALUE}${PAIR_SEP}${QUOTE} ${MORE}`,
  [FIELDS]: `${ARG_LIST} ${ARG_FIELD} ${MORE}`,
  [TONE]: ARG_TAG,
  [BOX]: opt(BARE),
  [HEAD]: ARG_TEXT,
  [RIGHT]: ARG_TEXT,
  [FOOT]: ARG_FIELD,
  [FRAME]: `${ARG_FIELD} ${ARG_VALUE}${PAIR_SEP}${ARG_TAG} ${MORE}`,
  [RULE]: opt(ARG_TEXT),
  [EACH]: [ARG_FIELD, ...Object.keys(DECLS).map(declForm)].join(" "),
  [ASIDE]: `${ARG_VIEW} ${opt(ALIGNS.join("|"))}`,
  [USE]: `${ARG_VIEW} ${opt(`${FROM} ${ARG_FIELD}`)}`,
  [END]: "",
  [ENDBOX]: "",
  [ENDASIDE]: "",
};
