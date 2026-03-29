import path from "path";

import type { ForecastResponse } from "./forecaster";

const DATA_DIR = process.env.TAX_UI_DATA_DIR || process.cwd();
const CACHE_FILE = path.join(DATA_DIR, ".forecast-cache.json");

// Bump this string whenever the forecast prompt logic changes significantly.
// A mismatch causes all cached forecasts to be treated as stale.
export const FORECAST_PROMPT_VERSION = "3";

async function readCache(): Promise<Record<string, ForecastResponse>> {
  const file = Bun.file(CACHE_FILE);
  if (!(await file.exists())) return {};
  try {
    const raw = await file.json() as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return {};
    // Backward compat: old format stored a single ForecastResponse at root (not keyed by country)
    if ("projectedYear" in raw) return {};
    // Version mismatch: discard all cached forecasts so the next visit triggers a fresh generation
    if (raw.__version !== FORECAST_PROMPT_VERSION) return {};
    const { __version: _, ...forecasts } = raw;
    return forecasts as Record<string, ForecastResponse>;
  } catch {
    return {};
  }
}

export async function getForecastCache(country: string): Promise<ForecastResponse | null> {
  const cache = await readCache();
  return cache[country] ?? null;
}

export async function saveForecastCache(
  country: string,
  forecast: ForecastResponse,
): Promise<void> {
  const cache = await readCache();
  cache[country] = forecast;
  await Bun.write(CACHE_FILE, JSON.stringify({ __version: FORECAST_PROMPT_VERSION, ...cache }, null, 2));
}

export async function clearForecastCache(country?: string): Promise<void> {
  const file = Bun.file(CACHE_FILE);
  if (!(await file.exists())) return;
  if (!country) {
    const fs = await import("fs/promises");
    await fs.unlink(CACHE_FILE);
    return;
  }
  const cache = await readCache();
  delete cache[country];
  await Bun.write(CACHE_FILE, JSON.stringify({ __version: FORECAST_PROMPT_VERSION, ...cache }, null, 2));
}
