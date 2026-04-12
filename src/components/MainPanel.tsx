import { useState } from "react";

import type { ForecastState } from "../App";
import { CLIENT_REGISTRY } from "../countries/views";
import { cn } from "../lib/cn";
import type { ForecastProfile } from "../lib/forecast-profile-schema";
import type {
  AllRetirementAccounts,
  RetirementAccountsYear,
} from "../lib/retirement-accounts-schema";
import type { IndianTaxReturn, PendingUpload, TaxReturn } from "../lib/schema";
import { AnalysisPanel } from "./AnalysisPanel";
import { ForecastView } from "./ForecastView";
import { InsightsPanel } from "./InsightsPanel";
import { LoadingView } from "./LoadingView";
import { RetirementAccountsSection } from "./RetirementAccountsSection";
import { SummaryCharts } from "./SummaryCharts";
import { SummaryTable } from "./SummaryTable";

interface CommonProps {
  activeCountry: string;
  activeReturns: Record<number, unknown>;
  indiaReturns: Record<number, IndianTaxReturn>;
  selectedYear: "summary" | "forecast" | number;
}

interface ReceiptProps extends CommonProps {
  view: "receipt";
  title: string;
  retirementAccounts?: AllRetirementAccounts;
  onSaveRetirementAccounts?: (year: number, accounts: RetirementAccountsYear) => Promise<void>;
}

interface SummaryProps extends CommonProps {
  view: "summary";
  retirementAccounts?: AllRetirementAccounts;
  onSaveRetirementAccounts?: (year: number, accounts: RetirementAccountsYear) => Promise<void>;
}

interface ForecastProps extends CommonProps {
  view: "forecast";
  forecastState: ForecastState;
  onGenerateForecast: (regenerate?: boolean) => Promise<void>;
  onToggleChat?: () => void;
  forecastProfile: ForecastProfile | null;
  onSaveProfile: (profile: ForecastProfile) => Promise<void>;
}

interface LoadingProps extends CommonProps {
  view: "loading";
  pendingUpload: PendingUpload;
}

type Props = ReceiptProps | SummaryProps | ForecastProps | LoadingProps;

type SummaryViewMode = "table" | "receipt" | "charts";
type YearViewMode = "receipt" | "charts" | "analysis";

export function MainPanel(props: Props) {
  const [summaryViewMode, setSummaryViewMode] = useState<SummaryViewMode>("table");
  const [yearViewMode, setYearViewMode] = useState<YearViewMode>("receipt");

  const plugin = CLIENT_REGISTRY[props.activeCountry];
  const isUs = props.activeCountry === "us";
  const usReturns = props.activeReturns as Record<number, TaxReturn>;

  return (
    <div className="flex h-screen flex-1 flex-col overflow-hidden bg-(--color-bg)">
      {props.view === "loading" ? (
        <LoadingView
          filename={props.pendingUpload.filename}
          year={props.pendingUpload.year}
          status={props.pendingUpload.status}
        />
      ) : props.view === "summary" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {plugin?.components.StatsHeader && (
            <plugin.components.StatsHeader returns={props.activeReturns} selectedYear="summary" />
          )}
          <div className="flex shrink-0 items-center gap-1 border-b border-(--color-border) px-4 py-2">
            {(
              [
                "table",
                "charts",
                ...(plugin?.components.SummaryReceipt ? ["receipt" as const] : []),
              ] as SummaryViewMode[]
            ).map((mode) => (
              <button
                key={mode}
                onClick={() => setSummaryViewMode(mode)}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                  summaryViewMode === mode
                    ? "bg-(--color-bg-muted) text-(--color-text)"
                    : "text-(--color-text-muted) hover:text-(--color-text)",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          {summaryViewMode === "charts" && plugin?.components.SummaryCharts ? (
            <div className="flex-1 overflow-y-auto bg-(--color-bg-subtle)">
              {isUs ? (
                <SummaryCharts returns={usReturns} retirementAccounts={props.retirementAccounts} />
              ) : (
                <plugin.components.SummaryCharts returns={props.activeReturns} />
              )}
            </div>
          ) : summaryViewMode === "receipt" && plugin?.components.SummaryReceipt ? (
            <div className="flex-1 overflow-y-auto">
              <plugin.components.SummaryReceipt returns={props.activeReturns} />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-hidden">
              {isUs ? (
                <SummaryTable returns={usReturns} retirementAccounts={props.retirementAccounts} />
              ) : (
                plugin?.components.SummaryView && (
                  <plugin.components.SummaryView returns={props.activeReturns} />
                )
              )}
            </div>
          )}
        </div>
      ) : props.view === "receipt" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {plugin?.components.StatsHeader && (
            <plugin.components.StatsHeader
              returns={props.activeReturns}
              selectedYear={props.selectedYear as number}
            />
          )}
          <div className="flex shrink-0 items-center gap-1 border-b border-(--color-border) px-4 py-2">
            {(["receipt", "charts", "analysis"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setYearViewMode(mode)}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                  yearViewMode === mode
                    ? "bg-(--color-bg-muted) text-(--color-text)"
                    : "text-(--color-text-muted) hover:text-(--color-text)",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          {yearViewMode === "analysis" ? (
            <div className="flex-1 overflow-y-auto">
              <AnalysisPanel
                year={props.selectedYear as number}
                country={props.activeCountry}
                returnData={props.activeReturns[props.selectedYear as number]}
              />
            </div>
          ) : yearViewMode === "charts" ? (
            <div className="flex-1 overflow-y-auto bg-(--color-bg-subtle)">
              {plugin?.components.YearCharts && (
                <plugin.components.YearCharts
                  data={props.activeReturns[props.selectedYear as number]}
                />
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto bg-neutral-50 dark:bg-neutral-950">
              {plugin?.components.YearReceipt && (
                <plugin.components.YearReceipt
                  data={props.activeReturns[props.selectedYear as number]}
                />
              )}
              {isUs && (
                <InsightsPanel
                  year={props.selectedYear as number}
                  indiaReturns={props.indiaReturns}
                />
              )}
              {isUs && props.onSaveRetirementAccounts && (
                <RetirementAccountsSection
                  year={props.selectedYear as number}
                  accounts={props.retirementAccounts?.[props.selectedYear as number] ?? null}
                  onSave={(accounts) =>
                    props.onSaveRetirementAccounts!(props.selectedYear as number, accounts)
                  }
                />
              )}
            </div>
          )}
        </div>
      ) : props.view === "forecast" ? (
        <ForecastView
          returns={props.activeReturns}
          forecastState={props.forecastState}
          onGenerate={props.onGenerateForecast}
          onToggleChat={props.onToggleChat}
          activeCountry={props.activeCountry}
          currency={plugin?.currency ?? "$"}
          forecastProfile={props.forecastProfile}
          onSaveProfile={props.onSaveProfile}
        />
      ) : null}
    </div>
  );
}
