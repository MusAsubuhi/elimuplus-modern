import type { ReactNode } from 'react';

/** Infographic building blocks: plain SVG and CSS, rendered on the server, no chart library. Used by the public impact page and the founders' feedback page. */
export const C = { teal: '#0D3B3B', teal2: '#145252', gold: '#D4A843', green: '#2E8B7A', clay: '#C8553D', blue: '#6A8CAF', plum: '#8F7BB3', mist: '#EAF4F1', grey: '#CFDAD6', ink: '#1B2A2A' };

/** Keyframes used by the pieces below. Render once per page. */
export function InfographicStyles() {
  return (
    <style>{`
      @keyframes igRing{from{stroke-dashoffset:var(--len)}}
      @keyframes igGrow{from{transform:scaleX(0)}}
      @keyframes igRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
      @keyframes igPop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}
      .ig-ring{animation:igRing 1.2s cubic-bezier(.2,.7,.2,1) both}
      .ig-bar{transform-origin:left;animation:igGrow .9s cubic-bezier(.2,.7,.2,1) both}
      .ig-rise{animation:igRise .7s ease-out both}
      .ig-pop{animation:igPop .45s ease-out both}
      @media (prefers-reduced-motion:reduce){.ig-ring,.ig-bar,.ig-rise,.ig-pop{animation:none}}
    `}</style>
  );
}

export const fmt = (n: number) => n.toLocaleString('en-KE');

/** One big number with a label, on a coloured tile. */
export function Tile({ value, label, sub, tone = 'teal' }: { value: ReactNode; label: string; sub?: ReactNode; tone?: 'teal' | 'gold' | 'green' | 'clay' | 'light' }) {
  const bg = { teal: 'bg-gradient-to-br from-[#0D3B3B] to-[#1B6666] text-white', gold: 'bg-gradient-to-br from-[#D4A843] to-[#E6C16A] text-[#0D3B3B]', green: 'bg-gradient-to-br from-[#2E8B7A] to-[#47A894] text-white', clay: 'bg-gradient-to-br from-[#C8553D] to-[#DE7A5E] text-white', light: 'bg-white text-[#0D3B3B] border border-teal-100' }[tone];
  return (
    <div className={`ig-rise rounded-2xl p-5 shadow-sm ${bg}`}>
      <div className="text-4xl font-black leading-none tracking-tight sm:text-5xl">{value}</div>
      <div className="mt-2 text-xs font-bold uppercase tracking-widest opacity-90">{label}</div>
      {sub && <div className="mt-1 text-xs opacity-80">{sub}</div>}
    </div>
  );
}

