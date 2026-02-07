import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { usePriceHistory } from '../../hooks/usePriceHistory';

interface PriceHistoryChartProps {
  productId: string;
}

// Distinct colors for different retailer lines
const LINE_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#a855f7', // purple
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTooltipDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PriceHistoryChart({ productId }: PriceHistoryChartProps) {
  const { history, loading, error } = usePriceHistory(productId);

  // Group data by date and pivot retailers into columns
  const { chartData, retailers } = useMemo(() => {
    if (history.length === 0) return { chartData: [], retailers: [] };

    // Collect unique retailers
    const retailerSet = new Map<string, string>();
    for (const point of history) {
      if (!retailerSet.has(point.retailer_id)) {
        retailerSet.set(point.retailer_id, point.retailer_name);
      }
    }
    const retailers = Array.from(retailerSet.entries()).map(([id, name]) => ({ id, name }));

    // Group by date (day granularity)
    const byDate = new Map<string, Record<string, number | string>>();
    for (const point of history) {
      const dateKey = new Date(point.recorded_at).toISOString().split('T')[0];
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, { date: dateKey });
      }
      const entry = byDate.get(dateKey)!;
      // Use last price for that day per retailer
      entry[point.retailer_id] = point.price;
    }

    const chartData = Array.from(byDate.values()).sort((a, b) =>
      (a.date as string).localeCompare(b.date as string)
    );

    return { chartData, retailers };
  }, [history]);

  if (loading) {
    return (
      <div className="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-700 dark:bg-surface-900">
        <div className="mb-3 h-5 w-32 animate-pulse rounded bg-surface-200 dark:bg-surface-700" />
        <div className="h-48 animate-pulse rounded bg-surface-100 dark:bg-surface-800" />
      </div>
    );
  }

  if (error) {
    return null;
  }

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-700 dark:bg-surface-900">
        <h3 className="mb-2 text-base font-bold text-surface-900 dark:text-surface-100">
          Price History
        </h3>
        <p className="text-sm text-surface-500 dark:text-surface-400">
          No price history data available yet. Check back later as we track prices over time.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-700 dark:bg-surface-900">
      <h3 className="mb-4 text-base font-bold text-surface-900 dark:text-surface-100">
        Price History (Last 90 Days)
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            stroke="#4b5563"
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `$${v}`}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            stroke="#4b5563"
            tickLine={false}
            axisLine={false}
            width={60}
          />
          <Tooltip
            labelFormatter={(label) => formatTooltipDate(String(label))}
            formatter={(value, name) => [`$${Number(value).toFixed(2)}`, String(name)]}
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#f9fafb',
            }}
            itemStyle={{ color: '#f9fafb' }}
            labelStyle={{ color: '#9ca3af', marginBottom: '4px' }}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
          />
          {retailers.map((retailer, index) => (
            <Line
              key={retailer.id}
              type="monotone"
              dataKey={retailer.id}
              name={retailer.name}
              stroke={LINE_COLORS[index % LINE_COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
