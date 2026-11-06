import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';

// Choose which consent form to print. Trainers can print before a session and have people sign.
export default async function ConsentHub({ searchParams }: { searchParams: Promise<{ cohort?: string }> }) {
  const me = await requireMe('facilitator', 'founder', 'master');
  const sp = await searchParams;
  const cohorts = await asUser(me.id, (q) => q(`select id, name, start_date from cohorts where status in ('requested','quoted','confirmed','delivering','followup') order by start_date desc nulls last, name`));
  const sel = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <div>
        <h1 className="text-2xl font-black text-teal">Consent forms</h1>
        <p className="mt-1 text-sm text-slate-600">Print before the session, have each person sign, and file the signed forms with the cohort pack. Adults sign for themselves; anyone under 18 needs a parent or guardian, and the child adds their own agreement. Photos and videos have their own Yes or No boxes, so a person can join the training and still say no to being photographed.</p>
      </div>
      <form action="/portal/consent/print" method="get" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-sm font-bold">Cohort (optional, fills names and the venue)
          <select name="cohort" defaultValue={sp.cohort ?? ''} className={`${sel} mt-1 block w-full`}>
            <option value="">No cohort: blank forms</option>
            {cohorts.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm font-bold">Form
            <select name="type" defaultValue="auto" className={`${sel} mt-1 block w-full`}>
              <option value="auto">Right form for each person (cohort needed)</option>
              <option value="adult">Adult, blank</option>
              <option value="minor">Parent or guardian, blank</option>
              <option value="register">Signing register only</option>
            </select>
          </label>
          <label className="block text-sm font-bold">Language
            <select name="lang" defaultValue="both" className={`${sel} mt-1 block w-full`}>
              <option value="both">English and Kiswahili</option>
              <option value="en">English</option>
              <option value="sw">Kiswahili</option>
            </select>
          </label>
          <label className="block text-sm font-bold">Blank copies
            <input name="copies" type="number" min={1} max={60} defaultValue={5} className={`${sel} mt-1 block w-full`} />
          </label>
        </div>
        <button className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-white">Preview and print</button>
      </form>
      <p className="text-xs text-slate-500">With a cohort chosen, “Right form for each person” gives adults the adult form and under-18s the guardian form, with names filled in from the roster. People with no birth year on file get the adult form and are listed at the top so you can check them. The wording should be reviewed by a lawyer once; the Data Protection Act 2019 treats children’s data with extra care. <Link href="/portal/cohorts" className="underline">Back to cohorts</Link></p>
    </div>
  );
}
