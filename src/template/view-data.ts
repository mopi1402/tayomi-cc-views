// The parser for the flat, line-oriented data format the view blocks carry.
//
// It lives in its OWN module, imported by every reader of the format, because it
// has TWO readers with opposite constraints and they must never disagree:
//   - the render engine (template/render.ts), which draws the block;
//   - a host's judge of the same block (a gate hook), which never draws it.
//
// The judge cannot import the host's hook edge to reuse its parse: an edge module
// ends in a main()-guard which is TRUE inside a bundle, so bundling it into another
// hook runs two main() in one process and steals stdin (the exact failure of commit
// 249da20, in the host this engine was extracted from). The first answer to that
// trap was to re-implement the parse inside the gate, twelve lines
// handling scalars only. That duplicate then DIVERGED, and the divergence was a
// real bug: a cause written as a list rendered correctly on screen while the gate
// read it as an empty field and sent the turn back for a missing cause. Extraction
// is what closes that class, since a shared parser cannot diverge from itself,
// whereas a duplicate stays correct only as long as someone remembers it exists.
//
// The blocks carry human prose (commit messages, file paths, `code` spans) that a
// RECURSIVE format like YAML chokes on: a ": " inside a value reads as a nested
// mapping, a leading backtick is a reserved char. So we do NOT use a recursive
// parser. The block is a flat, line-oriented format whose values are OPAQUE to end
// of line, so colons, backticks and brackets are just text. The parser is TOTAL:
// it never throws, so a render never blanks on content.
//
//   "key: value"  -> scalar field, value = the rest of the line, verbatim
//   "key:"        -> opens a list field named key
//   "- item"      -> appends an item to the current list
//   anything else -> ignored (keeps the parser total)
//
// For a list declared as an object list (via the view's `@fields` directive), each
// "- item" is split into the declared fields: every leading field takes a single
// whitespace-delimited token, the LAST field takes the remaining text (opaque).
// Leading fields are ids/enums (no spaces), the last is the prose, so the split is
// unambiguous and cannot fail.
export type ObjectLists = Record<string, string[]>;

function splitFields(item: string, fields: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  let rest = item;
  for (let i = 0; i < fields.length - 1; i++) {
    const m = rest.match(/^(\S+)[ \t]+([\s\S]*)$/);
    if (m) {
      obj[fields[i]] = m[1];
      rest = m[2];
    } else {
      obj[fields[i]] = rest;
      rest = "";
    }
  }
  obj[fields[fields.length - 1]] = rest;
  return obj;
}

export function parseData(
  text: string,
  objectLists: ObjectLists = {}
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  let list: unknown[] | null = null;
  let listFields: string[] | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    const item = line.match(/^[ \t]*-[ \t]+(.*)$/);
    if (item && list) {
      list.push(listFields ? splitFields(item[1], listFields) : item[1]);
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w-]*):[ \t]?(.*)$/);
    if (kv) {
      const [, key, val] = kv;
      if (val === "") {
        list = [];
        listFields = objectLists[key] ?? null;
        data[key] = list;
      } else {
        data[key] = val;
        list = null;
        listFields = null;
      }
    }
    // an unrecognised line is ignored: the parser must never throw
  }
  return data;
}
