import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "path";

import { clearForecastCache, getForecastCache, saveForecastCache } from "./forecast-cache";
import type { ForecastResponse } from "./forecaster";

const minimalForecast: ForecastResponse = {
  projectedYear: 2025,
  taxLiability: { value: 30000, low: 25000, high: 35000 },
  effectiveRate: { value: 20.0, low: 17.0, high: 23.0 },
  estimatedOutcome: { value: 2000, low: -1000, high: 5000, label: "refund" },
  bracket: { rate: 22, floor: 89075, ceiling: 170050, projectedIncome: 150000, headroom: 20050 },
  assumptions: [],
  actionItems: [],
  riskFlags: [],
  generatedAt: "2026-03-28T10:00:00.000Z",
};

const indiaForecast: ForecastResponse = {
  projectedYear: 2026,
  taxLiability: { value: 450000, low: 380000, high: 520000 },
  effectiveRate: { value: 18.0, low: 15.0, high: 21.0 },
  estimatedOutcome: { value: 20000, low: -5000, high: 45000, label: "refund" },
  assumptions: [],
  actionItems: [],
  riskFlags: [],
  generatedAt: "2026-03-28T10:00:00.000Z",
};

// Clear before AND after — beforeEach handles dirty state from interrupted prior runs
beforeEach(async () => {
  await clearForecastCache();
});

afterEach(async () => {
  await clearForecastCache();
});

describe("getForecastCache", () => {
  test("returns null when no cache file exists", async () => {
    const result = await getForecastCache("us");
    expect(result).toBeNull();
  });

  test("returns saved forecast after saveForecastCache", async () => {
    await saveForecastCache("us", minimalForecast);
    const result = await getForecastCache("us");
    expect(result).not.toBeNull();
    expect(result?.projectedYear).toBe(2025);
    expect(result?.taxLiability.value).toBe(30000);
  });

  test("returns null for a different country when only one was saved", async () => {
    await saveForecastCache("us", minimalForecast);
    const result = await getForecastCache("india");
    expect(result).toBeNull();
  });

  test("returns null after clearForecastCache for that country", async () => {
    await saveForecastCache("us", minimalForecast);
    await clearForecastCache("us");
    const result = await getForecastCache("us");
    expect(result).toBeNull();
  });

  test("returns null after clearForecastCache with no args", async () => {
    await saveForecastCache("us", minimalForecast);
    await clearForecastCache();
    const result = await getForecastCache("us");
    expect(result).toBeNull();
  });
});

describe("saveForecastCache", () => {
  test("second save for same country overwrites first (upsert semantics)", async () => {
    await saveForecastCache("us", minimalForecast);
    const updated: ForecastResponse = { ...minimalForecast, projectedYear: 2026 };
    await saveForecastCache("us", updated);
    const result = await getForecastCache("us");
    expect(result?.projectedYear).toBe(2026);
  });

  test("persists all required top-level fields", async () => {
    await saveForecastCache("us", minimalForecast);
    const result = await getForecastCache("us");
    expect(result?.effectiveRate).toEqual({ value: 20.0, low: 17.0, high: 23.0 });
    expect(result?.estimatedOutcome.label).toBe("refund");
    expect(result?.bracket?.headroom).toBe(20050);
    expect(result?.generatedAt).toBe("2026-03-28T10:00:00.000Z");
  });

  test("multiple countries stored independently", async () => {
    await saveForecastCache("us", minimalForecast);
    await saveForecastCache("india", indiaForecast);
    const us = await getForecastCache("us");
    const india = await getForecastCache("india");
    expect(us?.projectedYear).toBe(2025);
    expect(india?.projectedYear).toBe(2026);
    expect(india?.bracket).toBeUndefined();
  });

  test("clearing one country does not affect the other", async () => {
    await saveForecastCache("us", minimalForecast);
    await saveForecastCache("india", indiaForecast);
    await clearForecastCache("india");
    expect(await getForecastCache("us")).not.toBeNull();
    expect(await getForecastCache("india")).toBeNull();
  });

  test("persists india section when present", async () => {
    const withIndia: ForecastResponse = {
      ...minimalForecast,
      india: {
        regimeRecommendation: "new",
        oldRegimeTax: 450000,
        newRegimeTax: 380000,
        savingUnderRecommended: 70000,
        reasoning: "New regime is better.",
      },
    };
    await saveForecastCache("us", withIndia);
    const result = await getForecastCache("us");
    expect(result?.india?.regimeRecommendation).toBe("new");
    expect(result?.india?.savingUnderRecommended).toBe(70000);
  });

  test("india is undefined when not saved", async () => {
    await saveForecastCache("us", minimalForecast);
    const result = await getForecastCache("us");
    expect(result?.india).toBeUndefined();
  });
});

describe("clearForecastCache", () => {
  test("no-op when no cache exists (does not throw)", async () => {
    await expect(clearForecastCache()).resolves.toBeUndefined();
  });

  test("no-op for specific country when cache does not exist (does not throw)", async () => {
    await expect(clearForecastCache("us")).resolves.toBeUndefined();
  });
});

describe("backward compat: old single-ForecastResponse format", () => {
  test("discards old root-level ForecastResponse (stale prompt version)", async () => {
    // Write the old format directly — root-level ForecastResponse with no __version
    await Bun.write(
      path.join(process.env.TAX_UI_DATA_DIR || process.cwd(), ".forecast-cache.json"),
      JSON.stringify(minimalForecast, null, 2),
    );
    // Old format is treated as stale (version mismatch) — both countries return null
    expect(await getForecastCache("us")).toBeNull();
    expect(await getForecastCache("india")).toBeNull();
  });

  test("discards cache with mismatched __version", async () => {
    await Bun.write(
      path.join(process.env.TAX_UI_DATA_DIR || process.cwd(), ".forecast-cache.json"),
      JSON.stringify({ __version: "0", us: minimalForecast }, null, 2),
    );
    expect(await getForecastCache("us")).toBeNull();
  });

  test("reads cache with current __version", async () => {
    await saveForecastCache("us", minimalForecast);
    expect((await getForecastCache("us"))?.projectedYear).toBe(2025);
  });
});
