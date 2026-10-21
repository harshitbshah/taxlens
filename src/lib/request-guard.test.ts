import { describe, expect, test } from "bun:test";

import { isCrossSiteWrite } from "./request-guard";

function post(headers: Record<string, string> = {}, method = "POST"): Request {
  return new Request("http://taxlens.example/api/clear-data", {
    method,
    headers: { host: "taxlens.example", ...headers },
  });
}

describe("HM-8: Sec-Fetch-Site", () => {
  test.each([
    ["cross-site", true],
    ["same-site", true],
    ["same-origin", false],
    ["none", false],
  ])("Sec-Fetch-Site: %s → blocked=%p", (value, blocked) => {
    expect(isCrossSiteWrite(post({ "sec-fetch-site": value }))).toBe(blocked);
  });

  test("no browser headers at all (curl, Claude Code over the SSH tunnel) is allowed", () => {
    expect(isCrossSiteWrite(post())).toBe(false);
  });
});

describe("HM-8: Origin (for browsers without Sec-Fetch-Site)", () => {
  test("matching Origin host is allowed", () => {
    expect(isCrossSiteWrite(post({ origin: "https://taxlens.example" }))).toBe(false);
  });

  test("Origin from another host is blocked", () => {
    expect(isCrossSiteWrite(post({ origin: "https://evil.example" }))).toBe(true);
  });

  // Sandboxed iframes and some redirects send the literal string "null".
  test('Origin: "null" is blocked', () => {
    expect(isCrossSiteWrite(post({ origin: "null" }))).toBe(true);
  });

  test("Origin with a different port on the same hostname is blocked", () => {
    expect(isCrossSiteWrite(post({ origin: "https://taxlens.example:8443" }))).toBe(true);
  });
});

describe("HM-8: only state-changing methods are guarded", () => {
  test.each(["GET", "HEAD", "OPTIONS"])("%s with cross-site headers is allowed", (method) => {
    const req = post({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }, method);
    expect(isCrossSiteWrite(req)).toBe(false);
  });

  test.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s with cross-site headers is blocked",
    (method) => {
      const req = post({ "sec-fetch-site": "cross-site" }, method);
      expect(isCrossSiteWrite(req)).toBe(true);
    },
  );
});
