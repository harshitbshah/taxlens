import { useState } from "react";

import type { ActiveCountry, ForecastState } from "../App";
import { cn } from "../lib/cn";
import type { IndianTaxReturn, PendingUpload, TaxReturn } from "../lib/schema";
import { ForecastView } from "./ForecastView";
import { IndiaReceiptView } from "./IndiaReceiptView";
import { IndiaSummaryCharts } from "./IndiaSummaryCharts";
import { IndiaSummaryView } from "./IndiaSummaryView";
import { IndiaYearCharts } from "./IndiaYearCharts";
import { InsightsPanel } from "./InsightsPanel";
import { LoadingView } from "./LoadingView";
import { ReceiptView } from "./ReceiptView";
import { StatsHeader } from "./StatsHeader";
import { SummaryCharts } from "./SummaryCharts";
import { SummaryReceiptView } from "./SummaryReceiptView";
import { SummaryTable } from "./SummaryTable";
import { YearCharts } from "./YearCharts";

interface CommonProps {
  returns: Record<number, TaxReturn>;
  selectedYear: "summary" | "forecast" | number;
  activeCountry: ActiveCountry;
  indiaReturns: Record<number, IndianTaxReturn>;
}

interface ReceiptProps extends CommonProps {
  view: "receipt";
  data: TaxReturn;
  title: string;
}

interface SummaryProps extends CommonProps {
  view: "summary";
}

interface ForecastProps extends CommonProps {
  view: "forecast";
  forecastState: ForecastState;
  onGenerateForecast: (regenerate?: boolean) => Promise<void>;
  onToggleChat?: () => void;
}

interface LoadingProps extends CommonProps {
  view: "loading";
  pendingUpload: PendingUpload;
}

interface IndiaProps extends CommonProps {
  view: "india";
  financialYear: number;
}

type Props = ReceiptProps | SummaryProps | ForecastProps | LoadingProps | IndiaProps;

type SummaryViewMode = "table" | "receipt" | "charts";
type YearViewMode = "receipt" | "charts";

export function MainPanel(props: Props) {
  const [summaryViewMode, setSummaryViewMode] = useState<SummaryViewMode>("table");
  const [yearViewMode, setYearViewMode] = useState<YearViewMode>("receipt");
  const [indiaSummaryViewMode, setIndiaSummaryViewMode] = useState<"table" | "charts">("table");
  const [indiaYearViewMode, setIndiaYearViewMode] = useState<"receipt" | "charts">("receipt");

  return (
    <div className="flex h-screen flex-1 flex-col overflow-hidden bg-(--color-bg)">
      {/* Content */}
      {props.view === "loading" ? (
        <LoadingView
          filename={props.pendingUpload.filename}
          year={props.pendingUpload.year}
          status={props.pendingUpload.status}
        />
      ) : props.view === "india" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-1 border-b border-(--color-border) px-4 py-2">
            {(["receipt", "charts"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setIndiaYearViewMode(mode)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                  indiaYearViewMode === mode
                    ? "bg-(--color-bg-muted) text-(--color-text)"
                    : "text-(--color-text-muted) hover:text-(--color-text)",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          {indiaYearViewMode === "charts" ? (
            <div className="flex-1 overflow-y-auto bg-(--color-bg-subtle)">
              <IndiaYearCharts data={props.indiaReturns[props.financialYear]!} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto bg-neutral-50 dark:bg-neutral-950">
              <IndiaReceiptView data={props.indiaReturns[props.financialYear]!} />
            </div>
          )}
        </div>
      ) : props.view === "summary" && props.activeCountry === "india" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-1 border-b border-(--color-border) px-4 py-2">
            {(["table", "charts"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setIndiaSummaryViewMode(mode)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                  indiaSummaryViewMode === mode
                    ? "bg-(--color-bg-muted) text-(--color-text)"
                    : "text-(--color-text-muted) hover:text-(--color-text)",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          {indiaSummaryViewMode === "charts" ? (
            <div className="flex-1 overflow-y-auto bg-(--color-bg-subtle)">
              <IndiaSummaryCharts returns={props.indiaReturns} />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-hidden">
              <IndiaSummaryView returns={props.indiaReturns} />
            </div>
          )}
        </div>
      ) : props.view === "summary" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <StatsHeader returns={props.returns} selectedYear="summary" />
          <div className="flex shrink-0 items-center gap-1 border-b border-(--color-border) px-4 py-2">
            {(["table", "charts"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSummaryViewMode(mode)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                  summaryViewMode === mode
                    ? "bg-(--color-bg-muted) text-(--color-text)"
                    : "text-(--color-text-muted) hover:text-(--color-text)",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          {summaryViewMode === "charts" ? (
            <div className="flex-1 overflow-y-auto bg-(--color-bg-subtle)">
              <SummaryCharts returns={props.returns} />
            </div>
          ) : summaryViewMode === "table" ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <SummaryTable returns={props.returns} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <SummaryReceiptView returns={props.returns} />
            </div>
          )}
        </div>
      ) : props.view === "receipt" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <StatsHeader returns={props.returns} selectedYear={props.selectedYear as number} />
          <div className="flex shrink-0 items-center gap-1 border-b border-(--color-border) px-4 py-2">
            {(["receipt", "charts"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setYearViewMode(mode)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                  yearViewMode === mode
                    ? "bg-(--color-bg-muted) text-(--color-text)"
                    : "text-(--color-text-muted) hover:text-(--color-text)",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          {yearViewMode === "charts" ? (
            <div className="flex-1 overflow-y-auto bg-(--color-bg-subtle)">
              <YearCharts data={props.data} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto bg-neutral-50 dark:bg-neutral-950">
              <ReceiptView data={props.data} />
              <InsightsPanel
                year={props.selectedYear as number}
                indiaReturns={props.indiaReturns}
              />
            </div>
          )}
        </div>
      ) : props.view === "forecast" ? (
        <ForecastView
          returns={props.returns}
          forecastState={props.forecastState}
          onGenerate={props.onGenerateForecast}
          onToggleChat={props.onToggleChat}
        />
      ) : null}
    </div>
  );
}
