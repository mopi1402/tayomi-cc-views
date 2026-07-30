// Wrapping a rendered line to a column limit.
//
// It happens on ATOMS rather than characters, because a line carries markup that
// costs no column: a {{tag}} is opaque and zero-width, a backtick delimits a code
// span and is consumed downstream. Splitting a line as a plain string would count
// that markup as text and, worse, could cut a tag or a span in half.

import { TAG_AT, isTag } from "../style.js";
import { HANG_MARK } from "./marks.js";
import { printedWidth } from "./measure.js";
import { clusterMap, displayWidth } from "./width.js";

type Atom = { s: string; w: number; space: boolean; tick: boolean };

function atomize(text: string): Atom[] {
  const atoms: Atom[] = [];
  // One atom per GRAPHEME CLUSTER, not per code unit. Two reasons, and the first
  // is the one that reaches the screen: an atom of one code unit lets the greedy
  // fill below cut a surrogate pair or a joined sequence in half, which prints a
  // broken glyph. The second is arithmetic: a per-unit atom is w: 1 whatever it
  // draws, so a wrapped line inherits the same miscount as an unwrapped one.
  const clusters = clusterMap(text);
  let i = 0;
  while (i < text.length) {
    TAG_AT.lastIndex = i;
    const m = TAG_AT.exec(text);
    if (m && isTag(m[1])) {
      atoms.push({ s: m[0], w: 0, space: false, tick: false });
      i = TAG_AT.lastIndex;
      continue;
    }
    // A tag is pure ASCII, so the index it leaves behind is a cluster boundary;
    // the fallback keeps the walk total if it ever were not.
    const g = clusters.get(i) ?? text[i];
    atoms.push({
      s: g,
      w: g === "`" ? 0 : displayWidth(g),
      space: g === " ",
      tick: g === "`",
    });
    i += g.length;
  }
  return atoms;
}

// A continuation line keeps the section's gutter bar and blanks its label: the
// bar is what makes the wrapped remainder read as the same section, and the blank
// label is what keeps the text in one column. Tags and the bar survive; every
// other visible character of the prefix becomes a space.
const PREFIX_RE = /^([\s\S]*▎(?:\{\{\/\}\})?[ ]?)([\s\S]*)$/;

function blankPrefix(prefix: string): string {
  return prefix
    .split(/(\{\{(?:\/|\w+)\}\}|▎)/)
    .map((part) =>
      part === "▎" || /^\{\{(?:\/|\w+)\}\}$/.test(part)
        ? part
        : " ".repeat(displayWidth(part))
    )
    .join("");
}

export function wrapLine(line: string, limit: number): string[] {
  if (limit < 8 || printedWidth(line) <= limit) return [line];
  // An explicit hanging boundary wins over the inferred one: a bullet declared on
  // the @each sits AFTER the gutter bar, so PREFIX_RE alone would leave it inside
  // the wrapped text and print it again on every continuation row.
  const hang = line.indexOf(HANG_MARK);
  const m = hang === -1 ? line.match(PREFIX_RE) : null;
  const prefix =
    hang !== -1
      ? line.slice(0, hang)
      : m
        ? m[1]
        : (line.match(/^[ \t]*/) as RegExpMatchArray)[0];
  const rest =
    hang !== -1 ? line.slice(hang + HANG_MARK.length) : m ? m[2] : line.slice(prefix.length);
  const cont = hang !== -1 || m ? blankPrefix(prefix) : prefix;
  const width = limit - printedWidth(prefix);
  if (width < 4) return [line]; // a prefix that wide leaves nothing to wrap into
  // Greedy fill, breaking at the last space of the line and hard-splitting a
  // token that is wider than the whole column (a long path, which must break
  // somewhere rather than push the border out).
  const groups: Atom[][] = [];
  let cur: Atom[] = [];
  let w = 0;
  for (const a of atomize(rest)) {
    if (w + a.w > width && cur.length > 0) {
      let cut = -1;
      for (let i = cur.length - 1; i >= 0; i--) {
        if (cur[i].space) {
          cut = i;
          break;
        }
      }
      groups.push(cut >= 0 ? cur.slice(0, cut) : cur);
      cur = cut >= 0 ? cur.slice(cut + 1) : [];
      w = cur.reduce((n, x) => n + x.w, 0);
    }
    cur.push(a);
    w += a.w;
  }
  if (cur.length > 0) groups.push(cur);
  // A code span cut in two is closed and reopened, otherwise the orphan backtick
  // reaches the screen and neither half renders as code.
  const out: string[] = [];
  let open = false;
  groups.forEach((atoms, idx) => {
    let s = open ? "`" : "";
    let o = open;
    for (const a of atoms) {
      s += a.s;
      if (a.tick) o = !o;
    }
    if (o) s += "`";
    out.push((idx === 0 ? prefix : cont) + s);
    open = o;
  });
  return out;
}
