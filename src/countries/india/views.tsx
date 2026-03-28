import { IndiaReceiptView } from "../../components/IndiaReceiptView";
import { IndiaRegimeCard } from "../../components/IndiaRegimeCard";
import { IndiaSummaryCharts } from "../../components/IndiaSummaryCharts";
import { IndiaSummaryView } from "../../components/IndiaSummaryView";
import { IndiaYearCharts } from "../../components/IndiaYearCharts";
import type { CountryClientPlugin } from "../../lib/country-registry";
import type { ForecastResponse } from "../../lib/forecaster";
import type { IndianTaxReturn } from "../../lib/schema";

function IndiaForecastCard({ data }: { data: unknown }) {
  const india = (data as ForecastResponse["india"]) ?? null;
  if (!india) return null;
  return <IndiaRegimeCard india={india} />;
}

export const indiaClientPlugin: CountryClientPlugin = {
  code: "india",
  name: "India",
  flag: "🇮🇳",
  currency: "₹",

  getYear: (r) => (r as IndianTaxReturn).financialYear,
  yearLabel: (fy) => `FY ${fy}-${String(fy + 1).slice(-2)}`,
  summaryLabel: "All years",

  components: {
    YearReceipt: IndiaReceiptView as React.ComponentType<{ data: unknown }>,
    YearCharts: IndiaYearCharts as React.ComponentType<{ data: unknown }>,
    SummaryView: IndiaSummaryView as React.ComponentType<{ returns: Record<number, unknown> }>,
    SummaryCharts: IndiaSummaryCharts as React.ComponentType<{
      returns: Record<number, unknown>;
    }>,
  },

  forecast: {
    ExtensionCard: IndiaForecastCard,
  },
};
