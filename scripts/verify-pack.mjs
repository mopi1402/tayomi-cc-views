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
/** What this package SAYS it is, which the welcome's badge has to agree with once drawn. */
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
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

  // 2. The files contract: the health check ships, and so does the ONE doc with a
  // runtime contract, the cheatsheet an agent reads from node_modules to write a
  // template. The reference docs stay at documentation scope and must not leak.
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
  if (!listing.includes("package/views/columns.view")) {
    fail("views/columns.view is not in the tarball");
  }
  if (!listing.includes("package/views/quote.view")) {
    fail("views/quote.view is not in the tarball");
  }
  if (!listing.includes("package/views/lines.view")) {
    fail("views/lines.view is not in the tarball");
  }
  if (!listing.includes("package/views/hr.view")) {
    fail("views/hr.view is not in the tarball");
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
  // The GRAMMAR, read by the write-view skill at its step 2. That skill travels by the marketplace
  // and never inside this tarball, so the only copy it can open in someone else's project is the one
  // installed there. It does not double the catalogue asserted just below: `dict` answers what THIS
  // install resolves, this page answers how to write it. Falling out of the whitelist is silent:
  // every render keeps working and only the writing of a NEW view degrades, in someone else's project.
  const CHEATSHEET = "package/docs/CHEATSHEET.md";
  if (!listing.includes(CHEATSHEET)) {
    fail("docs/CHEATSHEET.md, the grammar the write-view skill reads, is not in the tarball");
  }
  // The cheatsheet's machine half, and it falls out of the whitelist just as silently: every render
  // keeps working, and only an agent trying to LEARN the language in someone else's project comes up
  // empty. Asserted positively here because `files` is what decides it, and nothing else would say.
  if (!listing.includes("package/agent/catalogue.json")) {
    fail("agent/catalogue.json, the language an agent reads, is not in the tarball");
  }
  // docs/ stays documentation scope and the cheatsheet is its ONE exception, so the ban is
  // written per ENTRY rather than on the directory: banning the prefix is no longer possible
  // now that something legitimate lives under it, and a reference doc added to the whitelist
  // by accident would otherwise ride in unseen.
  const strayDocs = listing
    .split("\n")
    .filter((f) => f.startsWith("package/docs/") && f !== CHEATSHEET && !f.endsWith("/"));
  if (strayDocs.length > 0) {
    fail(`documentation leaked into the tarball: ${strayDocs.join(", ")}`);
  }
  for (const dir of ["package/examples/", "package/src/"]) {
    if (listing.includes(dir)) fail(`${dir} leaked into the tarball`);
  }
  // The skill is the near-miss of the cheatsheet, and the two are told apart by HOW they are
  // reached. The cheatsheet ships because an agent resolves it BY PATH through node_modules; a
  // skill is discovered by convention, under .claude/skills/ or through the plugin manifest, so a
  // copy in node_modules is found by nobody. It would be weight with no reader, and worse, a second
  // copy free to drift from the one the marketplace actually installs.
  if (listing.includes("package/skills/")) {
    fail("skills/ leaked into the tarball, where nothing discovers it: it installs from the repo");
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
  // The badge names the engine AND its version, and the number is a copy in a file that cannot
  // import it. Read off the SCREEN drawn by the installed tarball, so it answers for the whole
  // chain at once: sync-version wrote it, the whitelist shipped it, and this box is the one place
  // a user can tell which of two engines drew their message.
  const badge = `${pkg.name} v${pkg.version}`;
  if (!widePlain.includes(badge)) fail(`the box does not name "${badge}", so its version is stale`);
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

  // 8. The OTHER bin, through the shim an adopter actually types. `dict` is the one
  // command that makes the whole install answer at once: the binary shipped and is
  // executable, the `bin` mapping resolved, and the engine resolved its own bundled
  // views from inside node_modules with no plugin root and no CC_VIEWS_PATH to help it.
  // A `files` edit dropping either the bin or the catalogue lands here.
  const CLI = "cc-views";
  const shim = path.join(proj, "node_modules", ".bin", CLI);
  if (!fs.existsSync(shim)) fail(`the ${CLI} bin was not linked into node_modules/.bin`);
  const cliEnv = { ...process.env };
  delete cliEnv.CLAUDE_PLUGIN_ROOT;
  delete cliEnv.CC_VIEWS_PATH;
  const dict = spawnSync(shim, ["dict"], { cwd: proj, env: cliEnv, encoding: "utf8" });
  if (dict.status !== 0) fail(`${CLI} dict exited ${dict.status}: ${dict.stderr}`);
  let published;
  try {
    published = JSON.parse(dict.stdout);
  } catch {
    fail(`${CLI} dict emitted no JSON (stdout: ${JSON.stringify(dict.stdout.slice(0, 200))})`);
  }
  // The health check is the one view that must resolve from an install, so it is the one
  // named here: a dump listing directives but no view means the search path came up empty.
  if (!published.directives?.length) fail(`${CLI} dict published no directive`);
  if (!published.views?.some((v) => v.name === "welcome")) {
    fail(`${CLI} dict resolved no welcome view from the installed package`);
  }

  console.log(wide);
  console.log(narrow);
  console.log(render(NARROW, `@{view:banner}\n> [!WARNING]\n> ${BODY}\n\n`, "show"));
  console.log(`verify-pack: PASS (${tgzName}, installed and rendered at ${WIDE} and ${NARROW})`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
