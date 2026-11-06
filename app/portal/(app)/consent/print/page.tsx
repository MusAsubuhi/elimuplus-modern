import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { isMinor } from '@/lib/stories';
import { WORDS, CONSENT_VERSION, type FormLang } from '@/lib/consent-text';
import PrintButton from '@/components/print-button';

type P = { name: string; minor: boolean; noYear: boolean };
const Line = ({ label, value, w = '' }: { label: string; value?: string | null; w?: string }) => (
  <div className={`flex items-end gap-2 ${w}`}><span className="shrink-0 text-[11px] font-bold text-slate-600">{label}</span><span className="min-h-[1.5em] flex-1 border-b border-slate-500 px-1 text-[12px]">{value ?? ''}</span></div>
);
const Tick = ({ yes, no }: { yes: string; no: string }) => (
  <span className="ml-3 flex shrink-0 gap-3 text-[11px] font-bold"><span>☐ {yes}</span><span>☐ {no}</span></span>
);

function Form({ kind, lang, p, cohort, venue, date }: { kind: 'adult' | 'minor'; lang: FormLang; p?: P; cohort: string; venue: string; date: string }) {
  const w = WORDS[lang]; const f = w.fields; const t = kind === 'adult' ? w.adult : w.minor;
  return (
    <section className="print-page text-[13px] leading-snug" style={{ breakInside: 'avoid' }}>
      <div className="mb-2 flex items-end justify-between border-b-4 border-gold pb-1">
        <div><div className="text-lg font-black text-teal">{w.org} <span className="text-xs font-normal text-slate-500">{w.sub}</span></div><div className="text-sm font-black">{t.title}</div></div>
        <div className="text-right text-[10px] text-slate-500">{CONSENT_VERSION}</div>
      </div>
      <p className="mb-2">{t.intro}</p>
      {kind === 'adult' ? (
        <div className="mb-2 space-y-1.5"><div className="grid grid-cols-2 gap-x-4 gap-y-1.5"><Line label={f.name} value={p?.name} /><Line label={f.phone} /></div><div className="grid grid-cols-3 gap-x-4"><Line label={f.cohort} value={cohort} /><Line label={f.venue} value={venue} /><Line label={f.date} value={date} /></div></div>
      ) : (
        <div className="mb-2 space-y-1.5"><div className="grid grid-cols-2 gap-x-4"><Line label={f.child} value={p?.name} /><Line label={f.age} /></div><div className="grid grid-cols-2 gap-x-4"><Line label={f.school} /><Line label={f.cohort} value={cohort} /></div>
          <div className="grid grid-cols-2 gap-x-4"><Line label={f.guardian} /><Line label={f.relation} /></div><div className="grid grid-cols-3 gap-x-4"><Line label={f.gphone} /><Line label={f.venue} value={venue} /><Line label={f.date} value={date} /></div></div>
      )}
      <h3 className="mt-2 font-black text-teal">{t.a}</h3><p>{t.aText}</p>
      <h3 className="mt-2 font-black text-teal">{t.b}</h3>
      <ol className="space-y-1.5">{t.bItems.map((it, i) => <li key={i} className="flex items-start justify-between"><span>{i + 1}. {it}</span><Tick yes={w.yes} no={w.no} /></li>)}</ol>
      <h3 className="mt-2 font-black text-teal">{t.c}</h3><p>{t.cText}</p>
      {kind === 'minor' && 'childHead' in t && (
        <div className="mt-2 rounded border border-slate-400 p-2">
          <div className="font-black">{(t as any).childHead}</div>
          <div className="flex items-start justify-between"><span>{(t as any).childText}</span><Tick yes={w.yes} no={w.no} /></div>
          <div className="mt-1 flex items-start justify-between"><span>{(t as any).childNoPhoto}</span><Tick yes={w.yes} no={w.no} /></div>
          <div className="mt-2"><Line label={`${f.printed} / ${f.signature}`} /></div>
        </div>
      )}
      <p className="mt-3 font-bold">{t.declare}</p>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-8"><Line label={`${t.sign}: ${f.printed}`} value={kind === 'adult' ? p?.name : undefined} /><Line label={f.signature} /></div>
      <div className="mt-8 grid grid-cols-2 gap-x-6"><Line label={f.witness} /><Line label={t.read} /></div>
      <p className="mt-3 text-[10px] text-slate-500">{w.footer}</p>
    </section>
  );
}

