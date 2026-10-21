import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import path from "path";

// Regression tests for server configuration bugs discovered in production.
// These tests parse the source to verify config is present — cheaper than starting the server.

const serverSrc = readFileSync(path.join(import.meta.dir, "server.ts"), "utf-8");

// These are source-level checks, not HTTP tests. They verify config decisions that caused
// production bugs and are easy to accidentally revert in future refactors.
describe("server configuration regressions", () => {
  // Bug: Bun's default idleTimeout is 10s. Claude API calls take 30–90s.
  // The forecast POST was dropping the connection mid-call with "empty reply from server".
  // Fix: idleTimeout: 120 added to serve() config.
  test("idleTimeout is set above Bun default (10s) to accommodate Claude API calls", () => {
    expect(serverSrc).toContain("idleTimeout:");
    const match = serverSrc.match(/idleTimeout:\s*(\d+)/);
    expect(match).not.toBeNull();
    const value = Number(match![1]);
    expect(value).toBeGreaterThan(10);
  });

  // Bug: /api/forecast used { GET: ..., POST: ... } object format. Bun's "/*" SPA wildcard
  // intercepted the GET, returning the HTML page. POST returned 405 because "/*" only
  // handles GET. Fix: use a single function handler that branches on req.method.
  test("forecast route uses function handler (not method-object) to avoid /* wildcard conflict", () => {
    // Find the forecast route definition and verify it uses "async" (function handler), not "{"
    const forecastIdx = serverSrc.indexOf('"/api/forecast"');
    expect(forecastIdx).toBeGreaterThan(-1);
    // Grab the next 30 chars after the route key to check what follows the colon
    const afterKey = serverSrc
      .slice(forecastIdx + '"/api/forecast"'.length, forecastIdx + 60)
      .trim();
    // Should start with ": async" not ": {"
    expect(afterKey.startsWith(": async")).toBe(true);
  });
});
