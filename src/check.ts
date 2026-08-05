// The second audience: at RUNTIME nothing may erase what the model sent, so a malformed line falls through to the body
// and a broken view hands the raw block back. At AUTHORING time that same silence teaches nothing.
//
// So this needs no parser of its own: an unknown tag comes back literally and a malformed directive falls through to
// the body, which means a SURVIVOR in the rendered output IS the error, already located. A schema restating the grammar
// could drift from what the matchers actually decide; a survivor cannot.

import { TAKES } from "./data/grammar.js";
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
/** A field the block carried and the template asked for nowhere. */
export const UNREAD = "unread";

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
    traced = traceView(name, data, dirs, undefined, options);
  } catch (e) {
    return [caught(e)];
  }
  const arrived = typeof data === "string" ? Object.keys(parseData(data, tpl.objectLists)) : [];
  return [
    ...survivors(traced.out, tpl.body),
    ...arrived
      .filter((field) => !traced.read.has(field))
      .map((field) => finding(WARNING, UNREAD, null, `${field} arrived and is read nowhere`)),
  ];
}

/** Whether a report is a REFUSAL rather than a remark, which is the whole of the exit code. */
export const failed = (findings: readonly Finding[]): boolean =>
  findings.some((f) => f.severity === ERROR);

/** One finding as a line, in the shape every compiler has printed since forever: file, line, severity, reason. */
export const report = (name: string, f: Finding): string =>
  `${name}${f.line === null ? "" : `:${f.line}`}: ${f.severity}: ${f.message}`;
