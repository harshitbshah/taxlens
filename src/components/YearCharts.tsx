import { ResponsiveBar } from "@nivo/bar";
import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { formatCurrency } from "../lib/format";
import type { TaxReturn } from "../lib/schema";
import { getTotalTax } from "../lib/tax-calculations";
import { BracketVisualizer } from "./BracketVisualizer";
import { WhatIfSimulator } from "./WhatIfSimulator";

interface Props {
  data: TaxReturn;
}

const INCOME_COLORS = ["#4a90d9", "#52b788", "#f4a261", "#e9c46a", "#9b89c4", "#aaa"];

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

export function YearCharts({ data }: Props) {
  const [whatIfDelta, setWhatIfDelta] = useState(0);

  // Reset simulator when navigating to a different year
  useEffect(() => {
    setWhatIfDelta(0);
  }, [data.year]);

  const adjustedTaxableIncome =
    whatIfDelta !== 0 ? Math.max(0, data.federal.taxableIncome + whatIfDelta) : undefined;

  // Income breakdown donut
  const incomeItems = data.income.items
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const donutData = incomeItems.map((item) => ({
    name: item.label,
    value: item.amount,
  }));

  // Waterfall: Income → Federal → States → Net
  const federalTax =
    data.federal.tax + data.federal.additionalTaxes.reduce((s, t) => s + t.amount, 0);
  const stateTax = data.states.reduce((s, st) => s + st.tax, 0);
  const net = data.income.total - getTotalTax(data);

  // Nivo waterfall via stacked bar trick:
  // Each bar = [invisible base (offset), visible portion]
  // We use "value" for the visible bar and "offset" as the invisible stack beneath it
  const waterfallData = [
    {
      label: "Income",
      offset: 0,
      value: data.income.total,
      positive: true,
    },
    {
      label: "Federal Tax",
      offset: net + stateTax,
      value: federalTax,
      positive: false,
    },
    {
      label: "State Tax",
      offset: net,
      value: stateTax,
      positive: false,
    },
    {
      label: "Net",
      offset: 0,
      value: net,
      positive: true,
    },
  ];

  // Nivo BarDatum requires string | number values only
  const nivoData = waterfallData.map((d) => ({
    label: d.label,
    offset: d.offset,
    value: d.value,
    isPositive: d.positive ? 1 : 0, // store as number for Nivo type compat
  }));

  return (
    <div className="space-y-4 p-6">
      <BracketVisualizer data={data} adjustedTaxableIncome={adjustedTaxableIncome} />
      <WhatIfSimulator data={data} onDeltaChange={setWhatIfDelta} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Income breakdown donut */}
        <ChartCard title="Income Breakdown">
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={72}
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {donutData.map((_, i) => (
                    <Cell key={i} fill={INCOME_COLORS[i % INCOME_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [formatCurrency(Number(value)), ""]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2">
              {donutData.map((item, i) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: INCOME_COLORS[i % INCOME_COLORS.length] }}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-xs text-(--color-text)">{item.name}</div>
                    <div className="text-xs text-(--color-text-muted)">
                      {formatCurrency(item.value)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        {/* Waterfall */}
        <ChartCard title="Where Your Money Goes">
          <div style={{ height: 200 }}>
            <ResponsiveBar
              data={nivoData}
              keys={["offset", "value"]}
              indexBy="label"
              margin={{ top: 10, right: 10, bottom: 30, left: 60 }}
              padding={0.35}
              valueScale={{ type: "linear" }}
              colors={({ id, data }) => {
                if (id === "offset") return "transparent";
                return data.isPositive === 1 ? "#52b788" : "#e05c5c";
              }}
              borderRadius={4}
              axisLeft={{
                tickSize: 0,
                tickPadding: 8,
                format: (v) => {
                  const n = Number(v);
                  return n === 0 ? "$0" : `$${Math.round(n / 1000)}K`;
                },
                tickValues: 4,
              }}
              axisBottom={{
                tickSize: 0,
                tickPadding: 8,
              }}
              enableLabel={false}
              enableGridX={false}
              gridYValues={4}
              theme={{
                grid: {
                  line: {
                    stroke: "var(--color-border)",
                    strokeDasharray: "3 3",
                  },
                },
                axis: {
                  ticks: {
                    text: {
                      fill: "var(--color-text-muted)",
                      fontSize: 11,
                    },
                  },
                },
                tooltip: {
                  container: tooltipStyle,
                },
              }}
              tooltip={({ id, data: d }) => {
                if (id === "offset") return null as unknown as React.ReactElement;
                return (
                  <div style={tooltipStyle}>
                    <span className="font-medium">{d.label}</span>
                    <br />
                    {formatCurrency(d.value as number)}
                  </div>
                );
              }}
            />
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
