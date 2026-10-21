import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

import { resolveDemoMode } from "./env";

// Simulates the app being opened on a real domain. Before HM-6 any non-localhost hostname was
// treated as the public demo site, so a hosted TaxLens only ever showed sample data.
describe("HM-6: demo mode is decided by the server, not the hostname", () => {
  const g = globalThis as { window?: unknown };
  const originalWindow = g.window;

  beforeEach(() => {
    g.window = { location: { hostname: "taxlens.example" } };
  });

  afterEach(() => {
    g.window = originalWindow;
  });

  test("server says not demo → not demo, even on a non-localhost hostname", () => {
    expect(resolveDemoMode(null, false)).toBe(false);
  });

  test("server says demo → demo", () => {
    expect(resolveDemoMode(null, true)).toBe(true);
  });

  test("dev override wins in both directions", () => {
    expect(resolveDemoMode(true, false)).toBe(true);
    expect(resolveDemoMode(false, true)).toBe(false);
  });
});

describe("HM-6: source-level guard", () => {
  test("no source file references isHostedEnvironment", () => {
    const srcDir = path.join(import.meta.dir, "..");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const full = path.join(dir, f);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });
    const offenders = walk(srcDir)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"))
      .filter((f) => readFileSync(f, "utf-8").includes("isHostedEnvironment"));
    expect(offenders).toEqual([]);
  });
});
