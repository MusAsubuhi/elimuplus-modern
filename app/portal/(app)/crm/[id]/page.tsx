import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, inputCls, submitCls } from '@/components/ui';
import { d } from '@/lib/format';
import { orgTypeLabel } from '@/lib/options';
import { assignToCohort, completeAction, logActivity, saveReadiness, setCohortStatus } from '../../../ops-actions';

const KIND: Record<string, string> = { call: 'Call', visit: 'Visit', whatsapp: 'WhatsApp', email: 'Email', meeting: 'Meeting', note: 'Note' };
const OUT: Record<string, string> = { reached: 'Reached', no_answer: 'No answer', completed: 'Done', could_not_meet: 'Could not meet', not_interested: 'Not interested' };

export default async function CrmOrg({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe('founder', 'master');
  const { id } = await params;
  const isFounder = me.roles.includes('founder');
  const D = await asUser(me.id, async (q) => {
    const o = (await q('select * from organisations where id=$1', [id]))[0];
    if (!o) return null;
    return {
      o,
      st: (await q('select * from crm_org_status where organisation_id=$1', [id]))[0],
      acts: await q('select a.*, p.display_name who from crm_activities a join people p on p.id=a.logged_by where a.organisation_id=$1 order by a.occurred_on desc, a.created_at desc', [id]),
      items: await q('select i.*, c.status, c.note, c.checked_on, p.display_name checker from readiness_items i left join readiness_checks c on c.item_key=i.key and c.organisation_id=$1 left join people p on p.id=c.checked_by order by i.sort', [id]),
      cohorts: await q('select * from cohorts where organisation_id=$1 order by seq', [id]),
      team: isFounder ? await q(`select distinct p.id, p.display_name, r.tier from people p join role_assignments r on r.person_id=p.id and r.status='active' and r.role='facilitator' order by p.display_name`) : [],
      crew: await q('select cf.cohort_id, cf.role, p.display_name from cohort_facilitators cf join people p on p.id=cf.person_id where cf.cohort_id in (select id from cohorts where organisation_id=$1)', [id]),
    };
  });
  if (!D) notFound();
  const { o, st, acts, items, cohorts, team, crew } = D;
  const ready = st.called && st.visited && st.checks_complete;
  const here = `/portal/crm/${id}`;
  const areas = Array.from(new Set(items.map((i) => i.area)));
  return (
    <>
      <PageHeader image="/images/home-community.jpg" title={o.name} subtitle={`${orgTypeLabel(o.type)} · ${[o.ward, o.county].filter(Boolean).join(', ')}${o.contact_person ? ` · contact ${o.contact_person}` : ''}`} />
      <p className="mb-4 text-sm"><Link href="/portal/crm" className="font-bold text-teal underline">← All organisations</Link></p>
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat tone={st.called ? 'green' : 'gold'} label="Called" value={st.called ? 'Yes' : 'Not yet'} sub={`${st.calls} call${st.calls === 1 ? '' : 's'} logged`} />
        <Stat tone={st.visited ? 'green' : 'gold'} label="Visited" value={st.visited ? 'Yes' : 'Not yet'} sub={`${st.visits} visit${st.visits === 1 ? '' : 's'} logged`} />
        <Stat tone={st.checks_complete ? 'green' : st.issues ? 'red' : 'gold'} label="Venue checks" value={`${st.required_ok}/${st.required_total}`} sub={st.issues ? `${st.issues} issue(s) open` : 'required items'} />
        <Stat tone={ready ? 'green' : 'red'} label="Ready to run a programme" value={ready ? 'Ready' : 'Not yet'} sub={ready ? 'A cohort can be confirmed' : 'Cannot be confirmed without a founder override'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Log a call, visit or note">
            <form action={logActivity} className="space-y-2 text-sm">
              <input type="hidden" name="organisation" value={id} /><input type="hidden" name="back" value={here} />
              <div className="grid grid-cols-2 gap-2">
                <label className="font-bold">What<select name="kind" className={inputCls}>{Object.entries(KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                <label className="font-bold">Result<select name="outcome" className={inputCls}><option value="reached">Reached them</option><option value="completed">Done</option><option value="no_answer">No answer</option><option value="could_not_meet">Could not meet</option><option value="not_interested">Not interested</option></select></label>
              </div>
              <label className="block font-bold">Date<input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputCls} /></label>
              <label className="block font-bold">What was said or seen<textarea name="summary" rows={3} required className={inputCls} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="font-bold">Next step<input name="next_action" className={inputCls} placeholder="e.g. visit the hall" /></label>
                <label className="font-bold">By when<input name="next_due" type="date" className={inputCls} /></label>
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" name="close_open" />This closes the earlier open steps</label>
              <button className={submitCls}>Save entry</button>
              <p className="text-xs text-slate-500">Only a call or meeting where you reached them counts as “called”. Only a completed visit counts as “visited”.</p>
            </form>
          </Card>
          <Card title="History">
            {acts.length === 0 ? <p className="text-sm text-slate-600">Nothing logged yet.</p> : (
              <ul className="space-y-3 text-sm">{acts.map((a) => (
                <li key={a.id} className="border-l-4 border-teal-100 pl-3">
                  <div className="flex flex-wrap items-center gap-2"><b>{KIND[a.kind]}</b><Badge tone={a.outcome === 'reached' || a.outcome === 'completed' ? 'green' : 'gold'}>{OUT[a.outcome]}</Badge><span className="text-xs text-slate-500">{d(a.occurred_on)} · {a.who}</span></div>
                  <p className="mt-0.5 text-slate-700">{a.summary}</p>
                  {a.next_action && (
                    <div className="mt-1 flex items-center gap-2 text-xs"><span className={a.done ? 'text-slate-400 line-through' : 'font-semibold text-gold-600'}>Next: {a.next_action}{a.next_action_due ? ` by ${d(a.next_action_due)}` : ''}</span>
                      {!a.done && <form action={completeAction}><input type="hidden" name="activity" value={a.id} /><input type="hidden" name="back" value={here} /><button className="rounded border border-teal px-2 py-0.5 font-bold text-teal">Done</button></form>}</div>)}
                </li>))}</ul>)}
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-3">
          <Card title="Room and facilities checks" subtitle="Do these on the visit, standing in the room. Required items must be OK (or not applicable) before a cohort can be confirmed.">
            <form action={saveReadiness} className="space-y-4">
              <input type="hidden" name="organisation" value={id} />
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-sm font-bold">Venue (hall or room name)<input name="venue_name" readOnly={!isFounder} defaultValue={o.venue_name ?? ''} className={inputCls} /></label>
                <label className="text-sm font-bold">Seats comfortably<input name="venue_capacity" type="number" min="0" readOnly={!isFounder} defaultValue={o.venue_capacity ?? ''} className={inputCls} /></label>
              </div>
              {areas.map((area) => (
                <div key={area}>
                  <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-teal">{area}</h4>
                  <ul className="space-y-2">{items.filter((i) => i.area === area).map((i) => (
                    <li key={i.key} className="rounded-lg bg-mist p-2 text-sm">
                      <input type="hidden" name="item" value={i.key} />
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="max-w-md"><b>{i.label}</b>{!i.required && <span className="ml-1 text-xs text-slate-500">(optional)</span>}{i.help && <span className="block text-xs text-slate-500">{i.help}</span>}</span>
                        <select name={`st_${i.key}`} defaultValue={i.status ?? 'unchecked'} className="rounded-md border border-teal-100 bg-white px-2 py-1 text-xs font-semibold">
                          <option value="unchecked">Not checked</option><option value="ok">OK</option><option value="issue">Issue</option><option value="na">Not applicable</option></select>
                      </div>
                      <input name={`nt_${i.key}`} defaultValue={i.note ?? ''} placeholder="Note (required if there is an issue)" className={`${inputCls} mt-1 text-xs`} />
                      {i.checked_on && <div className="mt-0.5 text-[11px] text-slate-500">Last checked {d(i.checked_on)} by {i.checker}</div>}
                    </li>))}</ul>
                </div>))}
              <button className={submitCls}>Save checks</button>
            </form>
          </Card>

          <Card title="Cohorts at this organisation" subtitle="A cohort cannot move to confirmed or delivering until the organisation is ready.">
            {cohorts.length === 0 ? <p className="text-sm text-slate-600">No cohorts yet. They appear here when this partner requests a training.</p> : (
              <ul className="space-y-4">{cohorts.map((c) => (
                <li key={c.id} className="rounded-lg border border-teal-100 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><b>{c.name}</b><Badge tone={c.status === 'closed' ? 'grey' : 'teal'}>{c.status}</Badge></div>
                  <div className="text-xs text-slate-500">{c.format} · {d(c.start_date)}{c.expected_participants ? ` · about ${c.expected_participants} people` : ''}</div>
                  {c.readiness_override_note && <p className="mt-1 text-xs font-semibold text-[#C8553D]">Founder override: {c.readiness_override_note}</p>}
                  <p className="mt-1 text-xs text-slate-600">Team: {crew.filter((x) => x.cohort_id === c.id).map((x) => `${x.display_name} (${x.role})`).join(', ') || 'nobody assigned'}</p>
                  {isFounder && (
                    <>
                      <form action={setCohortStatus} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="cohort" value={c.id} /><input type="hidden" name="back" value={here} />
                        <label className="text-xs font-bold">Move to<select name="status" defaultValue={c.status} className={inputCls}>{['requested', 'quoted', 'confirmed', 'delivering', 'followup', 'closed'].map((s) => <option key={s}>{s}</option>)}</select></label>
                        {!ready && <label className="text-xs font-bold text-[#C8553D]">Override reason (only if not ready)<input name="override" className={inputCls} /></label>}
                        <button className={submitCls}>Change status</button>
                      </form>
                      <form action={assignToCohort} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="cohort" value={c.id} /><input type="hidden" name="back" value={here} />
                        <label className="text-xs font-bold">Add to team<select name="person" className={inputCls}><option value="">Choose…</option>{team.map((t) => <option key={t.id} value={t.id}>{t.display_name} (Tier {t.tier})</option>)}</select></label>
                        <label className="text-xs font-bold">As<select name="role" className={inputCls}><option value="lead">Lead</option><option value="co">Co-facilitator</option><option value="observer">Observer (trainee)</option></select></label>
                        <button className="rounded-lg border border-teal px-3 py-2 text-xs font-bold text-teal">Add</button>
                      </form>
                    </>)}
                </li>))}</ul>)}
          </Card>
        </div>
      </div>
    </>
  );
}
