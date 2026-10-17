import Link from 'next/link';
import type { ReactNode } from 'react';

export function Card({ title, subtitle, children, className = '', action }: { title?: string; subtitle?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-teal-100 bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div>
            {title && <h2 className="text-base font-bold text-teal">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="px-5 pb-5 pt-3">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone = 'teal' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'teal' | 'gold' | 'red' | 'green' }) {
  const bar = { teal: 'bg-teal', gold: 'bg-gold', red: 'bg-[#C8553D]', green: 'bg-[#2E8B7A]' }[tone];
  return (
    <div className="relative overflow-hidden rounded-xl border border-teal-100 bg-white p-4 shadow-sm">
      <span className={`absolute left-0 top-0 h-full w-1.5 ${bar}`} />
      <div className="pl-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-1 text-2xl font-bold text-ink">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

const TONES: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-800', gold: 'bg-gold-100 text-gold-600', red: 'bg-red-100 text-red-700',
  grey: 'bg-slate-100 text-slate-600', teal: 'bg-teal-100 text-teal-700', blue: 'bg-sky-100 text-sky-800',
};
export function Badge({ children, tone = 'grey' }: { children: ReactNode; tone?: keyof typeof TONES | string }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone] ?? TONES.grey}`}>{children}</span>;
}
export const statusTone = (s: string) =>
  ({ done: 'green', paid: 'green', released: 'green', approved: 'green', active: 'green', completed: 'green', listed: 'green', pass: 'green', activated: 'green', nominated: 'gold', suggested: 'gold',
     scheduled: 'blue', submitted: 'gold', draft: 'grey', reviewed: 'blue', part_paid: 'gold', issued: 'gold', queried: 'gold', conditional: 'gold', enrolled: 'blue',
     missed: 'red', unreachable: 'red', declined: 'red', overdue: 'red', dropped: 'red', concern: 'red', open: 'red' } as Record<string, string>)[s] ?? 'grey';

export function PageHeader({ title, subtitle, image, children }: { title: string; subtitle?: string; image?: string; children?: ReactNode }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl bg-teal text-white">
      {image && <div className="absolute inset-0 bg-cover bg-center opacity-35" style={{ backgroundImage: `url(${image})` }} />}
      <div className="absolute inset-0 bg-gradient-to-r from-teal via-teal/85 to-transparent" />
      <div className="relative px-6 py-7 md:px-8">
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-teal-100">{subtitle}</p>}
        {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  );
}

export function Table({ head, rows, empty = 'Nothing here yet.' }: { head: string[]; rows: ReactNode[][]; empty?: string }) {
  if (!rows.length) return <p className="py-4 text-sm text-slate-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b border-teal-100 text-xs uppercase tracking-wide text-slate-500">
          {head.map((h) => <th key={h} className="py-2 pr-4 font-bold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-mist">
            {r.map((c, j) => <td key={j} className="py-2.5 pr-4 align-top">{c}</td>)}</tr>))}</tbody>
      </table>
    </div>
  );
}

export function ProgressBar({ value, tone = 'teal' }: { value: number; tone?: 'teal' | 'gold' | 'green' }) {
  const c = { teal: 'bg-teal', gold: 'bg-gold', green: 'bg-[#2E8B7A]' }[tone];
  return (
    <div className="h-2.5 w-full rounded-full bg-teal-50" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-2.5 rounded-full ${c}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

export function ImgBand({ src, caption, className = '' }: { src: string; caption?: string; className?: string }) {
  return (
    <figure className={`relative overflow-hidden rounded-xl ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={caption ?? ''} className="h-full w-full object-cover" />
      {caption && <figcaption className="absolute bottom-0 w-full bg-gradient-to-t from-black/60 to-transparent p-3 text-xs text-white">{caption}</figcaption>}
    </figure>
  );
}

export function Btn({ href, children, variant = 'primary' }: { href: string; children: ReactNode; variant?: 'primary' | 'ghost' }) {
  const cls = variant === 'primary' ? 'bg-gold text-teal hover:bg-gold-600 hover:text-white' : 'border border-white/50 text-white hover:bg-white/10';
  return <Link href={href} className={`inline-block rounded-lg px-4 py-2 text-sm font-bold transition ${cls}`}>{children}</Link>;
}
export const submitCls = 'rounded-lg bg-teal px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50';
export const inputCls = 'w-full rounded-lg border border-teal-100 bg-white px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal';
