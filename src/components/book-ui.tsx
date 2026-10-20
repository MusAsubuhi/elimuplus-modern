import Link from 'next/link';
import type { ReactNode } from 'react';
import { bt } from '@/lib/book-text';
import type { Lang } from '@/lib/session';

export const money = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `KES ${Math.round(n).toLocaleString('en-KE')}`);
/** Blank when zero, so a fresh form is not full of zeros to delete. */
export const fieldVal = (n: number | null | undefined) => (n ? String(n) : '');

export function BookTabs({ lang, active, person }: { lang: Lang; active: 'today' | 'week' | 'month' | 'setup'; person?: string }) {
  const t = bt(lang);
  const q = person ? `?person=${person}` : '';
  const tabs = person
    ? ([['today', t('tabToday'), `/portal/book/view${q}`]] as const)
    : ([['today', t('tabToday'), '/portal/book'], ['week', t('tabWeek'), '/portal/book/week'], ['month', t('tabMonth'), '/portal/book/month'], ['setup', t('tabSetup'), '/portal/book/setup']] as const);
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-teal-100 bg-white p-1" aria-label={t('title')}>
      {tabs.map(([k, label, href]) => (
        <Link key={k} href={href} aria-current={active === k ? 'page' : undefined}
          className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2.5 text-center text-sm font-bold ${active === k ? 'bg-teal text-white' : 'text-teal hover:bg-teal-50'}`}>{label}</Link>
      ))}
    </nav>
  );
}

/** How far today's earnings have climbed towards what the day needed. Text carries the meaning, colour only helps. */
export function Ladder({ lang, earned, needed, reached }: { lang: Lang; earned: number | null; needed: number; reached: boolean | null }) {
  const t = bt(lang);
  if (earned === null) return <p className="text-sm text-slate-600">{t('unknownBE')}</p>;
  const pct = needed > 0 ? Math.min(100, Math.round((earned / needed) * 100)) : 100;
  const gap = Math.round(earned - needed);
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-slate-700">{t('needed')}: {money(needed)}</span>
        <span className="font-semibold text-slate-700">{t('earned')}: {money(earned)}</span>
      </div>
      <div className="mt-2 h-4 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={`h-full rounded-full ${reached ? 'bg-emerald-600' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`mt-2 text-sm font-bold ${reached ? 'text-emerald-700' : 'text-amber-700'}`}>
        {reached ? '✔ ' : ''}{reached ? t('reached') : t('below')}: {money(Math.abs(gap))} {gap >= 0 ? t('aboveBy') : t('belowBy')}
      </p>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-slate-800">{label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
    </label>
  );
}
/** Big, phone-friendly number box. */
export const numCls = 'mt-1 w-full rounded-lg border border-teal-100 bg-white px-3 py-3 text-lg font-normal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal';
export const textCls = 'mt-1 w-full rounded-lg border border-teal-100 bg-white px-3 py-3 text-base font-normal focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal';
export const bigBtn = 'w-full rounded-xl bg-teal px-5 py-4 text-base font-bold text-white hover:bg-teal-700 md:w-auto';
