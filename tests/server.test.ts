import { afterEach, describe, expect, test } from "bun:test";

import { saveForecastCache } from "../src/lib/forecast-cache";
import { startTestServer, type TestServer } from "./helpers/test-server";

let server: TestServer | undefined;

afterEach(async () => {
  await server?.stop();
  server = undefined;
});

describe("HM-3: server factory", () => {
  test("a test server answers GET /api/config with JSON", async () => {
    server = await startTestServer();
    const res = await fetch(`${server.url}/api/config`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ hasKey: expect.any(Boolean) });
  });
});

// Regression: Bun's "/*" HTML wildcard used to swallow GETs on method-object API routes,
// returning the SPA page instead of JSON. Only reproducible in dev mode, where "/*" exists.
describe("HM-3: API GETs are not intercepted by the dev-mode SPA wildcard", () => {
  test("GET /api/forecast returns the cached forecast as JSON, not the HTML page", async () => {
    server = await startTestServer({ production: false });
    await saveForecastCache("us", { projectedYear: 2099 } as Parameters<
      typeof saveForecastCache
    >[1]);
    const res = await fetch(`${server.url}/api/forecast?country=us`);
    expect(res.headers.get("content-type") ?? "").toContain("application/json");
    expect(await res.json()).toMatchObject({ projectedYear: 2099 });
  });
});

describe("HM-4: the entry point refuses to start with an invalid hosted config", () => {
  test("exits 1 and prints every config error", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", "--port", "0"], {
      cwd: `${import.meta.dir}/..`,
      // Empty key on purpose: Bun would otherwise load the real one from .env into the child.
      env: { ...process.env, TAXLENS_HOSTED: "true", NODE_ENV: "", ANTHROPIC_API_KEY: "" },
      stderr: "pipe",
      stdout: "pipe",
    });
    const killer = setTimeout(() => proc.kill(), 10_000);
    const exitCode = await proc.exited;
    clearTimeout(killer);
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(stderr).toContain("NODE_ENV");
    expect(stderr).toContain("ANTHROPIC_API_KEY");
  }, 15_000);
});
