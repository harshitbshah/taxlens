import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { forgetInvalidApiKey } from "./api-key-policy";

describe("HM-7: an invalid-key error only forgets the key outside hosted mode", () => {
  const originalDir = process.env.TAX_UI_DATA_DIR;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "taxlens-keypolicy-"));
    process.env.TAX_UI_DATA_DIR = dir;
    await writeFile(path.join(dir, ".env"), "ANTHROPIC_API_KEY=sk-ant-dummy\n");
    process.env.ANTHROPIC_API_KEY = "sk-ant-dummy";
  });

  afterEach(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.TAX_UI_DATA_DIR = originalDir;
    await rm(dir, { recursive: true, force: true });
  });

  test("hosted: the key stays in memory and on disk", async () => {
    await forgetInvalidApiKey(true);
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-dummy");
    expect(await Bun.file(path.join(dir, ".env")).text()).toContain("sk-ant-dummy");
  });

  test("local: the key is removed so the UI prompts for a new one", async () => {
    await forgetInvalidApiKey(false);
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(await Bun.file(path.join(dir, ".env")).exists()).toBe(false);
  });
});

describe("HM-7: source-level guard", () => {
  test("server.ts never calls removeApiKey() directly", () => {
    const serverSrc = readFileSync(path.join(import.meta.dir, "..", "server.ts"), "utf-8");
    expect(serverSrc).not.toMatch(/\bremoveApiKey\(/);
  });
});
