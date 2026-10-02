import { useEffect, useState } from "react";
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

import type { CountryCosts } from "../lib/filing-costs-schema";
import { formatINR, formatINRCompact } from "../lib/format";
import type { IndianTaxReturn } from "../lib/schema";

interface Props {
  returns: Record<number, IndianTaxReturn>;
}

const COLORS = {
  income: "#4a90d9",
  tax: "#e05c5c",
  stcg: "#f4a261",
  ltcg: "#e9c46a",
  refund: "#52b788",
  due: "#e05c5c",
  rate: "#9b89c4",
};

// Fixed palette for compliance charge categories; extra labels fall back to gray shades.
const COMPLIANCE_PALETTE: Record<string, string> = {
  Brokerage: "#4a90d9",
  STT: "#e05c5c",
  GST: "#9b89c4",
  "Exchange Charges": "#f4a261",
  "DP Charges": "#52b788",
  "Demat AMC": "#e9c46a",
  "Smallcase Fees": "#2ec4b6",
  "Account Opening Fee": "#ff9f1c",
  Other: "#94a3b8",
};

const GRAY_SHADES = ["#64748b", "#78716c", "#6b7280", "#71717a"];

function complianceColor(label: string, fallbackIdx: number): string {
  return COMPLIANCE_PALETTE[label] ?? GRAY_SHADES[fallbackIdx % GRAY_SHADES.length] ?? "#94a3b8";
}

const tooltipStyle: React.CSSProperties = {
  background: "var(--color-bg-elevated)",
  border: "1px solid var(--color-border-opaque)",
  borderRadius: "8px",
  color: "var(--color-text)",
  fontSize: "12px",
  padding: "8px 12px",
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-bg) p-5">
      <div className="mb-4 text-sm font-medium text-(--color-text-secondary)">{title}</div>
      {children}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mt-3 flex gap-5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full" style={{ background: item.color }} />
          <span className="text-xs text-(--color-text-muted)">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

interface ComplianceTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill: string }>;
  label?: string;
}

function ComplianceTooltip({ active, payload, label }: ComplianceTooltipProps) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div style={tooltipStyle} className="min-w-44">
      <div className="mb-2 font-medium">{label}</div>
      {[...payload].reverse().map((p) =>
        p.value > 0 ? (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ background: p.fill }} />
              <span className="text-(--color-text-muted)">{p.name}</span>
            </div>
            <span className="tabular-nums">{formatINR(p.value)}</span>
          </div>
        ) : null,
      )}
      <div className="mt-2 flex justify-between border-t border-(--color-border) pt-2 font-medium">
        <span>Total</span>
        <span className="tabular-nums">{formatINR(total)}</span>
      </div>
    </div>
  );
}

