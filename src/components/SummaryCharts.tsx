import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCompact, formatCurrency } from "../lib/format";
import type { AllRetirementAccounts } from "../lib/retirement-accounts-schema";
import { netGainLoss } from "../lib/retirement-accounts-schema";
import type { TaxReturn } from "../lib/schema";
import { getNetIncome, getTotalTax } from "../lib/tax-calculations";

interface Props {
  returns: Record<number, TaxReturn>;
  retirementAccounts?: AllRetirementAccounts;
}

const COLORS = {
  income: "#4a90d9",
  taxes: "#e05c5c",
  net: "#52b788",
  rate: "#f4a261",
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-bg) p-5">
      <div className="mb-4 text-sm font-medium text-(--color-text-secondary)">{title}</div>
      {children}
    </div>
  );
}

const tooltipStyle: React.CSSProperties = {
  background: "var(--color-bg-elevated)",
  border: "1px solid var(--color-border-opaque)",
  borderRadius: "8px",
  color: "var(--color-text)",
  fontSize: "12px",
  padding: "8px 12px",
};

interface GainLossBarChartProps {
  title: string;
  data: Array<{ year: string; value: number }>;
  positiveLabel: string;
  negativeLabel?: string;
  footerText?: string;
  showLegend?: boolean;
}

function GainLossBarChart({
  title,
  data,
  positiveLabel,
  negativeLabel,
  footerText,
  showLegend = false,
}: GainLossBarChartProps) {
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barCategoryGap="40%">
          <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="year"
            tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatCompact}
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <ReferenceLine y={0} stroke="var(--color-border-opaque)" strokeWidth={1} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v) => {
              const n = Number(v);
              return [
                formatCurrency(n, true),
                n >= 0 ? positiveLabel : (negativeLabel ?? positiveLabel),
              ];
            }}
            cursor={{ fill: "var(--color-bg-muted)" }}
          />
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            fill={COLORS.net}
            isAnimationActive={false}
            activeBar={{ fillOpacity: 0.8 }}
          >
            {data.map((entry) => (
              <Cell key={entry.year} fill={entry.value >= 0 ? COLORS.net : COLORS.taxes} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {showLegend && (
        <div className="mt-3 flex gap-5">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ background: COLORS.net }} />
            <span className="text-xs text-(--color-text-muted)">{positiveLabel}</span>
          </div>
          {negativeLabel && (
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ background: COLORS.taxes }} />
              <span className="text-xs text-(--color-text-muted)">{negativeLabel}</span>
            </div>
          )}
        </div>
      )}
      {footerText && <p className="mt-2 text-xs text-(--color-text-muted)">{footerText}</p>}
    </ChartCard>
  );
}

export function SummaryCharts({ returns, retirementAccounts }: Props) {
  const years = Object.keys(returns)
    .map(Number)
    .sort((a, b) => a - b);

  if (years.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-(--color-text-muted)">
        Upload at least 2 years to see trends
      </div>
    );
  }

  const useStacked = years.length > 5;

  const incomeData = years.map((year) => {
    const r = returns[year]!;
    return {
      year: String(year),
      Income: r.income.total,
      Taxes: getTotalTax(r),
      Net: getNetIncome(r),
    };
  });

  const rateData = years.map((year) => {
    const r = returns[year]!;
    const federal = r.rates?.federal?.effective ?? (r.federal.tax / r.income.total) * 100;
    const combined = r.rates?.combined?.effective ?? (getTotalTax(r) / r.income.total) * 100;
    return {
      year: String(year),
      Federal: parseFloat(federal.toFixed(1)),
      Combined: parseFloat(combined.toFixed(1)),
    };
  });

  const refundData = years.map((year) => ({
    year: String(year),
    value: returns[year]!.summary.netPosition,
  }));

  const capGainsData = years.map((year) => ({
    year: String(year),
    value: returns[year]!.income.items.filter((item) => /capital gain/i.test(item.label)).reduce(
      (sum, item) => sum + item.amount,
      0,
    ),
  }));
  const hasCapGains = capGainsData.some((d) => d.value !== 0);

  const retirementData = retirementAccounts
    ? years
        .map((year) => {
          const accounts = retirementAccounts[year];
          if (!accounts || accounts.length === 0) return null;
          return {
            year: String(year),
            value: accounts.reduce((sum, a) => sum + netGainLoss(a), 0),
          };
        })
        .filter((d): d is { year: string; value: number } => d !== null)
    : [];

  return (
    <div className="space-y-4 p-6">
      {/* Income / Taxes / Net */}
      <ChartCard title={`Income, Taxes & Net${useStacked ? " (stacked)" : ""}`}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={incomeData} barCategoryGap={useStacked ? "35%" : "30%"} barGap={4}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="year"
              tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatCompact}
              tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => [formatCurrency(Number(value)), name]}
              cursor={{ fill: "var(--color-bg-muted)" }}
            />
            <Bar
              dataKey="Income"
              fill={COLORS.income}
              stackId={useStacked ? "a" : undefined}
              radius={useStacked ? undefined : [4, 4, 0, 0]}
            />
            <Bar
              dataKey="Taxes"
              fill={COLORS.taxes}
              stackId={useStacked ? "a" : undefined}
              radius={useStacked ? undefined : [4, 4, 0, 0]}
            />
            <Bar
              dataKey="Net"
              fill={COLORS.net}
              stackId={useStacked ? "a" : undefined}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 flex gap-5">
          {(["Income", "Taxes", "Net"] as const).map((k) => (
            <div key={k} className="flex items-center gap-1.5">
              <div
                className="h-2 w-2 rounded-full"
                style={{ background: COLORS[k.toLowerCase() as keyof typeof COLORS] }}
              />
              <span className="text-xs text-(--color-text-muted)">{k}</span>
            </div>
          ))}
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Effective Tax Rate Trend */}
        <ChartCard title="Effective Tax Rate">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={rateData}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="year"
                tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [`${value}%`, String(name)]}
                cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
              />
              <Line
                dataKey="Federal"
                stroke={COLORS.income}
                strokeWidth={2}
                dot={{ r: 3, fill: COLORS.income }}
                activeDot={{ r: 5 }}
              />
              <Line
                dataKey="Combined"
                stroke={COLORS.taxes}
                strokeWidth={2}
                dot={{ r: 3, fill: COLORS.taxes }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-3 flex gap-5">
            {(["Federal", "Combined"] as const).map((k) => (
              <div key={k} className="flex items-center gap-1.5">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ background: k === "Federal" ? COLORS.income : COLORS.taxes }}
                />
                <span className="text-xs text-(--color-text-muted)">{k}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* Refund / Owed */}
        <GainLossBarChart
          title="Refund / Owed"
          data={refundData}
          positiveLabel="Refund"
          negativeLabel="Owed"
          showLegend
        />
      </div>

      {/* Capital Gains — full width, only shown when at least one year has data */}
      {hasCapGains && (
        <GainLossBarChart
          title="Capital Gains (Schedule D)"
          data={capGainsData}
          positiveLabel="Gain"
          negativeLabel="Loss"
        />
      )}

      {/* Tax-Advantaged Account P&L — full width, only shown when data exists */}
      {retirementData.length > 0 && (
        <GainLossBarChart
          title="Tax-Advantaged Account P&L"
          data={retirementData}
          positiveLabel="Net P&L"
          footerText="Realized gains/losses not reported on tax returns"
        />
      )}
    </div>
  );
}
