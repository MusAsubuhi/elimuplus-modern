'use client';
import { useState } from 'react';

type Person = { id: string; display_name: string; cohort_id: string; cohort_name: string };
const box = 'w-full rounded-lg border border-teal-100 bg-white px-3 py-2 text-sm focus:border-teal focus:outline-none';

/** Pick the cohort first, then only that cohort's participants are listed, so the list stays short however many people there are. */
export function SupportForm({ action, people, submitCls }: { action: (f: FormData) => void | Promise<void>; people: Person[]; submitCls: string }) {
  const cohorts = Array.from(new Map(people.map((p) => [p.cohort_id, p.cohort_name])).entries());
  const [cohort, setCohort] = useState('');
  const [find, setFind] = useState('');
  const here = people.filter((p) => p.cohort_id === cohort && p.display_name.toLowerCase().includes(find.trim().toLowerCase()));
  return (
    <form action={action} className="mt-4 grid gap-2 rounded-lg bg-mist p-3 text-sm sm:grid-cols-6">
      <select value={cohort} onChange={(e) => { setCohort(e.target.value); setFind(''); }} aria-label="Cohort" className={`${box} sm:col-span-2`}>
        <option value="">1. Choose a cohort</option>{cohorts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
      <input value={find} onChange={(e) => setFind(e.target.value)} disabled={!cohort} placeholder="Search by name" className={`${box} sm:col-span-1`} aria-label="Search participants" />
      <select name="enrolment" required disabled={!cohort} className={`${box} sm:col-span-3`}>
        <option value="">{cohort ? `2. Choose a participant (${here.length})` : '2. Choose a cohort first'}</option>
        {here.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
      </select>
      <input name="item" required placeholder="What it was for" className={box} />
      <input name="amount" type="number" min="1" required placeholder="Amount (KES)" className={box} />
      <input name="entry_date" type="date" className={box} />
      <select name="given_by" className={box}><option value="founders">Given by Elimu+</option><option value="partner">Given by the partner</option></select>
      <input name="funder" placeholder="Funder (optional)" className={`${box} sm:col-span-2`} />
      <input name="note" placeholder="Note (optional)" className={`${box} sm:col-span-3`} />
      <button className={submitCls}>Add entry</button>
    </form>
  );
}
