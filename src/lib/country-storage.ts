import path from "path";

import type { CountryServerPlugin } from "./country-registry";

const DATA_DIR = process.env.TAX_UI_DATA_DIR || process.cwd();

export async function getCountryReturns(
  plugin: CountryServerPlugin,
): Promise<Record<number, unknown>> {
  const filePath = path.join(DATA_DIR, plugin.storageFile);
  const file = Bun.file(filePath);
  if (!(await file.exists())) return {};
  const raw = (await file.json()) as Record<string, unknown>;
  const result: Record<number, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const migrated = plugin.migrateReturn ? plugin.migrateReturn(value) : value;
    const parsed = plugin.schema.safeParse(migrated);
    if (parsed.success) {
      result[Number(key)] = parsed.data;
    } else {
      console.warn(`Skipping invalid ${plugin.code} return for year ${key}:`, parsed.error.issues);
    }
  }
  return result;
}

export async function saveCountryReturn(plugin: CountryServerPlugin, r: unknown): Promise<void> {
  const filePath = path.join(DATA_DIR, plugin.storageFile);
  const returns = await getCountryReturns(plugin);
  returns[plugin.getYear(r)] = r;
  await Bun.write(filePath, JSON.stringify(returns, null, 2));
}

export async function deleteCountryReturn(
  plugin: CountryServerPlugin,
  year: number,
): Promise<void> {
  const filePath = path.join(DATA_DIR, plugin.storageFile);
  const returns = await getCountryReturns(plugin);
  delete returns[year];
  await Bun.write(filePath, JSON.stringify(returns, null, 2));
}

export async function clearCountryData(plugin: CountryServerPlugin): Promise<void> {
  const filePath = path.join(DATA_DIR, plugin.storageFile);
  const file = Bun.file(filePath);
  if (await file.exists()) {
    await Bun.write(filePath, "{}");
  }
}
