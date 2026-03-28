import path from "path";

import type { ForecastResponse } from "./forecaster";

const DATA_DIR = process.env.TAX_UI_DATA_DIR || process.cwd();
const CACHE_FILE = path.join(DATA_DIR, ".forecast-cache.json");

export async function getForecastCache(): Promise<ForecastResponse | null> {
  const file = Bun.file(CACHE_FILE);
  if (!(await file.exists())) return null;
  try {
    return (await file.json()) as ForecastResponse;
  } catch {
    return null;
  }
}

export async function saveForecastCache(forecast: ForecastResponse): Promise<void> {
  await Bun.write(CACHE_FILE, JSON.stringify(forecast, null, 2));
}

export async function clearForecastCache(): Promise<void> {
  const file = Bun.file(CACHE_FILE);
  if (await file.exists()) {
    const fs = await import("fs/promises");
    await fs.unlink(CACHE_FILE);
  }
}
