'use client';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, RadialBar, RadialBarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, PolarAngleAxis, Area, AreaChart,
} from 'recharts';

export const PALETTE = ['#0D3B3B', '#D4A843', '#2E8B7A', '#C8553D', '#6A8CAF', '#8F7BB3', '#9AA5A0'];
const axis = { fontSize: 12, fill: '#4A5B5B' };

export function BarCard({ data, x, bars, height = 260, stacked = false, money = false, horizontal = false }: {
  data: Record<string, any>[]; x: string; bars: { key: string; label?: string; color?: string }[];
  height?: number; stacked?: boolean; money?: boolean; horizontal?: boolean;
}) {
  const fmt = (v: any) => (money ? `KES ${Number(v).toLocaleString('en-KE')}` : v);
  return (
    <div style={{ height }} role="img" aria-label="Bar chart">
      <ResponsiveContainer>
        <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: horizontal ? 24 : 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E3ECE9" vertical={horizontal} horizontal={!horizontal} />
          {horizontal && <XAxis type="number" allowDecimals={false} tick={axis} />}
          {horizontal && <YAxis type="category" dataKey={x} tick={axis} width={130} />}
          {!horizontal && <XAxis dataKey={x} tick={axis} />}
          {!horizontal && <YAxis allowDecimals={false} tick={axis} tickFormatter={(v) => String(money && v >= 1000 ? `${v / 1000}k` : v)} />}
          <Tooltip formatter={fmt as any} cursor={{ fill: '#F5FAF8' }} />
          {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {bars.map((b, i) => (
            <Bar key={b.key} isAnimationActive={false} dataKey={b.key} name={b.label ?? b.key} fill={b.color ?? PALETTE[i % PALETTE.length]}
              stackId={stacked ? 'a' : undefined} radius={stacked ? 0 : [4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PieCard({ data, height = 240, money = false, donut = true }: {
  data: { name: string; value: number; color?: string }[]; height?: number; money?: boolean; donut?: boolean;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ height }} role="img" aria-label="Pie chart">
      <ResponsiveContainer>
        <PieChart>
          <Pie isAnimationActive={false} data={data} dataKey="value" nameKey="name" innerRadius={donut ? '55%' : 0} outerRadius="85%" paddingAngle={2} stroke="#fff">
            {data.map((d, i) => <Cell key={d.name} fill={d.color ?? PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip formatter={((v: any, n: any) => [money ? `KES ${Number(v).toLocaleString('en-KE')} (${total ? Math.round((v / total) * 100) : 0}%)` : `${v} (${total ? Math.round((v / total) * 100) : 0}%)`, n]) as any} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineCard({ data, x, lines, height = 240, money = false, area = false }: {
  data: Record<string, any>[]; x: string; lines: { key: string; label?: string; color?: string }[]; height?: number; money?: boolean; area?: boolean;
}) {
  const Chart: any = area ? AreaChart : LineChart;
  return (
    <div style={{ height }} role="img" aria-label="Line chart">
      <ResponsiveContainer>
        <Chart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E3ECE9" />
          <XAxis dataKey={x} tick={axis} /><YAxis tick={axis} tickFormatter={(v: number) => String(money && v >= 1000 ? `${v / 1000}k` : v)} />
          <Tooltip formatter={((v: any) => (money ? `KES ${Number(v).toLocaleString('en-KE')}` : v)) as any} />
          {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {lines.map((l, i) => area
            ? <Area key={l.key} type="monotone" dataKey={l.key} name={l.label ?? l.key} stroke={l.color ?? PALETTE[i]} fill={l.color ?? PALETTE[i]} fillOpacity={0.15} strokeWidth={2} />
            : <Line isAnimationActive={false} key={l.key} type="monotone" dataKey={l.key} name={l.label ?? l.key} stroke={l.color ?? PALETTE[i]} strokeWidth={2.5} dot={{ r: 3 }} />)}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}

/** Radial gauge for a percentage against an optional target (for example survival 75%). */
export function Gauge({ value, target, label, color = '#0D3B3B', size = 190 }: { value: number; target?: number; label?: string; color?: string; size?: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }} role="img" aria-label={`${label ?? 'Gauge'} ${v}%`}>
      <ResponsiveContainer>
        <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ v }]} startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar isAnimationActive={false} dataKey="v" cornerRadius={12} fill={color} background={{ fill: '#E3ECE9' }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-3xl font-bold text-teal">{v}%</div>
        {label && <div className="text-xs text-slate-600 px-6 leading-tight">{label}</div>}
        {target != null && <div className="text-[11px] text-gold-600 mt-0.5">target {target}%</div>}
      </div>
    </div>
  );
}
