import { asUser } from '@/lib/db';
import { requirePartner } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, statusTone, submitCls } from '@/components/ui';
import { d } from '@/lib/format';
import { addRoster, confirmExtras, removeRoster } from '../../../partner-actions';
import { rosterRoom, supplementCost } from '@/lib/roster';
import { kes } from '@/lib/format';
import { RosterForm, SearchBox } from '@/components/roster-form';

export default async function PartnerRoster({ searchParams }: { searchParams: Promise<{ cohort?: string }> }) {
  const me = await requirePartner();
  const sp = await searchParams;
  const { cohorts, rows } = await asUser(me.id, async (q) => ({
    cohorts: await q(`select c.id, c.name, c.start_date, c.status, c.expected_participants,
        (select count(*) from cohort_roster r where r.cohort_id=c.id and r.status<>'withdrawn')::int listed
        from cohorts c where c.organisation_id in (select app.my_org_admin_orgs()) and c.status in ('requested','quoted','confirmed','delivering') order by c.seq`),
    rows: await q(`select * from cohort_roster order by created_at`),
  }));
  // With more than one training, never guess which one: the partner picks it, so people are not added to the wrong training by accident.
  const chosen = cohorts.find((c) => c.id === sp.cohort) ?? (cohorts.length === 1 ? cohorts[0] : undefined);
  const room = chosen ? await asUser(me.id, (q) => rosterRoom(q, chosen.id)) : null;
  const all = rows.filter((r) => r.cohort_id === chosen?.id);
  const mine = all.filter((r) => r.status !== 'pending_extra');
  const extras = all.filter((r) => r.status === 'pending_extra');
  const cost = room && room.quoted && extras.length ? supplementCost(room.cap ?? room.quoted, extras.length, room.sessions) : null;
  return (
    <>
      <PageHeader image="/images/partner-process-meeting.jpg" title="Add your participants" subtitle="Load the people you want us to train before the first day, so the register is ready when we arrive." />
      {!cohorts.length ? <Card><p className="text-sm text-slate-600">You have no upcoming cohort yet. Once a training is requested or confirmed, you can load its participants here.</p></Card> : !chosen ? (
        <Card title="Which training are you adding people to?" subtitle="Each training has its own list, its own quotation and its own invoice. Choose the one these people belong to.">
          <div className="grid gap-3 sm:grid-cols-2">
            {cohorts.map((c) => (
              <a key={c.id} href={`/portal/partner/roster?cohort=${c.id}`} className="block rounded-xl border border-teal-100 bg-white p-4 hover:bg-mist">
                <div className="flex items-center justify-between gap-2"><b className="text-teal">{c.name}</b><Badge tone={statusTone(c.status)}>{c.status}</Badge></div>
                <p className="mt-1 text-xs text-slate-600">{c.start_date ? `Starts ${d(c.start_date)}` : 'Start date to be confirmed'} · {c.listed} listed{c.expected_participants ? ` of ${c.expected_participants} expected` : ''}</p>
              </a>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">Want to run a different training altogether? That is a new request, with its own quotation: <a className="font-bold text-teal underline" href="/portal/partner/request">Request a training</a>.</p>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {cohorts.map((c) => <a key={c.id} href={`/portal/partner/roster?cohort=${c.id}`} className={`rounded-full px-3 py-1 text-sm font-bold ${c.id === chosen.id ? 'bg-teal text-white' : 'border border-teal-100 bg-white text-teal'}`}>{c.name}</a>)}
          </div>
          <p className="mb-4 rounded-lg bg-mist p-3 text-sm text-slate-700">You are adding people to <b>{chosen.name}</b> only. Each training has its own list and its own quotation. To run a different training, <a className="font-bold text-teal underline" href="/portal/partner/request">request a new training</a> instead; it is quoted and invoiced on its own.</p>
          <div className="mb-6 rounded-2xl border border-teal-100 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-lg font-extrabold text-teal">{room?.cap ? `${Math.min(mine.length, room.cap)} of ${room.cap} places filled` : `${mine.length} listed`}</p>
              <p className="text-sm text-slate-600">Training starts {d(chosen.start_date) || 'on a date we will confirm'}</p>
            </div>
            {room?.cap ? <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={room.cap} aria-valuenow={Math.min(mine.length, room.cap)}><div className="h-full rounded-full bg-teal" style={{ width: `${Math.min(100, Math.round((mine.length / room.cap) * 100))}%` }} /></div> : null}
            {room?.cap && room.confirmed && mine.length >= room.cap ? <p className="mt-2 text-sm text-slate-700">All the places on this training’s quotation are filled. Anyone you add now to {chosen.name} is held as an extra, billed on a supplemental invoice for this training only, and only after you confirm.</p> : null}
            {room && !room.confirmed ? <p className="mt-2 text-sm text-slate-700">This training is not confirmed yet, so list everyone you plan to bring. Nothing extra is charged at this stage{room.cap && mine.length > room.cap ? `; you have listed more than the ${room.cap} on the quotation, and we will update the quotation to match before you confirm` : ''}.</p> : null}
          </div>
          <div className="grid gap-4 lg:grid-cols-5">
            <Card title="Add people" subtitle="Name, phone number, age and gender are needed for everyone" className="lg:col-span-2">
              <RosterForm cohort={chosen.id} action={addRoster} />
              <details className="mt-5 rounded-lg border border-teal-100 p-3 text-sm">
                <summary className="cursor-pointer font-bold text-teal">Have a long list? Paste it from Excel</summary>
                <form action={addRoster} className="mt-3 space-y-3">
                  <input type="hidden" name="cohort" value={chosen.id} />
                  <textarea name="list" rows={6} className={inputCls} placeholder={'Amina Wanjiru, 0712345678, F, 19\nJuma Otieno, 0722111222, M, 22'} />
                  <p className="text-xs text-slate-500">One person per line: name, phone, F or M, age. For anyone under 18, add “yes” at the end to show a parent or guardian agreed. Adults agree for themselves, so tick the box below; no guardian is needed for them.</p>
                  <label className="flex items-start gap-2 text-xs"><input type="checkbox" name="adults_agreed" className="mt-0.5" /><span>Everyone aged 18 or over on this list has agreed to take part, and to be contacted for follow-up visits.</span></label>
                  <button className={submitCls}>Add the pasted list</button>
                </form>
              </details>
            </Card>
            <Card title={`People listed for ${chosen.name}`} subtitle="You can remove someone until the training starts" className="lg:col-span-3">
              {mine.length > 10 && <SearchBox target="roster" />}
              <Table head={['Name', 'Phone', 'Age', '']}
                rowAttrs={() => ({ 'data-row-of': 'roster' })}
                rows={mine.map((r) => [<b key="n">{r.full_name}</b>, r.phone ?? '', r.birth_year ? new Date().getFullYear() - r.birth_year : '',
                  r.status === 'expected' ? <form key="x" action={removeRoster}><input type="hidden" name="id" value={r.id} /><button className="text-xs font-bold text-red-700 underline">Remove</button></form> : <Badge key="s" tone={statusTone('completed')}>enrolled</Badge>])}
                empty="Nobody listed yet. Add your first person on the left." />
            </Card>
          </div>
          {extras.length > 0 && (
            <Card title={`${extras.length} extra ${extras.length === 1 ? 'person' : 'people'} waiting for your confirmation`} subtitle="These are beyond the number on this training’s quotation, so they are not on the cohort yet" className="mt-4">
              <p className="text-sm text-slate-700">Your quotation covers {room?.cap ?? '—'} people and you have listed {room?.active ?? 0}. These are extra people for {chosen.name}, which is already confirmed. They are billed on a supplemental invoice for this training. This is not a new training; a different training is requested separately under Request a training.{cost ? ` For ${extras.length} extra ${extras.length === 1 ? 'person' : 'people'} that comes to ${kes(cost.total)} (${kes(cost.rate)} × ${room?.sessions} sessions, for each person).` : ''} Nothing is invoiced until you confirm; we check the invoice before it is sent to you.</p>
              <Table head={['Name', 'Phone', 'Gender', 'Born', '']} rows={extras.map((r) => [<b key="n">{r.full_name}</b>, r.phone ?? '', r.gender ?? '', r.birth_year ?? '',
                <form key="x" action={removeRoster}><input type="hidden" name="id" value={r.id} /><button className="text-xs font-bold text-red-700 underline">Remove</button></form>])} />
              <form action={confirmExtras} className="mt-3"><input type="hidden" name="cohort" value={chosen.id} /><button className={submitCls}>Confirm {extras.length} extra and request the supplemental invoice</button></form>
            </Card>
          )}
        </>
      )}
    </>
  );
}
