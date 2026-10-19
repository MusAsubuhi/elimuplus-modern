import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, statusTone, submitCls } from '@/components/ui';
import { d } from '@/lib/format';
import { addRoster, removeRoster } from '../../../partner-actions';

export default async function PartnerRoster({ searchParams }: { searchParams: Promise<{ cohort?: string }> }) {
  const me = await requireMe('org_admin');
  const sp = await searchParams;
  const { cohorts, rows } = await asUser(me.id, async (q) => ({
    cohorts: await q(`select c.id, c.name, c.start_date, c.status, c.expected_participants,
        (select count(*) from cohort_roster r where r.cohort_id=c.id and r.status<>'withdrawn')::int listed
        from cohorts c where c.organisation_id in (select app.my_org_admin_orgs()) and c.status in ('requested','quoted','confirmed','delivering') order by c.start_date nulls last`),
    rows: await q(`select * from cohort_roster order by created_at`),
  }));
  const chosen = cohorts.find((c) => c.id === sp.cohort) ?? cohorts[0];
  const mine = rows.filter((r) => r.cohort_id === chosen?.id);
  return (
    <>
      <PageHeader image="/images/partner-process-meeting.jpg" title="Add your participants" subtitle="Load the people you want us to train before the first day, so the register is ready when we arrive." />
      {!cohorts.length ? <Card><p className="text-sm text-slate-600">You have no upcoming cohort yet. Once a training is requested or confirmed, you can load its participants here.</p></Card> : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {cohorts.map((c) => <a key={c.id} href={`/portal/partner/roster?cohort=${c.id}`} className={`rounded-full px-3 py-1 text-sm font-bold ${c.id === chosen.id ? 'bg-teal text-white' : 'border border-teal-100 bg-white text-teal'}`}>{c.name}</a>)}
          </div>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Stat label="Listed so far" value={mine.filter((r) => r.status !== 'withdrawn').length} />
            <Stat tone="gold" label="Quoted for" value={chosen.expected_participants ?? '—'} />
            <Stat tone="teal" label="Training starts" value={d(chosen.start_date) || 'to be set'} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Paste your list" subtitle="One person per line, copied from Excel or Sheets" className="lg:col-span-1">
              <form action={addRoster} className="space-y-3 text-sm">
                <input type="hidden" name="cohort" value={chosen.id} />
                <textarea name="list" rows={10} required className={inputCls} placeholder={'Amina Wanjiru, 0712345678, F, 2004, yes\nJuma Otieno, 0722111222, M, 2002'} />
                <p className="text-xs text-slate-500">Columns: full name, phone, F or M, year of birth, and “yes” if a parent or guardian has agreed for anyone under 18. Only the name is required. Phone numbers help us confirm people on the day and follow up afterwards.</p>
                <button className={submitCls}>Add to the list</button>
              </form>
            </Card>
            <Card title={`People listed for ${chosen.name}`} subtitle="You can remove someone until the training starts" className="lg:col-span-2">
              <Table head={['Name', 'Phone', 'Gender', 'Born', 'Status', '']}
                rows={mine.map((r) => [<b key="n">{r.full_name}</b>, r.phone ?? '', r.gender ?? '', r.birth_year ?? '', <Badge key="s" tone={statusTone(r.status === 'enrolled' ? 'completed' : r.status)}>{r.status === 'expected' ? 'expected' : r.status}</Badge>,
                  r.status === 'expected' ? <form key="x" action={removeRoster}><input type="hidden" name="id" value={r.id} /><button className="text-xs font-bold text-red-700 underline">Remove</button></form> : ''])}
                empty="Nobody listed yet. Paste your list on the left." />
            </Card>
          </div>
        </>
      )}
    </>
  );
}
