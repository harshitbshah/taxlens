import { readFile, writeFile } from "fs/promises";

import { dataPath } from "./data-dir";
import type { CountryCosts, FilingCostsData } from "./filing-costs-schema";

const CACHE_FILE = () => dataPath(".filing-costs.json");

async function readCache(): Promise<FilingCostsData> {
  try {
    const raw = await readFile(CACHE_FILE(), "utf-8");
    return JSON.parse(raw) as FilingCostsData;
  } catch {
    return {};
  }
}

async function writeCache(data: FilingCostsData): Promise<void> {
  await writeFile(CACHE_FILE(), JSON.stringify(data, null, 2), "utf-8");
}

export async function getFilingCosts(country: string): Promise<Record<number, CountryCosts>> {
  const data = await readCache();
  const result: Record<number, CountryCosts> = {};
  for (const [yearStr, countries] of Object.entries(data)) {
    if (countries[country]) {
      result[Number(yearStr)] = countries[country];
    }
  }
  return result;
}

export async function saveFilingCosts(
  year: number,
  country: string,
  costs: CountryCosts,
): Promise<void> {
  const data = await readCache();
  const yearStr = String(year);
  data[yearStr] = { ...(data[yearStr] ?? {}), [country]: costs };
  await writeCache(data);
}

export async function deleteFilingCosts(year: number, country: string): Promise<void> {
  const data = await readCache();
  const yearStr = String(year);
  if (!data[yearStr]) return;
  delete data[yearStr][country];
  if (Object.keys(data[yearStr]).length === 0) delete data[yearStr];
  await writeCache(data);
}
