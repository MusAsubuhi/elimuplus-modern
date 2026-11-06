import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import { d } from '@/lib/format';
import { addDays, todayEAT } from '@/lib/ops';
import { addCompliance, addDataRequest, closeDataRequest, completeCompliance, setComplianceDate } from '../../biz-actions';

const lbl = 'block text-xs font-bold text-slate-600';
const CAT: Record<string, string> = { tax: 'Tax', statutory: 'Statutory', licence: 'Licence', insurance: 'Insurance', data_protection: 'Data protection', safeguarding: 'Safeguarding', contract: 'Contract', other: 'Other' };
export default async function Compliance({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams; const me = await requireMe('founder'); const today = todayEAT(); const soon = addDays(today, 14);
  const view = sp.view === 'requests' ? 'requests' : 'calendar';
  const X = await asUser(me.id, async (q) => ({
    items: await q(`select *, due_on::text due, last_done_on::text ld from compliance_items order by status='done', due_on nulls first, title`),
    reqs: await q(`select *, received_on::text ro, due_on::text due from data_requests order by status='open' desc, due_on`),
    cohorts: await q(`select count(*)::int n from cohorts`),
  }));
  const open = X.items.filter((i: any) => i.status === 'open');
  const tab = (k: string, t: string) => <Link key={k} href={`/portal/compliance?view=${k}`} className={`rounded-full px-4 py-1.5 text-sm font-bold ${view === k ? 'bg-teal text-white' : 'border border-teal-100 bg-white text-teal'}`}>{t}</Link>;
  const KIND: Record<string, string> = { access: 'See their data', correction: 'Correct their data', deletion: 'Delete their data', withdraw_consent: 'Withdraw consent', complaint: 'Complaint' };
  return (
    <>
      <PageHeader image="/images/hero-bg.jpg" title="Compliance" subtitle="Filings, licences, insurance and policies with their due dates, and the requests people make about their own data. Starter items are suggestions: set the real dates and confirm the obligations with your accountant or lawyer." />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat tone="red" label="Overdue" value={open.filter((i: any) => i.due && i.due < today).length} /><Stat tone="gold" label="Due in 14 days" value={open.filter((i: any) => i.due && i.due >= today && i.due <= soon).length} />
        <Stat label="No date set yet" value={open.filter((i: any) => !i.due).length} /><Stat tone="red" label="Data requests open" value={X.reqs.filter((r: any) => r.status === 'open').length} />
      </div>
      <div className="mb-5 flex gap-2">{tab('calendar', 'Compliance calendar')}{tab('requests', 'Data requests')}</div>
      {view === 'calendar' && (
        <div className="space-y-5">
          <Card title="Obligations">
            <Table head={['What', 'Who it is for', 'Type', 'Due', 'Last done', 'Set date or mark done']}
              rows={X.items.map((i: any) => [<div key="t"><b className={i.status === 'done' ? 'text-slate-400' : ''}>{i.title}</b>{i.note && <div className="text-xs text-slate-500">{i.note}</div>}</div>, i.authority ?? '', CAT[i.category], 
                i.status === 'done' ? <Badge key="x" tone="green">done</Badge> : i.due ? <span key="d" className={i.due < today ? 'font-bold text-red-700' : i.due <= soon ? 'font-bold text-amber-700' : ''}>{d(i.due)}{i.recurrence !== 'none' ? ` · ${i.recurrence}` : ''}</span> : <Badge key="n" tone="red">set a date</Badge>, i.ld ? d(i.ld) : '',
                i.status === 'done' ? '' : <div key="a" className="flex flex-wrap gap-2">
                  <form action={setComplianceDate} className="flex gap-1"><input type="hidden" name="id" value={i.id} /><input type="date" name="due_on" defaultValue={i.due ?? ''} className="rounded border border-teal-100 px-1 py-0.5 text-xs" /><button className="text-xs font-bold text-teal underline">Set</button></form>
                  <form action={completeCompliance} className="flex gap-1"><input type="hidden" name="id" value={i.id} /><input name="evidence_note" placeholder="Receipt or reference" className="w-28 rounded border border-teal-100 px-1 py-0.5 text-xs" /><button className="rounded bg-teal px-2 py-0.5 text-xs font-bold text-white">Done</button></form></div>])} />
          </Card>
          <Card title="Add an obligation">
            <form action={addCompliance} className="grid gap-3 sm:grid-cols-4">
              <label className={`${lbl} sm:col-span-2`}>What<input name="title" required className={inputCls} /></label><label className={lbl}>Authority or party<input name="authority" className={inputCls} /></label>
              <label className={lbl}>Type<select name="category" className={inputCls}>{Object.entries(CAT).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
              <label className={lbl}>Due<input type="date" name="due_on" className={inputCls} /></label><label className={lbl}>Repeats<select name="recurrence" className={inputCls}>{['none', 'monthly', 'quarterly', 'yearly'].map((r) => <option key={r}>{r}</option>)}</select></label>
              <label className={`${lbl} sm:col-span-2`}>Note<input name="note" className={inputCls} /></label>
              <div className="sm:col-span-4"><button className={submitCls}>Add</button></div>
            </form>
          </Card>
        </div>
      )}
      {view === 'requests' && (
        <div className="space-y-5">
          <Card title="Requests about personal data" subtitle="When someone asks to see, correct or delete what Elimu+ holds about them, or to withdraw photo consent, answer within 30 days. Log it here so it is not missed.">
            <Table head={['Received', 'From', 'Request', 'Answer by', 'Outcome']}
              rows={X.reqs.map((r: any) => [d(r.ro), r.from_name, KIND[r.kind], <span key="d" className={r.status === 'open' && r.due < today ? 'font-bold text-red-700' : ''}>{d(r.due)}</span>,
                r.status === 'open' ? <form key="o" action={closeDataRequest} className="flex gap-1"><input type="hidden" name="id" value={r.id} /><input name="outcome" placeholder="What was done" className="w-40 rounded border border-teal-100 px-1 py-0.5 text-xs" /><button className="text-xs font-bold text-teal underline">Close</button></form> : r.outcome ?? 'Done'])} empty="No requests." />
          </Card>
          <Card title="Log a request">
            <form action={addDataRequest} className="grid gap-3 sm:grid-cols-4">
              <label className={lbl}>From<input name="from_name" required className={inputCls} /></label>
              <label className={lbl}>Request<select name="kind" className={inputCls}>{Object.entries(KIND).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
              <label className={lbl}>Received<input type="date" name="received_on" defaultValue={today} className={inputCls} /></label>
              <div className="flex items-end"><button className={submitCls}>Log it</button></div>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
