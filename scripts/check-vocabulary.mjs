// One shape, one constant: a word of the .view language is spelled in src/data/ and nowhere else.
//
// The rule is a style rule right up until it is a correctness one. The suite that drives every directive reads the
// vocabulary itself to know what "every" means, so a word typed straight into a matcher is invisible to it and gets no
// case. This is the promise that the vocabulary is COMPLETE, checked rather than remembered.
//
// Run via `pnpm check:vocabulary`, wired into `pnpm verify`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "src";
const SOURCE_EXT = ".ts";
const TEST_EXT = ".test.ts";

// Where a token is spelled ON PURPOSE, and the only place: markup.ts holds the message
// shapes (the fence, the decorator token), language.ts the words a template author
// types. Excluded by DIRECTORY rather than by filename, since a third vocabulary would
// land here and nowhere else.
const VOCABULARY_DIR = path.join(SRC, "data");

// A TEST spelling the word out is the opposite of a defect: a suite sharing the constant
// with the matcher it drives cannot catch a drift in it, so the fixtures here are meant
// to be typed by hand. The rule is about the ENGINE composing its matchers.
const spelledByHand = (file) => file.endsWith(TEST_EXT) || file.startsWith(VOCABULARY_DIR);

/**
 * The source with every comment blanked out, newlines kept so a line number still
 * points where a reader looks.
 *
 * String-aware, because `//` inside a literal is not a comment. Regex literals are
 * scanned as ordinary code, which is what we want: a directive word hidden inside one
 * is exactly as invisible to the vocabulary as a word inside a string.
 */
function stripComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < src.length && src[i] !== quote) {
        // An escape consumes what follows it, or a literal backslash before the closing
        // quote would end the string one character early.
        if (src[i] === "\\") {
          out += src[i];
          i++;
        }
        if (i < src.length) {
          out += src[i];
          i++;
        }
      }
      out += quote;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** An `@` opening a word, wherever it sits once the comments are gone. */
const AT_WORD_RE = /@\w[\w-]*(\/)?/g;

const walk = (dir) =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return walk(rel);
    return e.isFile() && rel.endsWith(SOURCE_EXT) ? [rel] : [];
  });

const failures = [];
for (const file of walk(SRC)) {
  if (spelledByHand(file)) continue;
  const code = stripComments(fs.readFileSync(path.join(ROOT, file), "utf8"));
  code.split("\n").forEach((line, n) => {
    for (const m of line.matchAll(AT_WORD_RE)) {
      // A SCOPED PACKAGE is the one other thing an `@` opens in this language, and its
      // slash is what tells them apart: `@tayomi/utils` is a module specifier, `@each`
      // is a word of the .view language that belongs in src/data/.
      if (m[1] !== undefined) continue;
      failures.push(`${file}:${n + 1}  ${m[0]}   ${line.trim()}`);
    }
  });
}

if (failures.length) {
  console.error(
    `\ncheck-vocabulary: a word of the language spelled outside ${VOCABULARY_DIR}/.` +
      `\nDeclare it there and compose the matcher from it, or the sweep that drives` +
      `\nevery directive (render.test.ts) can never know this one exists:\n`
  );
  for (const f of failures) console.error(`  ${f}`);
  console.error(`\ncheck-vocabulary: FAIL (${failures.length})`);
  process.exit(1);
}

console.log("check-vocabulary: PASS (every word of the language comes from src/data/)");