/** A band of the page with a small heading, a big heading and room for the pieces. */
export function Band({ kicker, title, lead, children, tone = 'white' }: { kicker: string; title: string; lead?: string; children: ReactNode; tone?: 'white' | 'mist' | 'teal' }) {
  const bg = tone === 'teal' ? 'bg-[#0D3B3B] text-white' : tone === 'mist' ? 'bg-[#F5FAF8]' : 'bg-white';
  return (
    <section className={bg}>
      <div className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
        <div className={`text-xs font-black uppercase tracking-[.25em] ${tone === 'teal' ? 'text-[#D4A843]' : 'text-[#B88F2F]'}`}>{kicker}</div>
        <h2 className={`mt-2 max-w-3xl text-3xl font-black leading-tight sm:text-4xl ${tone === 'teal' ? 'text-white' : 'text-[#0D3B3B]'}`}>{title}</h2>
        {lead && <p className={`mt-3 max-w-2xl text-base ${tone === 'teal' ? 'text-teal-50/90' : 'text-slate-600'}`}>{lead}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

/** A card for one graphic, with a short title and, below it, the reading of it in plain words. */
export function Panel({ title, note, children, dark = false }: { title: string; note?: ReactNode; children: ReactNode; dark?: boolean }) {
  return (
    <div className={`ig-rise rounded-2xl p-5 ${dark ? 'bg-white/10 text-white' : 'border border-teal-100 bg-white shadow-sm'}`}>
      <h3 className={`text-sm font-black uppercase tracking-wider ${dark ? 'text-[#D4A843]' : 'text-[#0D3B3B]'}`}>{title}</h3>
      <div className="mt-4">{children}</div>
      {note && <p className={`mt-4 text-sm ${dark ? 'text-teal-50/85' : 'text-slate-600'}`}>{note}</p>}
    </div>
  );
}

export function Person({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 24 28" aria-hidden="true">
      <circle cx="12" cy="7" r="5" fill={color} />
      <path d="M2.5 27c0-7 4-11 9.5-11s9.5 4 9.5 11z" fill={color} />
    </svg>
  );
}

/** Rows of little people, one colour per group. Each icon stands for `per` people. */
export function PeopleGrid({ parts, per = 1, size = 24 }: { parts: { n: number; color: string; label: string }[]; per?: number; size?: number }) {
  const icons: string[] = [];
  parts.forEach((p) => { for (let i = 0; i < Math.ceil(p.n / per); i++) icons.push(p.color); });
  return (
    <div>
      <div className="flex flex-wrap gap-x-1 gap-y-1.5" role="img" aria-label={parts.map((p) => `${p.n} ${p.label}`).join(', ')}>
        {icons.map((c, i) => <span key={i} className="ig-pop" style={{ animationDelay: `${Math.min(i * 14, 900)}ms` }}><Person color={c} size={size} /></span>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {parts.map((p) => <span key={p.label} className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full" style={{ background: p.color }} /><b>{fmt(p.n)}</b> {p.label}</span>)}
        {per > 1 && <span className="text-slate-500">one figure is about {per} people</span>}
      </div>
    </div>
  );
}

/** A ring that fills to a percentage, with the figure in the middle. */
export function Ring({ value, label, sub, color = C.green, size = 150, track = '#E3ECE9', dark = false }: { value: number; label?: string; sub?: ReactNode; color?: string; size?: number; track?: string; dark?: boolean }) {
  const r = 54, len = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col items-center text-center">
      <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label={`${label ?? ''} ${v}%`}>
        <circle cx="70" cy="70" r={r} fill="none" stroke={dark ? 'rgba(255,255,255,.18)' : track} strokeWidth="14" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - v / 100)}
          transform="rotate(-90 70 70)" className="ig-ring" style={{ ['--len' as any]: len }} />
        <text x="70" y="78" textAnchor="middle" fontSize="30" fontWeight="900" fill={dark ? '#fff' : C.teal}>{v}%</text>
      </svg>
      {label && <div className={`mt-1 text-sm font-bold ${dark ? 'text-white' : 'text-[#0D3B3B]'}`}>{label}</div>}
      {sub && <div className={`text-xs ${dark ? 'text-teal-50/80' : 'text-slate-500'}`}>{sub}</div>}
    </div>
  );
}

/** A half-circle gauge between `min` and `max`. `text` is what shows in the middle (defaults to the value). */
export function Dial({ value, min, max, text, label, sub, color = C.gold, stops }: { value: number; min: number; max: number; text?: string; label?: string; sub?: ReactNode; color?: string; stops?: boolean }) {
  const len = Math.PI * 90, frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return (
    <div className="flex flex-col items-center text-center">
      <svg width="220" height="130" viewBox="0 0 200 120" role="img" aria-label={`${label ?? ''} ${text ?? value}`}>
        <path d="M10 105 A90 90 0 0 1 190 105" fill="none" stroke="#E3ECE9" strokeWidth="16" strokeLinecap="round" />
        <path d="M10 105 A90 90 0 0 1 190 105" fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - frac)} className="ig-ring" style={{ ['--len' as any]: len }} />
        <text x="100" y="92" textAnchor="middle" fontSize="34" fontWeight="900" fill={C.teal}>{text ?? value}</text>
        {stops && <><text x="10" y="120" fontSize="10" fill="#64748b">{min}</text><text x="190" y="120" textAnchor="end" fontSize="10" fill="#64748b">{max}</text></>}
      </svg>
      {label && <div className="text-sm font-bold text-[#0D3B3B]">{label}</div>}
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** Horizontal bars, one per row. `max` defaults to the largest value. */
export function HBars({ rows, max, suffix = '', color = C.green, dark = false }: { rows: { label: string; value: number; color?: string; note?: string }[]; max?: number; suffix?: string; color?: string; dark?: boolean }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className={`font-bold ${dark ? 'text-white' : 'text-[#1B2A2A]'}`}>{r.label}</span>
            <span className={`font-black tabular-nums ${dark ? 'text-[#D4A843]' : 'text-[#0D3B3B]'}`}>{fmt(r.value)}{suffix}</span>
          </div>
          <div className={`h-3.5 overflow-hidden rounded-full ${dark ? 'bg-white/15' : 'bg-[#E3ECE9]'}`}>
            <div className="ig-bar h-full rounded-full" style={{ width: `${Math.max(2, (r.value / top) * 100)}%`, background: r.color ?? color, animationDelay: `${i * 90}ms` }} />
          </div>
          {r.note && <div className={`mt-0.5 text-xs ${dark ? 'text-teal-50/70' : 'text-slate-500'}`}>{r.note}</div>}
        </li>
      ))}
    </ul>
  );
}

