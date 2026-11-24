"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";

type Point = {
  checkedAt: Date | string | number | null;
  price: number | null;
};

export function PriceChart({ history }: { history: Point[] }) {
  const gradientId = useId().replace(/:/g, "");
  const data = history
    .filter((h) => h.price != null)
    .map((h) => {
      const d =
        h.checkedAt instanceof Date
          ? h.checkedAt
          : h.checkedAt
            ? new Date(h.checkedAt)
            : null;
      return {
        label: d && !Number.isNaN(d.getTime()) ? format(d, "h:mm a") : "",
        full:
          d && !Number.isNaN(d.getTime())
            ? format(d, "MMM d, yyyy h:mm a")
            : "",
        price: h.price as number,
      };
    });

  if (data.length < 2) {
    return (
      <div className="flex h-36 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50/40 text-sm text-slate-400">
        {data.length === 1
          ? "Need another check for a chart"
          : "No price history yet"}
      </div>
    );
  }

  const prices = data.map((d) => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = Math.max((max - min) * 0.15, 1);

  return (
    <div className="h-36 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.28} />
              <stop offset="55%" stopColor="#06b6d4" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`${gradientId}-stroke`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4f46e5" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[min - pad, max + pad]}
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 14,
              border: "1px solid rgba(79,70,229,0.12)",
              boxShadow: "0 12px 30px rgba(15,23,42,0.1)",
              fontSize: 13,
              background: "rgba(255,255,255,0.95)",
            }}
            formatter={(value) => [
              `$${Number(value).toFixed(2)}`,
              "Price",
            ]}
            labelFormatter={(_, payload) =>
              (payload?.[0]?.payload as { full?: string } | undefined)?.full ??
              ""
            }
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke={`url(#${gradientId}-stroke)`}
            strokeWidth={2.5}
            fill={`url(#${gradientId}-fill)`}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 5, fill: "#4f46e5", stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
