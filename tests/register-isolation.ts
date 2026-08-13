// Every vitest worker elects in a register of its OWN. Without this, any test crossing the hook edge announced to the
// machine-wide register, and a checkout ahead of the installed engines left a ghost that won every election for an
// hour: real sessions falling back to prose because a test suite ran.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ENGINES_DIR_ENV } from "../src/data/markup.js";

process.env[ENGINES_DIR_ENV] = fs.mkdtempSync(path.join(os.tmpdir(), "cc-views-register-"));
