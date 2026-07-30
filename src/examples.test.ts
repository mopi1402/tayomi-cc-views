// The examples/ folder rendered through the real engine: the front door's demo
// cannot rot, because a directive that stops resolving goes red HERE before it
// ships a broken first impression. Width is a fixed NUMBER (first in the
// resolution order), so no env var, probe or terminal can reach the render.

import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "./pipeline.js";
import { ANSI_RE } from "./style.js";

const EXAMPLES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "examples");
const options = { viewsPath: [EXAMPLES], width: 60 };
const render = (msg: string): string => transform(msg, undefined, true, undefined, options);

const lines = (...rows: string[]): string => [...rows, ""].join("\n");

describe("the demo view", () => {
  const BLOCK = lines(
    "```view:demo",
    "service: payments",
    "env: staging",
    "checks:",
    "- ok build the bundle compiles",
    "- warn tests 2 flaky suites skipped",
    "- fail lint 3 errors in api.ts",
    "```"
  );

  it("renders the map's chips for known values", () => {
    const plain = render(BLOCK).replace(ANSI_RE, "");
    expect(plain).toContain(" OK ");
    expect(plain).toContain(" WARN ");
    expect(plain).toContain(" FAIL ");
    expect(plain).not.toContain("${");
  });

  it("names the loop once: the label on the first item, aligned space after", () => {
    const LABEL = "CHECKS"; // what demo.view declares on its @each
    const shown = render(BLOCK).replace(ANSI_RE, "").split("\n");
    const labelled = shown.filter((l) => l.includes(LABEL));
    expect(labelled).toHaveLength(1);
    const first = shown.findIndex((l) => l.includes(LABEL));
    expect(shown[first + 1].indexOf("tests")).toBe(shown[first].indexOf("build"));
  });

  it("draws the box: right badge on the top rule, head as the title row under it", () => {
    const rows = render(BLOCK).replace(ANSI_RE, "").split("\n");
    const top = rows.findIndex((l) => l.startsWith("╭"));
    expect(top).toBeGreaterThanOrEqual(0);
    expect(rows[top]).toContain("staging");
    expect(rows[top + 1]).toContain("payments deploy");
    expect(rows.find((l) => l.startsWith("╰"))).toBeDefined();
  });
});

describe("the decorator demo", () => {
  const MSG = lines("@{view:table}", "| | |", "| --- | --- |", "| Status | all green |");

  it("dresses the plain table, decorator line and furniture gone", () => {
    const out = render(MSG);
    expect(out).not.toContain("@{view:");
    expect(out).not.toContain("|");
    const plain = out.replace(ANSI_RE, "");
    expect(plain).toContain("Status");
    expect(plain).toContain("all green");
    expect(out).not.toBe(MSG); // rendered, not fail-opened
  });
});
