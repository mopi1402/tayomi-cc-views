// What a message CARRIES, read without drawing any of it: every view zone of both carriers, name and data, in the
// order they were written. It exists for a host's GATE, which must read the very zones the engine renders.
//
// Its LIMIT is the template: nothing here loads one, so a list arrives UNSPLIT (`@fields` is the template's business)
// and a zone naming a view that exists nowhere is reported like any other.

import { decoratedZones } from "./decorator.js";
import { fenceAt, fenceSpans } from "./fences.js";
import { BLOCK_RE } from "./scan.js";
import { CRLF, NL } from "../data/markup.js";
import { namedFields, parseData } from "../template/view-data.js";

/** One zone: the view it names, and the fields its carrier read. */
export interface ViewZone {
  view: string;
  data: Record<string, unknown>;
}

/** Every view zone a message carries, in the order it was written. Total: a message carrying none yields none. */
export function viewZones(text: string): ViewZone[] {
  // Flattened exactly as the pipeline flattens at ITS entry: two readers of one message must read the same bytes, or
  // the gate and the screen part on every CRLF transcript.
  const flat = text.split(CRLF).join(NL);
  const fences = fenceSpans(flat);
  const found: { at: number; zone: ViewZone }[] = [];
  for (const m of flat.matchAll(BLOCK_RE)) {
    // A block quoted inside an ordinary fence is an EXAMPLE, exactly as the pipeline reads it. Its own fence is the
    // one span it may be inside.
    const fence = fenceAt(fences, m.index);
    if (fence !== undefined && !fence.carrier) continue;
    found.push({ at: m.index, zone: { view: m[1], data: parseData(m[2]) } });
  }
  for (const zone of decoratedZones(flat)) {
    // The SAME fold a render does, minus what only a template knows: named fields, `rows` and `head` still standing.
    // The payload arrives as WRITTEN, so a gate compares the words an author typed, never a styled cell.
    found.push({ at: zone.at, zone: { view: zone.view, data: namedFields(zone.data) } });
  }
  // Both carriers measure offsets over the same text, so ONE order can be put back: the order the message wrote.
  return found.sort((a, b) => a.at - b.at).map((entry) => entry.zone);
}
