import { BracketBar } from "../../components/BracketBar";
import { ReceiptView } from "../../components/ReceiptView";
import { SummaryCharts } from "../../components/SummaryCharts";
import { SummaryReceiptView } from "../../components/SummaryReceiptView";
import { SummaryTable } from "../../components/SummaryTable";
import { YearCharts } from "../../components/YearCharts";
import type { CountryClientPlugin } from "../../lib/country-registry";
import type { ForecastResponse } from "../../lib/forecaster";
import type { TaxReturn } from "../../lib/schema";

function UsBracketCard({ data }: { data: unknown }) {
  const bracket = (data as NonNullable<ForecastResponse["bracket"]>) ?? null;
  if (!bracket) return null;
  return <BracketBar {...bracket} />;
}

export const usClientPlugin: CountryClientPlugin = {
  code: "us",
  name: "United States",
  flag: "🇺🇸",
  currency: "$",

  getYear: (r) => (r as TaxReturn).year,
  yearLabel: (year) => String(year),
  summaryLabel: "All time",

  components: {
    YearReceipt: ReceiptView as React.ComponentType<{ data: unknown }>,
    YearCharts: YearCharts as React.ComponentType<{ data: unknown }>,
    SummaryView: SummaryTable as React.ComponentType<{ returns: Record<number, unknown> }>,
    SummaryCharts: SummaryCharts as React.ComponentType<{ returns: Record<number, unknown> }>,
    SummaryReceipt: SummaryReceiptView as React.ComponentType<{
      returns: Record<number, unknown>;
    }>,
  },

  forecast: {
    ExtensionCard: UsBracketCard,
  },
};