/** One bar split into shares of a whole, with a legend. */
export function Split({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-9 overflow-hidden rounded-full">
        {parts.filter((p) => p.value > 0).map((p, i) => (
          <div key={p.label} className="ig-bar flex items-center justify-center text-xs font-black text-white" style={{ width: `${(p.value / total) * 100}%`, background: p.color, animationDelay: `${i * 120}ms` }}>
            {Math.round((p.value / total) * 100) >= 9 ? `${Math.round((p.value / total) * 100)}%` : ''}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {parts.map((p) => <span key={p.label} className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full" style={{ background: p.color }} />{p.label} <b>{Math.round((p.value / total) * 100)}%</b></span>)}
      </div>
    </div>
  );
}

/** A line across steps (for example Day 0, 30, 60, 90). A step with no figure yet shows as an open dot. */
export function Journey({ points, color = C.green, suffix = '%', max = 100 }: { points: { label: string; value: number | null }[]; color?: string; suffix?: string; max?: number }) {
  const W = 560, H = 210, pad = 44, xs = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, points.length - 1), ys = (v: number) => 30 + (1 - Math.min(v, max) / max) * (H - 80);
  const known = points.map((p, i) => ({ ...p, i })).filter((p) => p.value != null) as { label: string; value: number; i: number }[];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={points.map((p) => `${p.label}: ${p.value ?? 'not yet'}`).join(', ')}>
      {[0, 50, 100].map((g) => <g key={g}><line x1={pad - 10} x2={W - pad + 10} y1={ys((g / 100) * max)} y2={ys((g / 100) * max)} stroke="#E3ECE9" strokeDasharray="4 4" /><text x={pad - 14} y={ys((g / 100) * max) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{Math.round((g / 100) * max)}</text></g>)}
      {known.length > 1 && <polyline points={known.map((p) => `${xs(p.i)},${ys(p.value)}`).join(' ')} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
      {points.map((p, i) => (
        <g key={p.label}>
          {p.value != null
            ? <><circle cx={xs(i)} cy={ys(p.value)} r="8" fill="#fff" stroke={color} strokeWidth="4" /><text x={xs(i)} y={ys(p.value) - 15} textAnchor="middle" fontSize="15" fontWeight="900" fill={C.teal}>{p.value}{suffix}</text></>
            : <circle cx={xs(i)} cy={ys(0) - 2} r="6" fill="#fff" stroke="#B8C6C1" strokeWidth="3" strokeDasharray="3 3" />}
          <text x={xs(i)} y={H - 10} textAnchor="middle" fontSize="12" fontWeight="700" fill="#4A5B5B">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

/** Two bars side by side: before and after. */
export function BeforeAfter({ before, after, beforeLabel, afterLabel, suffix = '%', max = 100 }: { before: number; after: number; beforeLabel: string; afterLabel: string; suffix?: string; max?: number }) {
  const col = (v: number, c: string, l: string) => (
    <div className="flex h-full flex-1 flex-col items-center justify-end">
      <div className="mb-1 text-2xl font-black text-[#0D3B3B]">{v}{suffix}</div>
      <div className="w-full max-w-[110px] overflow-hidden rounded-t-xl bg-[#E3ECE9]" style={{ height: 150 }}>
        <div className="ig-bar" style={{ height: '100%', display: 'flex', alignItems: 'flex-end', transformOrigin: 'bottom', animationName: 'igRise' }}>
          <div className="w-full rounded-t-xl" style={{ height: `${Math.max(4, (v / max) * 100)}%`, background: c }} />
        </div>
      </div>
      <div className="mt-2 text-center text-xs font-bold text-slate-600">{l}</div>
    </div>
  );
  return <div className="flex items-end justify-center gap-6">{col(before, C.grey, beforeLabel)}{col(after, C.green, afterLabel)}</div>;
}

/** A step list across time: done steps filled, the next one outlined, later ones faint. */
export function Steps({ steps }: { steps: { label: string; sub?: string; state: 'done' | 'now' | 'later' }[] }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-4">
      {steps.map((s, i) => (
        <li key={s.label} className="relative">
          <div className="flex items-center gap-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${s.state === 'done' ? 'bg-[#2E8B7A] text-white' : s.state === 'now' ? 'bg-[#D4A843] text-[#0D3B3B]' : 'border-2 border-dashed border-slate-300 text-slate-400'}`}>{s.state === 'done' ? '✓' : i + 1}</span>
            <div><div className={`text-sm font-black ${s.state === 'later' ? 'text-slate-400' : 'text-[#0D3B3B]'}`}>{s.label}</div>{s.sub && <div className="text-xs text-slate-500">{s.sub}</div>}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Shown where a graphic will appear once there is enough to show it. */
export function Soon({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border-2 border-dashed border-teal-100 bg-[#F5FAF8] p-5 text-sm text-slate-600">{children}</div>;
}
