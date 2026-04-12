// Shared types — safe to import from both server and browser.

export interface RetirementAccount {
  name: string;
  shortTermGains: number;
  shortTermLosses: number;
  longTermGains: number;
  longTermLosses: number;
}

export type RetirementAccountsYear = RetirementAccount[];

// Keyed by year
export type AllRetirementAccounts = Record<number, RetirementAccountsYear>;

export const DEFAULT_ACCOUNT_NAMES = ["Roth IRA", "BrokerageLink", "BrokerageLink Roth"];

export function netGainLoss(account: RetirementAccount): number {
  return (
    account.shortTermGains -
    account.shortTermLosses +
    account.longTermGains -
    account.longTermLosses
  );
}

export function totalNetForYear(accounts: RetirementAccountsYear): number {
  return accounts.reduce((sum, a) => sum + netGainLoss(a), 0);
}
