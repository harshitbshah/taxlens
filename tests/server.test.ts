import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { saveForecastCache } from "../src/lib/forecast-cache";
import { startTestServer, type TestServer } from "./helpers/test-server";

let server: TestServer | undefined;

const SEEDED = '{"2020":{"seeded":true}}';

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
    // Run from an empty temp dir: Bun loads .env from the cwd, and the repo's holds the real key.
    const cwd = await mkdtemp(path.join(tmpdir(), "taxlens-entry-"));
    const entry = path.join(import.meta.dir, "..", "src", "index.ts");
    const proc = Bun.spawn(["bun", entry, "--port", "0"], {
      cwd,
      env: { ...process.env, TAXLENS_HOSTED: "true", NODE_ENV: "" },
      stderr: "pipe",
      stdout: "pipe",
    });
    const killer = setTimeout(() => proc.kill(), 10_000);
    const exitCode = await proc.exited;
    clearTimeout(killer);
    const stderr = await new Response(proc.stderr).text();
    await rm(cwd, { recursive: true, force: true });

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

  test("a relative static dir still serves its assets", async () => {
    staticDir = await makeStaticDir();
    server = await startTestServer({
      production: true,
      staticDir: path.relative(process.cwd(), staticDir.dir),
    });
    const res = await fetch(`${server.url}/assets/app.js`);
    expect(await res.text()).toBe("console.log('app')");
  });

  // HM-5 AC3 (revised): fetch() normalises "/../package.json" to "/package.json" before sending,
  // which is not a file in the static dir, so the SPA shell is returned — never package.json.
  test("GET /../package.json never returns package.json", async () => {
    const { url } = await startProduction();
    expect(await (await fetch(`${url}/../package.json`)).text()).not.toContain('"name"');
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

describe("HM-8: cross-site writes are rejected on every /api route", () => {
  async function seededServer() {
    server = await startTestServer();
    await writeFile(path.join(server.dataDir, ".tax-returns.json"), SEEDED);
    return server;
  }

  test("cross-site POST /api/clear-data → 403 and data is untouched", async () => {
    const { url, dataDir } = await seededServer();
    const res = await fetch(`${url}/api/clear-data`, {
      method: "POST",
      headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Cross-site request blocked" });
    expect(await Bun.file(path.join(dataDir, ".tax-returns.json")).text()).toBe(SEEDED);
  });

  test("control: the same POST without browser headers still clears data (local mode)", async () => {
    const { url, dataDir } = await seededServer();
    const res = await fetch(`${url}/api/clear-data`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await Bun.file(path.join(dataDir, ".tax-returns.json")).text()).toBe("{}");
  });

  test("cross-site POST to a function-style route (/api/forecast-profile) → 403", async () => {
    const { url } = await seededServer();
    const res = await fetch(`${url}/api/forecast-profile?country=us`, {
      method: "POST",
      headers: { "sec-fetch-site": "cross-site", "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });
});

describe("HM-7: hosted mode is visible to the frontend", () => {
  test("GET /api/config reports isHosted: true on a hosted server", async () => {
    server = await startTestServer({ hosted: true });
    expect(await (await fetch(`${server.url}/api/config`)).json()).toMatchObject({
      isHosted: true,
      isDemo: false,
    });
  });

  test("GET /api/config reports isHosted: false locally", async () => {
    server = await startTestServer();
    expect(await (await fetch(`${server.url}/api/config`)).json()).toMatchObject({
      isHosted: false,
    });
  });
});

describe("HM-7: dangerous routes are disabled in hosted mode", () => {
  test("POST /api/clear-data → 403 and data is untouched", async () => {
    server = await startTestServer({ hosted: true });
    await writeFile(path.join(server.dataDir, ".tax-returns.json"), SEEDED);
    const res = await fetch(`${server.url}/api/clear-data`, { method: "POST" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Disabled in hosted mode" });
    expect(await Bun.file(path.join(server.dataDir, ".tax-returns.json")).text()).toBe(SEEDED);
  });

  test("POST /api/config/key → 403 and no .env is written", async () => {
    server = await startTestServer({ hosted: true });
    const res = await fetch(`${server.url}/api/config/key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "sk-ant-attacker" }),
    });
    expect(res.status).toBe(403);
    expect(await Bun.file(path.join(server.dataDir, ".env")).exists()).toBe(false);
  });

  test.each(["/api/parse", "/api/extract-year"])(
    "%s rejects a browser-supplied apiKey → 403, nothing saved",
    async (route) => {
      server = await startTestServer({ hosted: true });
      const form = new FormData();
      form.append("pdf", new File(["%PDF-1.4"], "return.pdf", { type: "application/pdf" }));
      form.append("apiKey", "sk-ant-attacker");
      const res = await fetch(`${server.url}${route}`, { method: "POST", body: form });
      expect(res.status).toBe(403);
      expect(await Bun.file(path.join(server.dataDir, ".env")).exists()).toBe(false);
    },
  );
});

describe("Review fix: /api/config reflects the server's validated config, not process.env", () => {
  test("production server reports isDev: false", async () => {
    server = await startTestServer({ production: true });
    expect(await (await fetch(`${server.url}/api/config`)).json()).toMatchObject({ isDev: false });
  });

  test("demo option is reported as isDemo: true", async () => {
    server = await startTestServer({ demo: true });
    expect(await (await fetch(`${server.url}/api/config`)).json()).toMatchObject({ isDemo: true });
  });
});