export function IndiaSummaryCharts({ returns }: Props) {
  const [costs, setCosts] = useState<Record<number, CountryCosts>>({});

  useEffect(() => {
    fetch("/api/filing-costs?country=india")
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setCosts(data as Record<number, CountryCosts>))
      .catch(() => {});
  }, []);

  const years = Object.keys(returns)
    .map(Number)
    .sort((a, b) => a - b);

  if (years.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-(--color-text-muted)">
        Add at least 2 years to see trends
      </div>
    );
  }

  const fyLabel = (fy: number) => `FY ${String(fy).slice(-2)}-${String(fy + 1).slice(-2)}`;

  // Income + Tax liability trend
  const incomeTaxData = years.map((fy) => {
    const r = returns[fy]!;
    return {
      year: fyLabel(fy),
      "Gross Income": r.income.grossTotal,
      "Tax Liability": r.tax.totalTaxLiability,
    };
  });

  // Capital gains trend (ITR-2 years only)
  const cgYears = years.filter((fy) => returns[fy]!.itrForm !== "ITR-1");
  const cgData = cgYears.map((fy) => {
    const r = returns[fy]!;
    return {
      year: fyLabel(fy),
      STCG: r.income.capitalGains.stcg.total,
      LTCG: r.income.capitalGains.ltcg.total,
    };
  });

  // Effective tax rate trend (tax liability / taxable income)
  const rateData = years.map((fy) => {
    const r = returns[fy]!;
    const rate =
      r.taxableIncome > 0
        ? parseFloat(((r.tax.totalTaxLiability / r.taxableIncome) * 100).toFixed(1))
        : 0;
    return { year: fyLabel(fy), "Effective Rate": rate };
  });

  // Refund / Due trend
  const refundData = years.map((fy) => {
    const r = returns[fy]!;
    return { year: fyLabel(fy), amount: r.tax.refundOrDue };
  });

  // Compliance chart data — built once, used in the grid below.
  const allComplianceLabels: string[] = [];
  years.forEach((fy) => {
    costs[fy]?.charges?.forEach(({ label }) => {
      if (!allComplianceLabels.includes(label)) allComplianceLabels.push(label);
    });
  });
  const complianceData = years.map((fy) => {
    const entry: Record<string, string | number> = { year: fyLabel(fy) };
    costs[fy]?.charges?.forEach(({ label, amount }) => {
      entry[label] = amount;
    });
    return entry;
  });
  const hasComplianceData = allComplianceLabels.length > 0;

  return (
    <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
      {/* Income & Tax Liability — full width */}
      <div className="md:col-span-2">
        <ChartCard title="Gross Income & Tax Liability">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={incomeTaxData} barCategoryGap="30%" barGap={4}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="year"
                tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatINRCompact(Number(v))}
                tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [formatINR(Number(value)), String(name)]}
                cursor={{ fill: "var(--color-bg-muted)" }}
              />
              <Bar dataKey="Gross Income" fill={COLORS.income} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Tax Liability" fill={COLORS.tax} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <Legend
            items={[
              { label: "Gross Income", color: COLORS.income },
              { label: "Tax Liability", color: COLORS.tax },
            ]}
          />
        </ChartCard>
      </div>

      {/* Capital Gains trend — half width (only when ITR-2 data available) */}
      {cgData.length >= 2 && (
        <ChartCard title="Capital Gains Trend (ITR-2 years)">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={cgData}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="year"
                tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatINRCompact(Number(v))}
                tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <ReferenceLine y={0} stroke="var(--color-border-opaque)" strokeWidth={1} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [formatINR(Number(value)), String(name)]}
                cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
              />
              <Line
                dataKey="STCG"
                stroke={COLORS.stcg}
                strokeWidth={2}
                dot={{ r: 3, fill: COLORS.stcg }}
                activeDot={{ r: 5 }}
              />
              <Line
                dataKey="LTCG"
                stroke={COLORS.ltcg}
                strokeWidth={2}
                dot={{ r: 3, fill: COLORS.ltcg }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <Legend
            items={[
              { label: "STCG", color: COLORS.stcg },
              { label: "LTCG", color: COLORS.ltcg },
            ]}
          />
        </ChartCard>
      )}

      {/* Effective Tax Rate — half width (full width when no CG chart) */}
      <div className={cgData.length < 2 ? "md:col-span-2" : undefined}>
        <ChartCard title="Effective Tax Rate">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={rateData}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="year"
                tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
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
                formatter={(value) => [`${value}%`, "Effective Rate"]}
                cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
              />
              <Line
                dataKey="Effective Rate"
                stroke={COLORS.rate}
                strokeWidth={2}
                dot={{ r: 3, fill: COLORS.rate }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Refund / Due — half width */}
      <ChartCard title="Refund / Tax Due">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={refundData} barCategoryGap="40%">
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="year"
              tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => formatINRCompact(Number(v))}
              tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <ReferenceLine y={0} stroke="var(--color-border-opaque)" strokeWidth={1} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value) => {
                const n = Number(value);
                return [formatINR(n, true), n >= 0 ? "Refund" : "Tax Due"];
              }}
              cursor={{ fill: "var(--color-bg-muted)" }}
            />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
              {refundData.map((entry) => (
                <Cell key={entry.year} fill={entry.amount >= 0 ? COLORS.refund : COLORS.due} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <Legend
          items={[
            { label: "Refund", color: COLORS.refund },
            { label: "Tax Due", color: COLORS.due },
          ]}
        />
      </ChartCard>

      {/* Cost of Compliance — half width alongside Refund; full width if no data yet */}
      {hasComplianceData && (
        <ChartCard title="Cost of Compliance — Zerodha Charges">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={complianceData} barCategoryGap="35%">
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="year"
                tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatINRCompact(Number(v))}
                tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip content={<ComplianceTooltip />} cursor={{ fill: "var(--color-bg-muted)" }} />
              {allComplianceLabels.map((label, i) => (
                <Bar
                  key={label}
                  dataKey={label}
                  stackId="compliance"
                  fill={complianceColor(label, i)}
                  radius={i === allComplianceLabels.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {allComplianceLabels.map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ background: complianceColor(label, i) }}
                />
                <span className="text-xs text-(--color-text-muted)">{label}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  );
}
