// HM-2: loaded via bunfig.toml [test] preload, before any test file imports app modules.
// Forces every storage module into a throwaway directory so a test that forgets to isolate
// itself cannot read or write the real data files in the repo root or $HOME.
// On 2026-10-21 a test without this guard overwrote real ~/.filing-costs.json entries.
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const runDir = mkdtempSync(path.join(tmpdir(), "taxlens-test-run-"));

process.env.TAX_UI_DATA_DIR = runDir;
process.env.TAXLENS_TEST_RUN_DIR = runDir;

// Bun auto-loads the repo's .env (the real Anthropic key) before this preload runs.
// Strip it so no test can make billable API calls; tests that need a key set a dummy one.
delete process.env.ANTHROPIC_API_KEY;

process.on("exit", () => {
  rmSync(runDir, { recursive: true, force: true });
});
