import { describe, expect, test } from "bun:test";

import { resolveServerEnv } from "./hosted-config";

const DEFAULTS = { cwd: "/home/me/taxlens", defaultStaticDir: "/home/me/taxlens/src" };

describe("HM-4/HM-9: local (non-hosted) defaults", () => {
  test("empty env resolves to a local dev config bound to loopback", () => {
    expect(resolveServerEnv({}, DEFAULTS)).toEqual({
      ok: true,
      config: {
        hosted: false,
        production: false,
        demo: false,
        dataDir: "/home/me/taxlens",
        staticDir: "/home/me/taxlens/src",
        hostname: "127.0.0.1",
      },
    });
  });

  test("existing env vars are honoured outside hosted mode", () => {
    const result = resolveServerEnv(
      {
        NODE_ENV: "production",
        TAX_UI_DATA_DIR: "/srv/data",
        TAX_UI_STATIC_DIR: "/srv/dist",
        DEMO_MODE: "true",
      },
      DEFAULTS,
    );
    expect(result).toMatchObject({
      ok: true,
      config: {
        hosted: false,
        production: true,
        demo: true,
        dataDir: "/srv/data",
        staticDir: "/srv/dist",
      },
    });
  });

  test("TAXLENS_HOSTNAME overrides the bind address", () => {
    const result = resolveServerEnv({ TAXLENS_HOSTNAME: "0.0.0.0" }, DEFAULTS);
    expect(result.ok && result.config.hostname).toBe("0.0.0.0");
  });
});

const VALID_HOSTED = {
  TAXLENS_HOSTED: "true",
  NODE_ENV: "production",
  TAX_UI_DATA_DIR: "/data",
  TAX_UI_STATIC_DIR: "/app/dist",
  ANTHROPIC_API_KEY: "sk-ant-dummy",
  TAXLENS_HOSTNAME: "0.0.0.0",
};

describe("HM-4: hosted mode", () => {
  test("a complete hosted env resolves with hosted: true", () => {
    expect(resolveServerEnv(VALID_HOSTED, DEFAULTS)).toEqual({
      ok: true,
      config: {
        hosted: true,
        production: true,
        demo: false,
        dataDir: "/data",
        staticDir: "/app/dist",
        hostname: "0.0.0.0",
      },
    });
  });
});

describe("HM-4: each hosted-mode rule rejects a bad env", () => {
  const cases: [string, Record<string, string | undefined>, RegExp][] = [
    ["NODE_ENV not production", { NODE_ENV: "development" }, /NODE_ENV/],
    ["TAX_UI_DATA_DIR missing", { TAX_UI_DATA_DIR: undefined }, /TAX_UI_DATA_DIR/],
    ["TAX_UI_DATA_DIR relative", { TAX_UI_DATA_DIR: "data" }, /TAX_UI_DATA_DIR.*absolute/],
    ["TAX_UI_STATIC_DIR missing", { TAX_UI_STATIC_DIR: undefined }, /TAX_UI_STATIC_DIR/],
    ["TAX_UI_STATIC_DIR relative", { TAX_UI_STATIC_DIR: "dist" }, /TAX_UI_STATIC_DIR.*absolute/],
    ["ANTHROPIC_API_KEY missing", { ANTHROPIC_API_KEY: undefined }, /ANTHROPIC_API_KEY/],
    ["DEMO_MODE on", { DEMO_MODE: "true" }, /DEMO_MODE/],
  ];

  test.each(cases)("%s", (_name, override, message) => {
    const result = resolveServerEnv({ ...VALID_HOSTED, ...override }, DEFAULTS);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.some((e) => message.test(e))).toBe(true);
  });

  test("the same values are accepted when TAXLENS_HOSTED is unset", () => {
    const result = resolveServerEnv(
      { NODE_ENV: "development", TAX_UI_DATA_DIR: "data", DEMO_MODE: "true" },
      DEFAULTS,
    );
    expect(result.ok).toBe(true);
  });
});

describe("HM-4: error reporting", () => {
  test("reports every failing rule at once, not just the first", () => {
    const result = resolveServerEnv({ TAXLENS_HOSTED: "true" }, DEFAULTS);
    expect(!result.ok && result.errors.length).toBe(4);
  });
});

// The static handler only serves files inside the static dir, so the leak is specifically
// "data dir is the static dir or inside it". The reverse (static dir inside data dir) is how
// `bun run start` runs by default (data = repo root, static = src/) and exposes nothing.
describe("HM-4/HM-5: data dir must not be inside the static dir", () => {
  const overlapping: [string, string, string][] = [
    ["identical", "/app/dist", "/app/dist"],
    ["data dir inside static dir", "/app/dist/data", "/app/dist"],
    ["overlap hidden behind ..", "/data/../app/dist", "/app/dist"],
  ];

  test.each(overlapping)("%s", (_name, dataDir, staticDir) => {
    const result = resolveServerEnv(
      { ...VALID_HOSTED, TAX_UI_DATA_DIR: dataDir, TAX_UI_STATIC_DIR: staticDir },
      DEFAULTS,
    );
    expect(!result.ok && result.errors.some((e) => /inside/.test(e))).toBe(true);
  });

  test("static dir inside data dir is allowed", () => {
    const result = resolveServerEnv(
      { ...VALID_HOSTED, TAX_UI_DATA_DIR: "/app", TAX_UI_STATIC_DIR: "/app/dist" },
      DEFAULTS,
    );
    expect(result.ok).toBe(true);
  });

  test("applies to any production run, not only hosted mode", () => {
    const result = resolveServerEnv(
      { NODE_ENV: "production", TAX_UI_DATA_DIR: "/srv/dist", TAX_UI_STATIC_DIR: "/srv/dist" },
      DEFAULTS,
    );
    expect(!result.ok && result.errors.some((e) => /inside/.test(e))).toBe(true);
  });

  test("default `bun run start` layout (data = cwd, static = src/) is allowed", () => {
    expect(resolveServerEnv({ NODE_ENV: "production" }, DEFAULTS).ok).toBe(true);
  });

  test("dev mode is not checked (the static handler is not used)", () => {
    const result = resolveServerEnv(
      { TAX_UI_DATA_DIR: "/srv/dist", TAX_UI_STATIC_DIR: "/srv/dist" },
      DEFAULTS,
    );
    expect(result.ok).toBe(true);
  });

  test("sibling directories sharing a name prefix are not an overlap", () => {
    const result = resolveServerEnv(
      { ...VALID_HOSTED, TAX_UI_DATA_DIR: "/app/dist2", TAX_UI_STATIC_DIR: "/app/dist" },
      DEFAULTS,
    );
    expect(result.ok).toBe(true);
  });
});
