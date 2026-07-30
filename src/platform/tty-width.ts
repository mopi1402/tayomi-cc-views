// The terminal's real width, which this process cannot see.
//
// The box must WRAP its own content, and for that it needs a width it cannot
// measure: this process' stdout is a pipe, never a TTY, and neither the hook's
// stdin nor its environment carries the terminal size (probed 2026-07-26:
// process.stdout.columns undefined, COLUMNS absent, /dev/tty gives ENXIO, no
// controlling terminal). Without a width, a line longer than the terminal is
// wrapped BY THE TERMINAL, at whatever column it likes, which puts the right
// border on the next row and shreds the frame: the box looked correct only as long
// as every line happened to fit.
//
// It is reachable one step further out: the `claude` process itself runs on a real
// tty, so walking the ancestor chain and opening that tty yields the real width
// (215 columns in the author's terminal, where a fixed 100-column ceiling was
// wrapping lines that had plenty of room).
//
// It costs one `ps` spawn, about 25ms, and this hook runs on EVERY streamed delta,
// so the answer is cached in a file with a short TTL. A resize is rare and its only
// cost is one badly wrapped block until the next refresh, whereas paying 25ms per
// delta would be felt on every message.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import tty from "node:tty";
import { DEFAULT_STATE_DIR, writeScratch } from "./scratch.js";
import type { RenderOptions } from "../options.js";

const WIDTH_TTL_MS = 3000;

function probeTerminalWidth(): number | null {
  const out = execFileSync("ps", ["-eo", "pid=,ppid=,tty="], {
    encoding: "utf8",
    timeout: 500,
  });
  const parent = new Map<number, number>();
  const ttyOf = new Map<number, string>();
  for (const line of out.split("\n")) {
    const f = line.trim().split(/\s+/);
    if (f.length < 2) continue;
    parent.set(Number(f[0]), Number(f[1]));
    ttyOf.set(Number(f[0]), f[2] ?? "");
  }
  let pid = process.pid;
  for (let hop = 0; pid > 1 && hop < 12; hop++) {
    const name = ttyOf.get(pid);
    if (name && name !== "??" && name !== "-") {
      let fd: number | null = null;
      try {
        fd = fs.openSync("/dev/" + name, "r");
        const cols = new tty.WriteStream(fd).columns;
        if (cols && cols > 0) return cols;
      } catch {
        // not openable: keep walking outwards
      } finally {
        if (fd != null) {
          try {
            fs.closeSync(fd);
          } catch {
            // already closed by the stream
          }
        }
      }
    }
    pid = parent.get(pid) ?? 0;
  }
  return null;
}

function terminalWidth(stateDir: string): number | null {
  const cache = path.join(stateDir, "tty-width.json");
  try {
    const st = fs.statSync(cache);
    if (Date.now() - st.mtimeMs < WIDTH_TTL_MS) {
      const cached = JSON.parse(fs.readFileSync(cache, "utf8")) as { cols?: number };
      return typeof cached.cols === "number" && cached.cols > 0 ? cached.cols : null;
    }
  } catch {
    // no cache yet, or unreadable: probe
  }
  let cols: number | null = null;
  try {
    cols = probeTerminalWidth();
  } catch {
    cols = null;
  }
  writeScratch(cache, JSON.stringify({ cols }));
  return cols;
}

// The resolution order, most deliberate first. A NUMBER in options.width is a forced
// ceiling written in code, so it wins outright. The env var (options.widthEnv, the
// package default CC_VIEWS_WIDTH) is the operator's forced ceiling, what the render
// oracles use so a verdict never depends on the window they ran in. A FUNCTION in
// options.width is not a ceiling but a width SOURCE: it stands in for the ps-probe
// and its result is treated exactly like probed columns (the margin and the 180
// readability ceiling apply), with null falling through to the probe itself.
//
// Probed columns lose a small margin (the host indents what it prints, and a box
// flush against the last column is one resize away from wrapping) and cap at 180:
// readability, not safety, since a line of prose stops being scannable past it and
// the box never grows beyond its own content anyway. 100 when no terminal is found.
export function maxBoxWidth(options?: RenderOptions): number {
  const w = options?.width;
  if (typeof w === "number") return Math.min(400, Math.max(40, w));
  const forced = Number(process.env[options?.widthEnv ?? "CC_VIEWS_WIDTH"]);
  if (Number.isFinite(forced) && forced > 0) return Math.min(400, Math.max(40, forced));
  let cols: number | null = null;
  if (typeof w === "function") {
    try {
      cols = w();
    } catch {
      cols = null; // a width source is best-effort, like the probe it replaces
    }
  }
  cols = cols ?? terminalWidth(options?.stateDir ?? DEFAULT_STATE_DIR);
  return cols && cols > 0 ? Math.min(180, Math.max(40, cols - 4)) : 100;
}
