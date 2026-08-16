// The README's gallery: every block is rendered by the REAL engine, then turned into an SVG.
//
// Manual, never part of `pnpm verify`. It leaves the repository (a font is downloaded) and it
// DRAWS, so its verdict is a screen, not an assertion.
//
//   pnpm gen:gallery
//   TERM2SVG=../term2svg/dist/bin/term2svg.js pnpm gen:gallery
//
// GitHub renders no ANSI: a block's render is necessarily an image, and an SVG of vectorised
// glyphs stays sharp when GitHub scales it to its column.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
const FIXTURES = path.join(HERE, "gallery");
const OUT = path.join(REPO, "docs", "images", "gallery");

// Settled on 2026-08-15: a GitHub code block truncates around the 91st character on a wide
// screen, so 80 fits under it with room to spare and stays readable on a phone.
const WIDTH = 80;

// term2svg supplies no font, deliberately: this one is CHOSEN here, under a licence that may be
// redistributed.
//
// A DIRECTORY and not a file: term2svg reads a directory's faces off their OS/2 tables, and with the
// regular alone it falls back to it for every one of them, so `**bold**` draws no heavier than plain
// text. Fetched once per machine, into the OS temp dir: a font is not this repository's to carry.
const FONT_URLS = [
  "https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-Regular.ttf",
  "https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-Bold.ttf",
];

async function faceDir(urls) {
  const dir = path.join(os.tmpdir(), "cc-views-gallery-fonts");
  fs.mkdirSync(dir, { recursive: true });
  for (const url of urls) {
    const file = path.join(dir, path.basename(new URL(url).pathname));
    if (fs.existsSync(file)) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`font ${url}: ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return dir;
}

const FONT = process.env.GALLERY_FONT ?? (await faceDir(FONT_URLS));

// term2svg lives its own life in its own package: cc-views does not install it, it calls it.
const TERM2SVG = process.env.TERM2SVG ?? "@tayomi/term2svg";
const command = TERM2SVG.endsWith(".js") ? ["node", TERM2SVG] : ["npx", "--yes", TERM2SVG];

// The gallery must be drawn by THIS repository's engine. Without this it would stand aside for a
// newer installed copy, and the image would show what we did not build.
process.env.CC_VIEWS_NO_YIELD = "1";
// The engine register is a side effect: generating images has nothing to write there, and a
// directory of its own proves it rather than hoping for it.
process.env.CC_VIEWS_ENGINES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-gallery-"));
// No theme NAMED here, deliberately: the gallery must show what an unasked diagram draws, which is
// the neutral one, shades of ours and every colour the source declares for itself.
delete process.env.CC_VIEWS_MERMAID_THEME;

const { handleMessageDisplay } = await import(`file://${path.join(REPO, "dist", "index.js")}`);

/** A block crosses the engine exactly as a Claude Code message would. */
async function toAnsi(block, id) {
  const envelope = await handleMessageDisplay(
    { message_id: `gallery-${id}`, index: 0, delta: block, final: true },
    undefined,
    { viewsPath: [path.join(REPO, "views")], width: WIDTH },
  );
  if (envelope === null) throw new Error("the engine rendered nothing");
  return JSON.parse(envelope).hookSpecificOutput.displayContent;
}

const fixtures = fs
  .readdirSync(FIXTURES)
  .filter((name) => name.endsWith(".md"))
  .sort();

if (fixtures.length === 0) {
  process.stderr.write(`no fixture in ${path.relative(REPO, FIXTURES)}\n`);
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

let failed = 0;
for (const fixture of fixtures) {
  const name = fixture.replace(/\.md$/, "");
  const block = fs.readFileSync(path.join(FIXTURES, fixture), "utf8");
  const target = path.join(OUT, `${name}.svg`);

  let ansi;
  try {
    ansi = await toAnsi(block, name);
  } catch (error) {
    process.stderr.write(`${name.padEnd(12)} ENGINE  ${error.message}\n`);
    failed += 1;
    continue;
  }

  const run = spawnSync(command[0], [...command.slice(1), "--font", FONT, "--quiet", "-", target], {
    input: ansi,
    encoding: "utf8",
  });
  if (run.status !== 0) {
    process.stderr.write(`${name.padEnd(12)} TERM2SVG  ${(run.stderr || run.error?.message || "").trim()}\n`);
    failed += 1;
    continue;
  }

  const lines = ansi.split("\n").length;
  const size = (fs.statSync(target).size / 1024).toFixed(1);
  process.stdout.write(`${name.padEnd(12)} ${String(lines).padStart(3)} lines  ${size.padStart(6)} KB\n`);
}

process.stdout.write(`\n${fixtures.length - failed}/${fixtures.length} in ${path.relative(REPO, OUT)}\n`);
process.exit(failed === 0 ? 0 : 1);
