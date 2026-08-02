// The pre-publish gate: prove the PACKED package works before npm ever sees it.
//
// What a unit test cannot catch lives here: the "files" whitelist (a view missing
// from the tarball), the bin wiring, and the bundled resolution as an INSTALLED
// copy sees it. The scenario is the README's minimal setup, end to end: pack the
// tarball, install it in a throwaway project, feed the installed bin one real
// MessageDisplay payload carrying the welcome block, and require the box.
//
// Run via `pnpm verify:pack` (which builds first); wired into prepublishOnly.

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const fail = (msg) => {
  console.error(`\nverify-pack: FAIL, ${msg}`);
  process.exit(1);
};

const work = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-verify-"));
try {
  // 1. The real tarball, exactly what `npm publish` would upload.
  execSync(`npm pack --pack-destination "${work}"`, { stdio: "pipe" });
  const tgzName = fs.readdirSync(work).find((f) => f.endsWith(".tgz"));
  if (!tgzName) fail("npm pack produced no tarball");
  const tgz = path.join(work, tgzName);

  // 2. The files contract: the health check ships, the documentation does not.
  // The art the welcome's @aside names ships with it: the whitelist carries the
  // whole views/ directory, so what this really catches is an art file left
  // OUTSIDE it, which would leave the installed welcome with no second column.
  const listing = execSync(`tar -tzf "${tgz}"`, { encoding: "utf8" });
  if (!listing.includes("package/views/welcome.view")) {
    fail("views/welcome.view is not in the tarball");
  }
  if (!listing.includes("package/views/tayo.view")) {
    fail("views/tayo.view, the art the welcome's @aside names, is not in the tarball");
  }
  if (!listing.includes("package/views/banner.view")) {
    fail("views/banner.view is not in the tarball");
  }
  // ONE file for every kind, which is what the marker and the @text table bought. A
  // banner.<kind>.view left behind is the design quietly coming undone, and the listing
  // is the only place that can see it: the engine would resolve such a file happily.
  const typedBanner = listing
    .split("\n")
    .filter((f) => f.startsWith("package/views/banner.") && f !== "package/views/banner.view");
  if (typedBanner.length > 0) {
    fail(`a typed banner shipped: ${typedBanner.join(", ")}`);
  }
  for (const dir of ["package/docs/", "package/examples/", "package/src/"]) {
    if (listing.includes(dir)) fail(`${dir} leaked into the tarball`);
  }

  // 3. A throwaway project installs the tarball, the way an adopter would.
  const proj = path.join(work, "project");
  fs.mkdirSync(proj);
  fs.writeFileSync(
    path.join(proj, "package.json"),
    JSON.stringify({ name: "verify-pack-project", private: true }, null, 2)
  );
  execSync(`npm install --no-audit --no-fund "${tgz}"`, { cwd: proj, stdio: "pipe" });

  // 4. One real MessageDisplay payload through the INSTALLED bin.
  const bin = path.join(proj, "node_modules", "@tayomi", "cc-views", "dist", "bin", "messagedisplay.js");
  const block = [
    "```view:welcome",
    "title: Welcome!",
    "message: If this text sits in a coloured box, the hook is wired and working.",
    "demo:",
    "- pass packed, installed and resolved",
    "- warn straight from the tarball",
    "- fail nothing failed, palette demo",
    "```",
    "",
  ].join("\n");
  // TWO widths, because the welcome's @aside behaves differently at each and both
  // behaviours ship. WIDE fits the art beside the sections; NARROW is the width
  // this harness has always used, and at 74 the region would leave the main flow
  // 37 columns, under the floor, so the column is dropped. Moving the narrow one
  // would have hidden the drop; adding a wide one proves the art actually composes.
  const WIDE = 110;
  const NARROW = 74;
  const render = (columns, text = block, id = String(columns)) => {
    const payload = JSON.stringify({
      message_id: `verify-pack-${id}`,
      index: 0,
      final: true,
      cwd: proj,
      delta: text,
    });
    const env = { ...process.env, CC_VIEWS_WIDTH: String(columns) };
    delete env.CLAUDE_PLUGIN_ROOT; // the adopter case: no plugin root anywhere
    delete env.CC_VIEWS_PATH;
    const run = spawnSync("node", [bin], { input: payload, cwd: proj, env, encoding: "utf8" });
    if (run.status !== 0) fail(`the installed bin exited ${run.status} at ${columns}: ${run.stderr}`);
    let shown;
    try {
      shown = JSON.parse(run.stdout).hookSpecificOutput.displayContent;
    } catch {
      fail(`the bin emitted no envelope (stdout: ${JSON.stringify(run.stdout.slice(0, 200))})`);
    }
    return shown;
  };

  // 5. The verdict is the screen: a framed, dressed box, no raw fence left.
  const SECTIONS = ["LEARN", "CREATE", "ASK", "EXPLORE"];
  const ART_CELL = /[▀▄]/;
  const wide = render(WIDE);
  const widePlain = wide.replace(ANSI_RE, "");
  if (!widePlain.includes("╭")) fail("no box frame in the output");
  if (!widePlain.includes("Welcome!")) fail("the title did not render");
  if (widePlain.includes("```")) fail("the raw fence reached the screen");
  for (const label of SECTIONS) {
    if (!widePlain.includes(label)) fail(`the ${label} section is missing at ${WIDE} columns`);
  }
  // One line carrying BOTH an art cell and a section label is the whole claim of
  // the region: the two columns are on the same row, not stacked.
  const composed = widePlain
    .split("\n")
    .filter((l) => ART_CELL.test(l) && SECTIONS.some((s) => l.includes(s)));
  if (composed.length === 0) {
    fail(`no line carries both an art cell and a section label at ${WIDE} columns`);
  }

  // 6. The narrow path, at the width this harness has always run: the sections
  // survive whole and the decoration is gone rather than shredded across them.
  const narrow = render(NARROW);
  const narrowPlain = narrow.replace(ANSI_RE, "");
  if (!narrowPlain.includes("Welcome!")) fail(`the title did not render at ${NARROW} columns`);
  for (const label of SECTIONS) {
    if (!narrowPlain.includes(label)) fail(`the ${label} section is missing at ${NARROW} columns`);
  }
  if (ART_CELL.test(narrowPlain)) fail(`the art was not dropped at ${NARROW} columns`);

  // 7. The banner, both ways in, from the INSTALLED tarball. The claim being gated is
  // that a consumer who has created NOTHING can write a marked quote and get a dressed
  // band: the word comes out of the packaged @text table, so a table that failed to ship
  // (or a template that stopped reading it) shows up here and nowhere else.
  // The body carries a CODE SPAN on purpose: banner.view draws its band as a filled
  // chip, so a span inside it is a span the engine inserted inside a style the template
  // opened, and its terminator has to hand the band back. Rendered from the installed
  // tarball, this is the one place that gate is spoken end to end.
  /** The two C0 codes a rendered screen is allowed to carry: the row break and ANSI's own. */
  const ON_SCREEN_C0 = new Set(["\n", "\x1b"]);
  const SPAN = "pnpm verify";
  const BODY = `two flaky suites, \`${SPAN}\` is blocked`;
  const SHOWN_BODY = BODY.split("`").join("");
  const WARNING_WORD = "⚠ WARNING";
  const bandOf = (text, id) => {
    const drawn = render(NARROW, text, id);
    // A reserved control code on screen is a mark the render failed to resolve. It
    // prints nothing, so nothing else here can see it. Stated as the whole C0 range
    // minus what legitimately reaches a terminal, rather than the codes this package
    // reserves today: the list is not a public export, so this script cannot import it,
    // and a range needs no edit the day the engine claims one more.
    for (const ch of drawn) {
      if (ch < " " && !ON_SCREEN_C0.has(ch)) fail(`a control mark reached the screen (${id})`);
    }
    const shown = drawn.replace(ANSI_RE, "");
    if (shown.includes("@{view:")) fail(`the decorator line reached the screen (${id})`);
    if (shown.includes(">")) fail(`the quote's markup reached the screen (${id})`);
    if (!shown.includes(WARNING_WORD)) fail(`the packaged kinds table did not answer (${id})`);
    if (!shown.includes(SHOWN_BODY)) fail(`the band lost its content (${id})`);
    if (shown.includes("`")) fail(`the code span's delimiters reached the screen (${id})`);
    // The band is a chip, so what follows the span must be its fill again and not a bare
    // reset: cleared there, the rest of the sentence prints outside the band.
    if (!drawn.includes(`${SPAN}\x1b[0m\x1b[1;30;43m`)) {
      fail(`the band did not resume after its code span (${id})`);
    }
    return shown.trim();
  };
  const quoted = bandOf(`@{view:banner}\n> [!WARNING]\n> ${BODY}\n\n`, "quote");
  const fenced = bandOf(
    ["```view:banner", "type: warning", `content: ${BODY}`, "```", ""].join("\n"),
    "fence"
  );
  // The two ways in differ in what the AUTHOR types and in nothing else.
  if (quoted !== fenced) fail("the quote and the fenced block drew two different bands");
  if (quoted.split("\n").length !== 1) fail("the band did not stay one line");

  console.log(wide);
  console.log(narrow);
  console.log(render(NARROW, `@{view:banner}\n> [!WARNING]\n> ${BODY}\n\n`, "show"));
  console.log(`verify-pack: PASS (${tgzName}, installed and rendered at ${WIDE} and ${NARROW})`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
