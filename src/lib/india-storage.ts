import { dataPath } from "./data-dir";
import { type IndianTaxReturn, IndianTaxReturnSchema } from "./schema";

const INDIA_RETURNS_FILE = () => dataPath(".india-tax-returns.json");

function migrateIndia(data: Record<number, unknown>): Record<number, IndianTaxReturn> {
  const result: Record<number, IndianTaxReturn> = {};
  for (const [year, raw] of Object.entries(data)) {
    const parsed = IndianTaxReturnSchema.safeParse(raw);
    if (parsed.success) {
      result[Number(year)] = parsed.data;
    } else {
      console.warn(`Skipping invalid India return for year ${year}:`, parsed.error.issues);
    }
  }
  return result;
}

export async function getIndiaReturns(): Promise<Record<number, IndianTaxReturn>> {
  const file = Bun.file(INDIA_RETURNS_FILE());
  if (await file.exists()) {
    return migrateIndia(await file.json());
  }
  return {};
}

export async function saveIndiaReturn(r: IndianTaxReturn): Promise<void> {
  const returns = await getIndiaReturns();
  returns[r.financialYear] = r;
  await Bun.write(INDIA_RETURNS_FILE(), JSON.stringify(returns, null, 2));
}

export async function deleteIndiaReturn(financialYear: number): Promise<void> {
  const returns = await getIndiaReturns();
  delete returns[financialYear];
  await Bun.write(INDIA_RETURNS_FILE(), JSON.stringify(returns, null, 2));
}

export async function clearIndiaData(): Promise<void> {
  const file = Bun.file(INDIA_RETURNS_FILE());
  if (await file.exists()) {
    await Bun.write(INDIA_RETURNS_FILE(), "{}");
  }
}
