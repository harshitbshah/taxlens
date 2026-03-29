import type { IndianTaxReturn, TaxReturn } from "./schema";
import type { NavItem } from "./types";

export type SelectedView = "summary" | "forecast" | number | `pending:${string}`;

// ── Generic (country-agnostic) ────────────────────────────────────────────────

/**
 * Build nav items for any country's returns.
 * `yearDef.yearLabel` formats the year for display (e.g. "2024" or "FY 2024-25").
 * `yearDef.summaryLabel` is the label for the "all years" item (e.g. "All time").
 */
export function buildNavItems(
  returns: Record<number, unknown>,
  yearDef: { yearLabel: (y: number) => string; summaryLabel: string },
): NavItem[] {
  const years = Object.keys(returns)
    .map(Number)
    .sort((a, b) => b - a);
  const items: NavItem[] = [];
  if (years.length > 1) items.push({ id: "summary", label: yearDef.summaryLabel });
  items.push(...years.map((y) => ({ id: String(y), label: yearDef.yearLabel(y) })));
  return items;
}

/** Returns the default selected view for a set of returns (any country). */
export function getDefaultSelection(returns: Record<number, unknown>): SelectedView {
  const years = Object.keys(returns)
    .map(Number)
    .sort((a, b) => a - b);
  if (years.length === 0) return "summary";
  if (years.length === 1) return years[0] ?? "summary";
  return "summary";
}

// ── Legacy wrappers (kept for backward compatibility) ─────────────────────────

export function buildUsNavItems(returns: Record<number, TaxReturn>): NavItem[] {
  return buildNavItems(returns, { yearLabel: (y) => String(y), summaryLabel: "All time" });
}

export function buildIndiaNavItems(indiaReturns: Record<number, IndianTaxReturn>): NavItem[] {
  return buildNavItems(indiaReturns, {
    yearLabel: (fy) => `FY ${fy}-${String(fy + 1).slice(-2)}`,
    summaryLabel: "All years",
  });
}

export function getDefaultUsSelection(returns: Record<number, TaxReturn>): SelectedView {
  return getDefaultSelection(returns);
}

export function getDefaultIndiaSelection(
  indiaReturns: Record<number, IndianTaxReturn>,
): SelectedView {
  return getDefaultSelection(indiaReturns);
}

// ── Shared utilities ──────────────────────────────────────────────────────────

export function parseSelectedId(id: string): SelectedView {
  if (id === "summary") return "summary";
  if (id === "forecast") return "forecast";
  if (id.startsWith("pending:")) return id as `pending:${string}`;
  return Number(id);
}

/** Returns the most recent year nav item (first non-summary item), or undefined. */
export function getMostRecentYearItem(navItems: NavItem[]): NavItem | undefined {
  return navItems.find((item) => item.id !== "summary");
}
