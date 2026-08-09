// What the HOST supplies to the engine: behaviour, never configuration (that is options.ts). At the ROOT because BOTH
// carriers answer to it, and a type the carrier imported from the pipeline would close a cycle in a chain that has none.

import { renderTags } from "./style.js";
import type { Scope } from "./scope.js";

/** Every member is optional: with no host at all the engine still renders every zone from the message alone. */
export interface DisplayHost {
  /**
   * Extra scope for facts the model did not write, for one zone of one message. The data is what the CARRIER read,
   * parsed and never raw payload text, with lists UNSPLIT: `@fields` is the template's business and no carrier's.
   */
  inject?(view: string, data: Record<string, unknown>, cwd?: string): Scope | undefined;
  /** The ONE view that must never fail open to its raw markdown, on either carrier, and the line shown in its place. */
  strict?: { view: string; failedLine: string };
  /**
   * The strict view's outcome, reported ONCE per message and only on the final delta: transform() recomputes over the
   * whole message on every delta, so ungated it would fire per chunk.
   */
  onRendered?(ok: boolean, error: string | null): void;
}

/** That outcome as one value, so the pass that DECIDED it and the pass that reports it cannot spell the pair apart. */
export interface Outcome {
  ok: boolean;
  error: string | null;
}

/** The success, spelled once for both carriers. */
export function okOutcome(): Outcome {
  return { ok: true, error: null };
}

/** The failure, from a throw or from a reason already in words: ONE spelling of how an error becomes the report. */
export function failedOutcome(reason: unknown): Outcome {
  return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
}

/** The line drawn in the strict view's place. A host is a program, not a message: it may spend the palette. */
export function strictLine(strict: { failedLine: string }): string {
  return renderTags(strict.failedLine);
}
