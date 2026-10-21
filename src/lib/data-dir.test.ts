import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { homedir, tmpdir } from "os";
import path from "path";

import { saveAnalysisCache } from "./analysis-cache";
import type { CountryServerPlugin } from "./country-registry";
import { saveCountryReturn } from "./country-storage";
import { dataPath, getDataDir } from "./data-dir";
import { saveFilingCosts } from "./filing-costs-cache";
import { saveForecastCache } from "./forecast-cache";
import { saveForecastProfile } from "./forecast-profile";
import { deleteIndiaReturn } from "./india-storage";
import { saveInsightsCache } from "./insights-cache";
import { deleteRetirementAccounts } from "./retirement-accounts";
import { deleteReturn, removeApiKey, saveApiKey } from "./storage";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");

describe("HM-2: test runs are isolated from real data", () => {
  test("data dir resolves under the OS temp dir during tests", () => {
    expect(path.resolve(getDataDir()).startsWith(path.resolve(tmpdir()))).toBe(true);
  });

  // Bun auto-loads the repo's .env, which holds the real Anthropic key. A test that reached the
  // API would bill the user, so the preload strips it; tests that need a key set a dummy one.
  test("the real Anthropic API key is not visible to tests", () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  test.each(["TAXLENS_HOSTED", "TAXLENS_HOSTNAME", "DEMO_MODE", "TAX_UI_STATIC_DIR"])(
    "mode switch %s from the shell or .env is cleared",
    (name) => {
      expect(process.env[name]).toBeUndefined();
    },
  );

  test("data dir is neither the repo root nor $HOME", () => {
    const dir = path.resolve(getDataDir());
    expect(dir).not.toBe(REPO_ROOT);
    expect(dir).not.toBe(path.resolve(homedir()));
  });
});

describe("HM-1: getDataDir / dataPath", () => {
  const original = process.env.TAX_UI_DATA_DIR;

  afterEach(() => {
    process.env.TAX_UI_DATA_DIR = original;
  });

  test("reflects TAX_UI_DATA_DIR changes made after import", () => {
    process.env.TAX_UI_DATA_DIR = "/tmp/hm1-a";
    expect(getDataDir()).toBe("/tmp/hm1-a");
    process.env.TAX_UI_DATA_DIR = "/tmp/hm1-b";
    expect(getDataDir()).toBe("/tmp/hm1-b");
  });

  test("falls back to cwd when TAX_UI_DATA_DIR is empty", () => {
    process.env.TAX_UI_DATA_DIR = "";
    expect(getDataDir()).toBe(process.cwd());
  });

  test("dataPath joins a file name onto the current data dir", () => {
    process.env.TAX_UI_DATA_DIR = "/tmp/hm1-c";
    expect(dataPath(".tax-returns.json")).toBe(path.join("/tmp/hm1-c", ".tax-returns.json"));
  });
});

// Each storage module must pick up a data dir set *after* it was imported. Before HM-1 most
// modules captured the path at load time, which is how tests ended up writing real files.
describe("HM-1: every storage module writes to the data dir current at call time", () => {
  const original = process.env.TAX_UI_DATA_DIR;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "taxlens-hm1-"));
    process.env.TAX_UI_DATA_DIR = dir;
  });

  afterEach(async () => {
    process.env.TAX_UI_DATA_DIR = original;
    await rm(dir, { recursive: true, force: true });
  });

  const expectWritten = (file: string) => expect(existsSync(path.join(dir, file))).toBe(true);

  test("storage: US returns", async () => {
    await deleteReturn(1);
    expectWritten(".tax-returns.json");
  });

  test("storage: API key .env", async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    try {
      await saveApiKey("sk-test-hm1");
      expectWritten(".env");
      await removeApiKey();
    } finally {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  test("india-storage", async () => {
    await deleteIndiaReturn(1);
    expectWritten(".india-tax-returns.json");
  });

  test("country-storage", async () => {
    const plugin = {
      code: "zz",
      storageFile: ".zz-tax-returns.json",
      schema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
      getYear: () => 1,
    } as unknown as CountryServerPlugin;
    await saveCountryReturn(plugin, {});
    expectWritten(".zz-tax-returns.json");
  });

  test("forecast-cache", async () => {
    await saveForecastCache("us", {} as Parameters<typeof saveForecastCache>[1]);
    expectWritten(".forecast-cache.json");
  });

  test("insights-cache", async () => {
    await saveInsightsCache(1, []);
    expectWritten(".insights-cache.json");
  });

  test("analysis-cache", async () => {
    await saveAnalysisCache(1, "us", {} as Parameters<typeof saveAnalysisCache>[2]);
    expectWritten(".analysis-cache.json");
  });

  test("filing-costs-cache", async () => {
    await saveFilingCosts(1, "us", { filing: { amount: 1 } });
    expectWritten(".filing-costs.json");
  });

  test("forecast-profile", async () => {
    await saveForecastProfile("us", {});
    expectWritten(".forecast-profile.json");
  });

  test("retirement-accounts", async () => {
    await deleteRetirementAccounts(1);
    expectWritten(".retirement-accounts.json");
  });
});

describe("HM-1: source-level guard", () => {
  test("no src/lib module captures TAX_UI_DATA_DIR in a module-level constant", () => {
    const libDir = import.meta.dir;
    const offenders = readdirSync(libDir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter((f) =>
        /^const\s+\w+\s*=\s*process\.env\.TAX_UI_DATA_DIR/m.test(
          readFileSync(path.join(libDir, f), "utf-8"),
        ),
      );
    expect(offenders).toEqual([]);
  });

  // hosted-config.ts validates the variable from an env object passed in; it never builds
  // data paths, so the rule is about process.env reads specifically.
  test("only data-dir.ts reads process.env.TAX_UI_DATA_DIR", () => {
    const libDir = import.meta.dir;
    const readers = readdirSync(libDir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter((f) =>
        readFileSync(path.join(libDir, f), "utf-8").includes("process.env.TAX_UI_DATA_DIR"),
      );
    expect(readers).toEqual(["data-dir.ts"]);
  });
});
