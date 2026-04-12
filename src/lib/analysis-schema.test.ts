import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { clearAnalysisCache, getAnalysisCache, saveAnalysisCache } from "./analysis-cache";
import { type AnalysisResponse, parseAnalysisResponse } from "./analysis-schema";

// ── parseAnalysisResponse ────────────────────────────────────────────────────

const VALID_RESPONSE: AnalysisResponse = {
  year: 2025,
  country: "us",
  source: "claude_code",
  generatedAt: "2026-04-11T00:00:00.000Z",
  sections: [
    {
      id: "outcome",
      title: "Tax Outcome",
      markdown: "You owed **$19,986**.",
      generatedAt: "2026-04-11T00:00:00.000Z",
    },
    {
      id: "root_cause",
      title: "Why You Owed",
      markdown: "Capital gains were not withheld.",
      generatedAt: "2026-04-11T00:00:00.000Z",
    },
  ],
};

describe("parseAnalysisResponse", () => {
  test("accepts a valid AnalysisResponse", () => {
    const result = parseAnalysisResponse(VALID_RESPONSE);
    expect(result.year).toBe(2025);
    expect(result.country).toBe("us");
    expect(result.source).toBe("claude_code");
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]!.id).toBe("outcome");
  });

  test("accepts source: api", () => {
    const result = parseAnalysisResponse({ ...VALID_RESPONSE, source: "api" });
    expect(result.source).toBe("api");
  });

  test("throws when year is missing", () => {
    const { year: _, ...rest } = VALID_RESPONSE;
    expect(() => parseAnalysisResponse(rest)).toThrow("year");
  });

  test("throws when country is missing", () => {
    const { country: _, ...rest } = VALID_RESPONSE;
    expect(() => parseAnalysisResponse(rest)).toThrow("country");
  });

  test("throws when source is invalid", () => {
    expect(() => parseAnalysisResponse({ ...VALID_RESPONSE, source: "human" })).toThrow("source");
  });

  test("throws when sections is not an array", () => {
    expect(() => parseAnalysisResponse({ ...VALID_RESPONSE, sections: "nope" })).toThrow(
      "sections",
    );
  });

  test("throws when a section is missing markdown", () => {
    const bad = {
      ...VALID_RESPONSE,
      sections: [{ id: "outcome", title: "Tax Outcome", generatedAt: "2026-04-11T00:00:00.000Z" }],
    };
    expect(() => parseAnalysisResponse(bad)).toThrow("markdown");
  });

  test("handles empty sections array", () => {
    const result = parseAnalysisResponse({ ...VALID_RESPONSE, sections: [] });
    expect(result.sections).toHaveLength(0);
  });

  test("throws on null input", () => {
    expect(() => parseAnalysisResponse(null)).toThrow();
  });
});

// ── analysis cache ───────────────────────────────────────────────────────────

describe("analysis cache", () => {
  let tmpDir: string;
  const origDataDir = process.env.TAX_UI_DATA_DIR;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "taxlens-test-"));
    process.env.TAX_UI_DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    process.env.TAX_UI_DATA_DIR = origDataDir;
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("returns null when cache is empty", async () => {
    const result = await getAnalysisCache(2025, "us");
    expect(result).toBeNull();
  });

  test("returns null for a different key after saving", async () => {
    await saveAnalysisCache(2025, "us", VALID_RESPONSE);
    const result = await getAnalysisCache(2024, "us");
    expect(result).toBeNull();
  });

  test("returns null for different country after saving", async () => {
    await saveAnalysisCache(2025, "us", VALID_RESPONSE);
    const result = await getAnalysisCache(2025, "india");
    expect(result).toBeNull();
  });

  test("returns saved value after saveAnalysisCache", async () => {
    await saveAnalysisCache(2025, "us", VALID_RESPONSE);
    const result = await getAnalysisCache(2025, "us");
    expect(result).not.toBeNull();
    expect(result!.year).toBe(2025);
    expect(result!.sections).toHaveLength(2);
  });

  test("overwrites existing entry for same year+country", async () => {
    await saveAnalysisCache(2025, "us", VALID_RESPONSE);
    const updated = { ...VALID_RESPONSE, generatedAt: "2026-05-01T00:00:00.000Z" };
    await saveAnalysisCache(2025, "us", updated);
    const result = await getAnalysisCache(2025, "us");
    expect(result!.generatedAt).toBe("2026-05-01T00:00:00.000Z");
  });

  test("preserves other entries when saving a new one", async () => {
    const india = { ...VALID_RESPONSE, country: "india", year: 2024 };
    await saveAnalysisCache(2025, "us", VALID_RESPONSE);
    await saveAnalysisCache(2024, "india", india);
    expect(await getAnalysisCache(2025, "us")).not.toBeNull();
    expect(await getAnalysisCache(2024, "india")).not.toBeNull();
  });

  test("clearAnalysisCache removes the entry", async () => {
    await saveAnalysisCache(2025, "us", VALID_RESPONSE);
    await clearAnalysisCache(2025, "us");
    const result = await getAnalysisCache(2025, "us");
    expect(result).toBeNull();
  });

  test("clearAnalysisCache leaves other entries intact", async () => {
    const india = { ...VALID_RESPONSE, country: "india", year: 2024 };
    await saveAnalysisCache(2025, "us", VALID_RESPONSE);
    await saveAnalysisCache(2024, "india", india);
    await clearAnalysisCache(2025, "us");
    expect(await getAnalysisCache(2025, "us")).toBeNull();
    expect(await getAnalysisCache(2024, "india")).not.toBeNull();
  });

  test("clearAnalysisCache is a no-op when key does not exist", async () => {
    await expect(clearAnalysisCache(2025, "us")).resolves.toBeUndefined();
  });
});
