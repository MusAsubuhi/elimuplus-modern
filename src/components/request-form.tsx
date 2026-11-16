'use client';
import { useState } from 'react';

const box = 'w-full rounded-lg border border-teal-100 bg-white px-3 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal';
const MAX = 12;

type Row = { name: string; format: string; language: string; audience: string; size: string; start: string; venue: string };
const blank: Row = { name: '', format: '5-day', language: 'sw', audience: '', size: '', start: '', venue: '' };

/** One block per training. "Add another training" copies the previous block (everything except the name and start date), so a series of back-to-back trainings is quick to enter. */
export function RequestForm({ orgs, action }: { orgs: { id: string; name: string }[]; action: (f: FormData) => void | Promise<void> }) {
  const [rows, setRows] = useState<Row[]>([{ ...blank }]);
  const set = (i: number, k: keyof Row, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const add = () => { const last = rows[rows.length - 1]; setRows([...rows, { ...last, name: '', start: '' }]); };
  return (
    <form action={action} className="space-y-3 text-sm">
      <input type="hidden" name="count" value={rows.length} />
      <label className="block font-bold">Organisation
        <select name="org" className={`${box} mt-1`}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      </label>
      {rows.map((r, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-teal-100 bg-mist p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-teal">{rows.length > 1 ? `Training ${i + 1}` : 'Training'}</p>
          <label className="block font-bold">Name for this cohort<input name={`name_${i}`} value={r.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder="e.g. Youth cohort, March" className={`${box} mt-1`} /></label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block font-bold">Programme
              <select name={`format_${i}`} value={r.format} onChange={(e) => set(i, 'format', e.target.value)} className={`${box} mt-1`}><option value="5-day">5-Day Programme (intensive)</option><option value="12-day">12-Day Programme (full)</option></select>
            </label>
            <label className="block font-bold">Language
              <select name={`language_${i}`} value={r.language} onChange={(e) => set(i, 'language', e.target.value)} className={`${box} mt-1`}><option value="sw">Kiswahili</option><option value="en">English</option></select>
            </label>
          </div>
          <label className="block font-bold">Who will attend?<input name={`audience_${i}`} value={r.audience} onChange={(e) => set(i, 'audience', e.target.value)} placeholder="Youth 15 to 24, caregivers, students" className={`${box} mt-1`} /></label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block font-bold">Number of participants<input name={`size_${i}`} type="number" min="1" value={r.size} onChange={(e) => set(i, 'size', e.target.value)} className={`${box} mt-1`} /></label>
            <label className="block font-bold">Preferred start date<input name={`start_${i}`} type="date" value={r.start} onChange={(e) => set(i, 'start', e.target.value)} className={`${box} mt-1`} /></label>
          </div>
          <label className="block font-bold">Venue<input name={`venue_${i}`} value={r.venue} onChange={(e) => set(i, 'venue', e.target.value)} className={`${box} mt-1`} /></label>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        {rows.length < MAX && <button type="button" onClick={add} className="rounded-lg border border-teal px-4 py-2 text-sm font-bold text-teal hover:bg-teal-50">+ Add another training</button>}
        {rows.length > 1 && <button type="button" onClick={() => setRows(rows.slice(0, -1))} className="text-xs font-bold text-slate-500 underline">Remove last training</button>}
      </div>
      <button className="w-full rounded-xl bg-teal px-5 py-3 text-sm font-bold text-white hover:bg-teal-700 sm:w-auto">{rows.length > 1 ? `Request ${rows.length} proposals and quotations` : 'Request proposal and quotation'}</button>
      <p className="text-xs text-slate-500">Planning a series of trainings one after another? Add each one here and we will prepare a quotation for every training. Up to {MAX} at a time, and you can send another request whenever you need to. Nothing is booked until you confirm.</p>
    </form>
  );
}
