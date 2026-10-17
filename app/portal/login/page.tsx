import { redirect } from 'next/navigation';
import { asAdmin, dbMode } from '@/lib/db';
import { getMe } from '@/lib/session';
import { demoLogin, passwordLogin } from '../actions';

const BLURB: Record<string, string> = {
  founder: 'Sees everything: money, people, partners, audit.',
  facilitator: 'Runs cohorts, takes attendance, logs sessions, requests expenses.',
  participant: 'Builds the SEE Canvas and follows their own journey.',
  org_admin: 'Partner organisation: roster, reports, invoices, requests.',
};

export default async function Login({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  if (await getMe()) redirect('/portal');
  const { err } = await searchParams;
  const mode = await dbMode();
  const people = mode === 'demo'
    ? await asAdmin((q) => q(`select p.id, p.display_name, p.full_name, p.preferred_language lang,
        (select case when bool_or(role='founder') then 'founder' when bool_or(role='facilitator') then 'facilitator'
                     when bool_or(role='org_admin') then 'org_admin' else 'participant' end from role_assignments where person_id=p.id) kind,
        (select max(tier) from role_assignments where person_id=p.id and role='facilitator') tier,
        (select o.name from role_assignments ra join organisations o on o.id=ra.organisation_id where ra.person_id=p.id limit 1) org
        from people p order by p.full_name`))
    : [];
  const groups = [['founder', 'Founders'], ['facilitator', 'Trainers and master trainers'], ['org_admin', 'Partner organisations'], ['participant', 'Participants']] as const;
  return (
    <div className="min-h-screen bg-mist">
      <div className="relative bg-teal text-white">
        <div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: 'url(/images/hero-bg.jpg)' }} />
        <div className="relative mx-auto max-w-5xl px-6 py-14">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-elimu-white.png" alt="Elimu+" className="mb-6 h-12 w-auto" />
          <h1 className="text-3xl font-black md:text-4xl">Elimu+ Portal</h1>
          <p className="mt-2 max-w-xl text-teal-100">Start. Start small. Start to finish. Your canvas, your journey, your cohort, your reports, in one place. <span className="italic text-gold">Karibu.</span></p>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-6 py-10">
        {err && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{err}</p>}
        {mode === 'pg' ? (
          <form action={passwordLogin} className="mx-auto max-w-sm space-y-3 rounded-xl border border-teal-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-teal">Sign in</h2>
            <p className="text-xs text-slate-500">Accounts are by invitation only. Use the phone number you were invited with and your PIN.</p>
            <input name="phone" placeholder="Phone number, e.g. 0712 345 678" className="w-full rounded-lg border border-teal-100 px-3 py-2 text-sm" />
            <input name="pin" type="password" placeholder="PIN" required className="w-full rounded-lg border border-teal-100 px-3 py-2 text-sm" />
            <button className="w-full rounded-lg bg-teal py-2 font-bold text-white">Sign in</button>
          </form>
        ) : (
          <>
            <div className="mb-6 rounded-xl border border-gold bg-gold-100 p-4 text-sm text-ink">
              <b>Demo mode.</b> Pick a person to see exactly what that role sees. Everything is filtered by the same database rules that protect real accounts; the people and numbers are synthetic.
            </div>
            {groups.map(([kind, title]) => (
              <section key={kind} className="mb-8">
                <h2 className="mb-1 text-lg font-bold text-teal">{title}</h2>
                <p className="mb-3 text-xs text-slate-500">{BLURB[kind === 'facilitator' ? 'facilitator' : kind]}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {people.filter((p) => p.kind === kind).map((p) => (
                    <form key={p.id} action={demoLogin}>
                      <input type="hidden" name="person" value={p.id} />
                      <button className="w-full rounded-xl border border-teal-100 bg-white p-4 text-left shadow-sm transition hover:border-gold hover:shadow-md">
                        <div className="font-bold text-teal">{p.display_name}</div>
                        <div className="text-xs text-slate-500">{p.full_name}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                          {p.tier ? <span className="rounded-full bg-teal-100 px-2 py-0.5 text-teal-700">{p.tier >= 3 ? `Master trainer · Tier ${p.tier}` : `Tier ${p.tier}`}</span> : null}
                          {p.org ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{String(p.org).replace(' (demo)', '')}</span> : null}
                          <span className="rounded-full bg-gold-100 px-2 py-0.5 text-gold-600">{p.lang === 'sw' ? 'Kiswahili' : 'English'}</span>
                        </div>
                      </button>
                    </form>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
