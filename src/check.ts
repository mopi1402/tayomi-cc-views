// The second audience: at RUNTIME nothing may erase what the model sent, so a malformed line falls through to the body
// and a broken view hands the raw block back. At AUTHORING time that same silence teaches nothing.
//
// So this needs no parser of its own: an unknown tag comes back literally and a malformed directive falls through to
// the body, which means a SURVIVOR in the rendered output IS the error, already located. A schema restating the grammar
// could drift from what the matchers actually decide; a survivor cannot.

import fs from "node:fs";
import path from "node:path";
import { DECORATOR_HINT, decoratedZones, renderDecorated } from "./carrier/decorator.js";
import { TAKES } from "./data/grammar.js";
import { FIELD_CONTENT, FIELD_FLOW } from "./data/language.js";
import type { RenderOptions } from "./options.js";
import type { Scope } from "./scope.js";
import { ANSI_RE, TAG_SOURCE } from "./style.js";
import { defaultViewsPath, loadTemplate } from "./template/load.js";
import type { Template } from "./template/parse.js";
import { traceView, type Traced } from "./template/render.js";
import { parseData } from "./template/view-data.js";

/** Non-zero to a caller: the view will not draw what its author meant. */
export const ERROR = "error";
/** Zero to a caller: true, worth saying, and a legitimate choice. A view narrowing what it shows is not broken. */
export const WARNING = "warning";

/** A directive the engine did not read where it sits, so it printed as text. */
export const DIRECTIVE = "directive";
/** A tag the palette does not answer for, so it reached the screen verbatim. */
export const TAG = "tag";
/** The engine's own refusal, caught and carried WORD FOR WORD: rewording it would make this a second telling. */
export const REFUSAL = "refusal";
/** A sample that feeds some other view, so the one under check was never exercised. */
export const UNFED = "unfed";

/** A field the block carried and the template asked for nowhere. */
export const UNREAD = "unread";

/** What a sweep reads: markdown, since a sample IS the block a model writes into a message. */
const SAMPLE_EXT = ".md";

export interface Finding {
  severity: typeof ERROR | typeof WARNING;
  kind: string;
  /** The TEMPLATE line it stands on, which is the line whose author has to act. Null for what has no single line. */
  line: number | null;
  message: string;
}

// eslint-disable-next-line security/detect-non-literal-regexp
const TAG_RE = new RegExp(TAG_SOURCE, "g");

// LONGEST first, so a surviving `@endbox` is named as itself rather than as the `@end` it contains.
const WORDS = Object.keys(TAKES).sort((a, b) => b.length - a.length);

const strip = (s: string): string => s.replace(ANSI_RE, "");

const finding = (
  severity: typeof ERROR | typeof WARNING,
  kind: string,
  line: number | null,
  message: string
): Finding => ({ severity, kind, line, message });

/**
 * What the template WROTE and the render still PRINTED. Both halves: the output alone would blame the template for a
 * `{{tag}}` the sample data carried, and the template alone cannot tell a directive that was read from one that fell
 * through.
 */
function survivors(out: string, body: readonly string[]): Finding[] {
  const printed = strip(out);
  const found: Finding[] = [];
  body.forEach((source, index) => {
    const at = index + 1;
    const word = WORDS.find((w) => source.includes(w) && printed.includes(w));
    if (word !== undefined) {
      found.push(finding(ERROR, DIRECTIVE, at, `${word} printed as text: nothing reads it where it sits`));
    }
    for (const [mark] of source.matchAll(TAG_RE)) {
      if (printed.includes(mark)) {
        found.push(finding(ERROR, TAG, at, `${mark} printed as text: the palette answers to no such name`));
      }
    }
  });
  return found;
}

const caught = (e: unknown): Finding =>
  finding(ERROR, REFUSAL, null, e instanceof Error ? e.message : String(e));

// ONE body under two names: the quote yields it as `content` line for line and as `flow` with the breaks spent as
// spaces, either derived from the other (render.ts), so a view spending one has read the text.
const ONE_BODY: readonly string[] = [FIELD_CONTENT, FIELD_FLOW];

/** A field the block carried and the render never asked for, judged on what it ACTUALLY resolved. */
const unread = (arrived: readonly string[], read: ReadonlySet<string>): Finding[] =>
  arrived
    .filter(
      (field) =>
        !read.has(field) && !(ONE_BODY.includes(field) && ONE_BODY.some((name) => read.has(name)))
    )
    .map((field) => finding(WARNING, UNREAD, null, `${field} arrived and is read nowhere`));

