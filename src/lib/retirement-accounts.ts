// Server-only: Bun file I/O. Do not import this module in browser code.
// For shared types, import from ./retirement-accounts-schema instead.
import path from "path";

export type {
  AllRetirementAccounts,
  RetirementAccount,
  RetirementAccountsYear,
} from "./retirement-accounts-schema";

import type { AllRetirementAccounts, RetirementAccountsYear } from "./retirement-accounts-schema";

const DATA_DIR = process.env.TAX_UI_DATA_DIR || process.cwd();
const FILE = path.join(DATA_DIR, ".retirement-accounts.json");

async function readAll(): Promise<AllRetirementAccounts> {
  const file = Bun.file(FILE);
  if (!(await file.exists())) return {};
  try {
    const raw = (await file.json()) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return {};
    return raw as AllRetirementAccounts;
  } catch {
    return {};
  }
}

export async function getRetirementAccounts(year: number): Promise<RetirementAccountsYear | null> {
  const all = await readAll();
  return all[year] ?? null;
}

export async function getAllRetirementAccounts(): Promise<AllRetirementAccounts> {
  return readAll();
}

export async function saveRetirementAccounts(
  year: number,
  accounts: RetirementAccountsYear,
): Promise<void> {
  const all = await readAll();
  all[year] = accounts;
  await Bun.write(FILE, JSON.stringify(all, null, 2));
}

export async function deleteRetirementAccounts(year: number): Promise<void> {
  const all = await readAll();
  delete all[year];
  await Bun.write(FILE, JSON.stringify(all, null, 2));
}
