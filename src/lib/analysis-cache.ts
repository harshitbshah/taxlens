import path from "path";

import type { AnalysisResponse } from "./analysis-schema";

const CACHE_FILE = () =>
  path.join(process.env.TAX_UI_DATA_DIR || process.cwd(), ".analysis-cache.json");

// key: "${year}-${country}"  e.g. "2025-us"
function cacheKey(year: number, country: string): string {
  return `${year}-${country}`;
}

async function readCache(): Promise<Record<string, AnalysisResponse>> {
  const file = Bun.file(CACHE_FILE());
  if (!(await file.exists())) return {};
  try {
    return (await file.json()) as Record<string, AnalysisResponse>;
  } catch {
    return {};
  }
}

export async function getAnalysisCache(
  year: number,
  country: string,
): Promise<AnalysisResponse | null> {
  const cache = await readCache();
  return cache[cacheKey(year, country)] ?? null;
}

export async function saveAnalysisCache(
  year: number,
  country: string,
  analysis: AnalysisResponse,
): Promise<void> {
  const cache = await readCache();
  cache[cacheKey(year, country)] = analysis;
  await Bun.write(CACHE_FILE(), JSON.stringify(cache, null, 2));
}

export async function clearAnalysisCache(year: number, country: string): Promise<void> {
  const cache = await readCache();
  const key = cacheKey(year, country);
  if (!(key in cache)) return;
  delete cache[key];
  if (Object.keys(cache).length === 0) {
    const fs = await import("fs/promises");
    await fs.unlink(CACHE_FILE()).catch(() => {});
    return;
  }
  await Bun.write(CACHE_FILE(), JSON.stringify(cache, null, 2));
}
