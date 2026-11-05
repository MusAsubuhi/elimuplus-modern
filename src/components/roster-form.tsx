'use client';
import { useState } from 'react';

const box = 'w-full rounded-lg border border-teal-100 bg-white px-3 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal';

/** Rows of name, phone, age and gender, all required; "Add another person" adds a row. Anyone under 18 shows a guardian tick box. */
export function RosterForm({ cohort, action }: { cohort: string; action: (f: FormData) => void | Promise<void> }) {
  const [n, setN] = useState(1);
  const [ages, setAges] = useState<Record<number, string>>({});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="cohort" value={cohort} />
      <input type="hidden" name="count" value={n} />
      {Array.from({ length: n }, (_, i) => {
        const age = Number(ages[i]);
        const minor = age > 0 && age < 18;
        return (
          <div key={i} className="rounded-xl border border-teal-100 bg-mist p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Full name
                <input name={`name_${i}`} required autoComplete="off" className={`${box} mt-1`} placeholder="e.g. Amina Wanjiru" />
              </label>
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Phone number
                <input name={`phone_${i}`} required inputMode="tel" autoComplete="off" className={`${box} mt-1`} placeholder="0712345678" />
              </label>
              <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700">Age
                  <input name={`age_${i}`} required type="number" min={5} max={100} inputMode="numeric" className={`${box} mt-1`} value={ages[i] ?? ''} onChange={(e) => setAges({ ...ages, [i]: e.target.value })} />
                </label>
                <label className="text-xs font-semibold text-slate-700">Gender
                  <select name={`gender_${i}`} required defaultValue="" className={`${box} mt-1`}><option value="" disabled>Choose</option><option value="F">Female</option><option value="M">Male</option></select>
                </label>
              </div>
            </div>
            {minor && (
              <label className="mt-2 flex items-start gap-2 text-xs text-slate-700">
                <input type="checkbox" name={`consent_${i}`} required className="mt-0.5" />
                <span>This person is under 18. A parent or guardian has agreed to them joining.</span>
              </label>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setN(n + 1)} className="rounded-lg border border-teal px-4 py-2 text-sm font-bold text-teal hover:bg-teal-50">+ Add another person</button>
        {n > 1 && <button type="button" onClick={() => setN(n - 1)} className="text-xs font-bold text-slate-500 underline">Remove last row</button>}
      </div>
      <button className="w-full rounded-xl bg-teal px-5 py-3 text-sm font-bold text-white hover:bg-teal-700 sm:w-auto">Add to the list</button>
    </form>
  );
}

/** A list that can be searched once it gets long. */
export function SearchBox({ target }: { target: string }) {
  return (
    <input type="search" placeholder="Search by name or phone" aria-label="Search the list" className={`${box} mb-3 max-w-xs`}
      onChange={(e) => {
        const v = e.target.value.toLowerCase();
        document.querySelectorAll<HTMLElement>(`[data-row-of="${target}"]`).forEach((tr) => { tr.style.display = tr.textContent!.toLowerCase().includes(v) ? '' : 'none'; });
      }} />
  );
}
