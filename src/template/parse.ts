// The .view language, parse half: template text in, a Template struct out.
//
// Pure text-to-struct, no disk and no data: the declarations a template makes about
// itself (its enum tables, its object-list fields, the width of its label column)
// are all resolvable before a single field value is known.

import { printedWidth } from "../layout/measure.js";
import type { Maps } from "../scope.js";
import type { ObjectLists } from "./view-data.js";

export interface Template {
  // enum-to-style tables, declared with @map <name> <val>=<tag> ...
  maps: Maps;
  // the lists whose items split into fields, declared with @fields <list> a b c
  objectLists: ObjectLists;
  // every remaining line, in order: the part that renders
  body: string[];
  // The label column is as wide as the WIDEST label the template declares, so a
  // section can be named REMINDER without every other section's bar shifting by
  // hand. It is computed here because a template line cannot see the others.
  labelWidth: number;
}

export function parseTemplate(text: string): Template {
  const tmpl = text.replace(/\r/g, "");
  const maps: Maps = {};
  const objectLists: ObjectLists = {};
  const body: string[] = [];
  for (const line of tmpl.split("\n")) {
    if (/^\s*#/.test(line)) continue; // template comment
    const mm = line.match(/^@map\s+(\S+)\s+(.*)$/);
    const ff = line.match(/^@fields\s+(\S+)\s+(.*)$/);
    if (mm) {
      const map: Record<string, string> = {};
      for (const pair of mm[2].trim().split(/\s+/)) {
        const [k, v] = pair.split("=");
        if (k && v) map[k] = v;
      }
      maps[mm[1]] = map;
    } else if (ff) {
      objectLists[ff[1]] = ff[2].trim().split(/\s+/);
    } else {
      body.push(line);
    }
  }
  const labelWidth = [...tmpl.matchAll(/^@each\s+\S+\s+label="([^"]*)"/gm)].reduce(
    (n, m) => Math.max(n, printedWidth(m[1])),
    0
  );
  return { maps, objectLists, body, labelWidth };
}