function Register({ lang, rows, cohort, date }: { lang: FormLang; rows: P[]; cohort: string; date: string }) {
  const r = WORDS[lang].register;
  const blanks = Math.max(0, 20 - rows.length);
  const all = [...rows.map((x) => x as P | null), ...Array(blanks).fill(null)];
  return (
    <section className="print-page text-[12px]">
      <div className="mb-2 flex items-end justify-between border-b-4 border-gold pb-1"><div className="text-lg font-black text-teal">{r.title}</div><div className="text-xs text-slate-600">{cohort} · {date} · {CONSENT_VERSION}</div></div>
      <p className="mb-2 text-[11px]">{r.note}</p>
      <table className="w-full border-collapse text-[11px]"><thead><tr>{r.cols.map((c) => <th key={c} className="border border-slate-500 bg-slate-100 px-1 py-1 text-left">{c}</th>)}</tr></thead>
        <tbody>{all.map((x, i) => <tr key={i} style={{ height: '1.9em' }}>
          <td className="border border-slate-500 px-1">{i + 1}</td><td className="border border-slate-500 px-1">{x?.name ?? ''}</td>
          <td className="border border-slate-500 px-1">{x ? (x.minor ? r.minor : r.adult) : ''}</td>
          {[0, 1, 2, 3].map((k) => <td key={k} className="border border-slate-500 px-1 text-center">☐</td>)}</tr>)}</tbody></table>
    </section>
  );
}

export default async function ConsentPrint({ searchParams }: { searchParams: Promise<{ cohort?: string; type?: string; lang?: string; copies?: string }> }) {
  const me = await requireMe('facilitator', 'founder', 'master');
  const sp = await searchParams;
  const type = ['adult', 'minor', 'register', 'auto'].includes(sp.type ?? '') ? (sp.type as string) : 'auto';
  const langs: FormLang[] = sp.lang === 'en' ? ['en'] : sp.lang === 'sw' ? ['sw'] : ['en', 'sw'];
  const copies = Math.min(60, Math.max(1, parseInt(sp.copies ?? '5', 10) || 5));
  const cohortId = sp.cohort && /^[0-9a-f-]{36}$/i.test(sp.cohort) ? sp.cohort : null;
  const data = await asUser(me.id, async (q) => {
    if (!cohortId) return { c: null as any, rows: [] as P[] };
    const c = (await q('select id, name, venue, start_date from cohorts where id=$1', [cohortId]))[0] ?? null;
    if (!c) return { c: null as any, rows: [] as P[] };
    const rs = await q(`select coalesce(p.full_name, p.display_name) name, p.birth_year from enrolments e join people p on p.id=e.person_id where e.cohort_id=$1 order by p.display_name`, [cohortId]);
    return { c, rows: rs.map((r: any) => ({ name: r.name as string, minor: isMinor(r.birth_year), noYear: !r.birth_year })) as P[] };
  });
  const { c, rows } = data;
  const cohort = c?.name ?? ''; const venue = c?.venue ?? '';
  const date = c?.start_date ? new Date(c.start_date).toISOString().slice(0, 10) : '';
  const noYear = rows.filter((r) => r.noYear);
  const blank = Array.from({ length: copies });
  return (
    <div className="mx-auto max-w-[800px] bg-white p-4">
      <div className="no-print mb-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <div className="flex items-center justify-between"><span className="font-bold">Consent forms{cohort ? ` · ${cohort}` : ''}: {type === 'auto' ? rows.length : type === 'register' ? 'register' : copies} to print</span><PrintButton label="Print" /></div>
        {type === 'auto' && !c && <p className="text-amber-700">Choose a cohort to print a form for each person. <a className="underline" href="/portal/consent">Go back</a></p>}
        {noYear.length > 0 && type !== 'adult' && type !== 'minor' && <p className="text-amber-700">No birth year on file for {noYear.map((r) => r.name).join(', ')}. They get the adult form; check their age before they sign.</p>}
      </div>
      {type === 'register' && c && langs.slice(0, 1).map((l) => <Register key={l} lang={l} rows={rows} cohort={cohort} date={date} />)}
      {type === 'auto' && c && rows.flatMap((p, i) => langs.map((l) => <Form key={`${i}${l}`} kind={p.minor ? 'minor' : 'adult'} lang={l} p={p} cohort={cohort} venue={venue} date={date} />))}
      {type === 'auto' && c && <Register lang={langs[0]} rows={rows} cohort={cohort} date={date} />}
      {(type === 'adult' || type === 'minor') && blank.flatMap((_, i) => langs.map((l) => <Form key={`${i}${l}`} kind={type as 'adult' | 'minor'} lang={l} cohort={cohort} venue={venue} date={date} />))}
      {type === 'register' && !c && <p className="text-sm text-amber-700">The register needs a cohort. <a className="underline" href="/portal/consent">Go back</a></p>}
    </div>
  );
}
