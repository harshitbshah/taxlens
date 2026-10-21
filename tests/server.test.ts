import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

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

describe("HM-9: health endpoint", () => {
  test("GET /api/health returns exactly { ok: true }", async () => {
    server = await startTestServer();
    const res = await fetch(`${server.url}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

// Static dir fixture: a built frontend plus decoys that must never be served.
async function makeStaticDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), "taxlens-static-"));
  await writeFile(path.join(dir, "index.html"), "<!doctype html><title>TaxLens</title>");
  await writeFile(path.join(dir, ".env"), "ANTHROPIC_API_KEY=decoy");
  await writeFile(path.join(dir, ".tax-returns.json"), '{"decoy":true}');
  await mkdir(path.join(dir, "assets"));
  await writeFile(path.join(dir, "assets", "app.js"), "console.log('app')");
  await writeFile(path.join(dir, "assets", ".hidden"), "decoy");
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

describe("HM-5: production static handler", () => {
  let staticDir: Awaited<ReturnType<typeof makeStaticDir>> | undefined;

  afterEach(async () => {
    await staticDir?.cleanup();
    staticDir = undefined;
  });

  async function startProduction() {
    staticDir = await makeStaticDir();
    server = await startTestServer({ production: true, staticDir: staticDir.dir });
    return server;
  }

  test("serves index.html at / and regular assets", async () => {
    const { url } = await startProduction();
    expect(await (await fetch(`${url}/`)).text()).toContain("<title>TaxLens</title>");
    expect((await fetch(`${url}/assets/app.js`)).status).toBe(200);
  });

  test.each(["/.env", "/.tax-returns.json", "/%2e%65%6e%76", "/assets/.hidden"])(
    "never serves dotfiles: %s",
    async (pathname) => {
      const { url } = await startProduction();
      const res = await fetch(`${url}${pathname}`);
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain("decoy");
    },
  );

  // A sibling dir sharing the static dir's name prefix (/tmp/x vs /tmp/x2) defeats a naive
  // startsWith() containment check.
  test("blocks encoded traversal into a prefix-sibling directory", async () => {
    const { url } = await startProduction();
    const sibling = `${staticDir!.dir}2`;
    await mkdir(sibling);
    await writeFile(path.join(sibling, "secret.txt"), "decoy");
    try {
      // "..%2f" survives client-side URL normalisation (unlike "%2e%2e/"), so the server
      // really receives a traversal once it decodes the path.
      const res = await fetch(`${url}/..%2f${path.basename(sibling)}%2fsecret.txt`);
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain("decoy");
    } finally {
      await rm(sibling, { recursive: true, force: true });
    }
  });

  test("unknown non-API paths fall back to index.html (SPA deep links)", async () => {
    const { url } = await startProduction();
    const res = await fetch(`${url}/some/deep/link`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>TaxLens</title>");
  });

  test("unknown API paths still 404 rather than returning the SPA", async () => {
    const { url } = await startProduction();
    expect((await fetch(`${url}/api/does-not-exist`)).status).toBe(404);
  });
});