/**
 * A sample written as a DECORATED block, run through the carrier that reads one. Only a decorator names a payload
 * SHAPE, and the shape is what a template refuses on (render.ts), so a decorated sample read as flat data could never
 * reach that refusal: the view came back clean here while every real block fell open to raw markdown on screen.
 *
 * The carrier's own pass, not a narrower copy of it: what it swallows to keep the runtime fail-open is exactly what an
 * author must be told, and it now records that reason for this to read.
 */
function checkDecorated(
  name: string,
  block: string,
  dirs: string | string[],
  tpl: Template,
  options?: RenderOptions
): Finding[] {
  // The sample must actually FEED this view. A block naming another one drew that other view, came back clean, and
  // left this one untested behind a green verdict, which is the same silence the whole command exists to break.
  const zone = decoratedZones(block).find((z) => z.view === name);
  if (zone === undefined) {
    return [finding(ERROR, UNFED, null, `the sample carries no ${name} block, so nothing checked it`)];
  }
  const { out, refusals } = renderDecorated(block, dirs, options);
  if (refusals.length) return refusals.map((r) => finding(ERROR, REFUSAL, null, r.reason));
  // The carrier draws and records no trace, so what it READ comes off a second pass over the zone's own data, dressed
  // exactly as the carrier dressed it: the typed file a `type:` selects is then the one judged.
  const { read } = traceView(name, zone.data, dirs, undefined, options, zone.dressing);
  return [...survivors(out, tpl.body), ...unread(Object.keys(zone.data), read)];
}

/**
 * Run `name` against a sample block and report what an author has to fix. The engine's refusal ends the report on its
 * own, since nothing was drawn to read survivors out of. An EMPTY block checks the template with no data at all, which
 * keeps a static view checkable rather than refused for want of a sample it never spends.
 */
export function check(name: string, block = "", options?: RenderOptions): Finding[] {
  const dirs = options?.viewsPath ?? defaultViewsPath();
  const data: Scope | string = block === "" ? {} : block;
  let tpl: Template;
  let traced: Traced;
  // The ENGINE alone sits in here, so a throw of this module's own can never be reported as the engine's verdict.
  try {
    tpl = loadTemplate(name, dirs);
    // Loaded FIRST either way: a name resolving to no file is the author's error before any carrier is chosen.
    if (block.includes(DECORATOR_HINT)) return checkDecorated(name, block, dirs, tpl, options);
    traced = traceView(name, data, dirs, undefined, options);
  } catch (e) {
    return [caught(e)];
  }
  const arrived = typeof data === "string" ? Object.keys(parseData(data, tpl.objectLists)) : [];
  return [...survivors(traced.out, tpl.body), ...unread(arrived, traced.read)];
}

/** One view of a sweep, and what checking it said. */
export interface Swept {
  name: string;
  findings: Finding[];
}

/**
 * Every sample in `dir` checked against the view it NAMES, so a whole set of views is gated in one run rather than one
 * hand-rolled shell loop per repository.
 *
 * The convention is the one this package already lived by before it was named: `<view>.md` holds the block that feeds
 * `<view>`. Nothing is discovered from the views themselves, deliberately, since a view with no sample is a view a
 * sweep cannot judge, and reporting it as passed is the silence this whole command exists to break.
 *
 * A directory it cannot READ throws, and is never softened into the empty list: the two are one keystroke apart and
 * opposite in meaning, and a gate aimed at a path that does not exist would otherwise report green forever.
 */
export function checkAll(dir: string, options?: RenderOptions): Swept[] {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(SAMPLE_EXT))
    .map((file) => {
      const name = file.slice(0, -SAMPLE_EXT.length);
      return { name, findings: check(name, fs.readFileSync(path.join(dir, file), "utf8"), options) };
    });
}

/**
 * The payload shape `name` resolved to, in a line for its author, or null where no view loads at all: `check` reports
 * that refusal in its own words, and a second telling of it teaches nothing.
 *
 * A template never DECLARES its shape, it is SCORED into one off what it spends. So an author is the one person who
 * cannot see the answer for their own file, and finds out only when every real block falls open on screen. Nothing is
 * computed here that the catalogue has not always published; what was missing is where an author looks.
 */
export function takes(name: string, options?: RenderOptions): string | null {
  const dirs = options?.viewsPath ?? defaultViewsPath();
  let payload: string | null;
  try {
    payload = loadTemplate(name, dirs).payload;
  } catch {
    return null;
  }
  return payload === null ? "takes no payload" : `takes a ${payload} payload`;
}

/** Whether a report is a REFUSAL rather than a remark, which is the whole of the exit code. */
export const failed = (findings: readonly Finding[]): boolean =>
  findings.some((f) => f.severity === ERROR);

/** One finding as a line, in the shape every compiler has printed since forever: file, line, severity, reason. */
export const report = (name: string, f: Finding): string =>
  `${name}${f.line === null ? "" : `:${f.line}`}: ${f.severity}: ${f.message}`;
