import Link from 'next/link';
import { asAdmin } from '@/lib/db';
import { requireFeature, featureLevel } from '@/lib/access';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import { d, kes } from '@/lib/format';
import { STAGE_PROB, todayEAT } from '@/lib/ops';
import { addLead, addLeadActivity, moveLead, saveLeadNext } from '../../biz-actions';

const STAGES = ['new', 'contacted', 'meeting', 'proposal', 'negotiation', 'won', 'lost'];
const lbl = 'block text-xs font-bold text-slate-600';
export default async function Sales() {
  const me = await requireFeature('sales');
  const canEdit = (await featureLevel(me, 'sales')) === 'edit';
  const today = todayEAT();
  const X = await asAdmin(async (q) => ({
    leads: await q(`select l.*, l.next_on::text nx, expected_kes::float8 exp, (select max(happened_on)::text from lead_activities a where a.lead_id=l.id) last_touch from leads l order by (l.stage in ('won','lost')), l.next_on nulls last, l.created_at desc`),
    acts: await q(`select a.*, l.name from lead_activities a join leads l on l.id=a.lead_id order by a.happened_on desc, a.created_at desc limit 12`),
  }));
  const open = X.leads.filter((l: any) => !['won', 'lost'].includes(l.stage));
  const won = X.leads.filter((l: any) => l.stage === 'won').length, lost = X.leads.filter((l: any) => l.stage === 'lost').length;
  const due = open.filter((l: any) => l.nx && l.nx <= today);
  return (
    <>
      {!canEdit && <div className="mb-4 rounded-xl border border-gold bg-gold-100 p-3 text-sm font-bold text-teal">You can look at this page but not change it. Ask a founder if you need to edit.</div>}
      <fieldset disabled={!canEdit} className="contents">
      <PageHeader image="/images/hero-bg.jpg" title="Sales pipeline" subtitle="Organisations and groups you are talking to before they sign. Once a lead is won, create the organisation and the quote under Partners and Proposals.">
        <Link href="/portal/crm" className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-teal">Partner calls and visits</Link>
      </PageHeader>
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Open leads" value={open.length} /><Stat tone="gold" label="Pipeline value" value={kes(open.reduce((a: number, l: any) => a + l.exp, 0))} />
        <Stat tone="green" label="Weighted by stage" value={kes(open.reduce((a: number, l: any) => a + l.exp * (STAGE_PROB[l.stage] ?? 0), 0))} sub="value × chance at that stage" />
        <Stat tone="red" label="Follow-ups due" value={due.length} sub={won + lost ? `${Math.round((won / (won + lost)) * 100)}% of closed leads won` : ''} />
      </div>
      <div className="space-y-5">
        <Card title="Leads" subtitle="Sorted by next follow-up date. Change the stage as the conversation moves.">
          <Table head={['Lead', 'Stage', 'Value', 'Next step', 'Last touch', 'Move to']}
            rows={X.leads.map((l: any) => [
              <div key="n"><b>{l.name}</b><div className="text-xs text-slate-500">{[l.contact_name, l.phone, l.source].filter(Boolean).join(' · ')}{l.participants ? ` · about ${l.participants} people` : ''}</div></div>,
              <Badge key="s" tone={l.stage === 'won' ? 'green' : l.stage === 'lost' ? 'grey' : 'gold'}>{l.stage}</Badge>, kes(l.exp),
              ['won', 'lost'].includes(l.stage) ? (l.lost_reason ?? '') : <form key="f" action={saveLeadNext} className="flex flex-wrap gap-1"><input type="hidden" name="id" value={l.id} /><input name="next_step" defaultValue={l.next_step ?? ''} placeholder="Next step" className="w-36 rounded border border-teal-100 px-1 py-0.5 text-xs" /><input type="date" name="next_on" defaultValue={l.nx ?? ''} className={`rounded border px-1 py-0.5 text-xs ${l.nx && l.nx <= today ? 'border-red-400' : 'border-teal-100'}`} /><button className="text-xs font-bold text-teal underline">Save</button></form>,
              l.last_touch ? d(l.last_touch) : '',
              <form key="m" action={moveLead} className="flex flex-wrap gap-1"><input type="hidden" name="id" value={l.id} /><select name="stage" defaultValue={l.stage} className="rounded border border-teal-100 px-1 py-0.5 text-xs">{STAGES.map((s) => <option key={s}>{s}</option>)}</select><input name="lost_reason" placeholder="If lost, why" className="w-24 rounded border border-teal-100 px-1 py-0.5 text-xs" /><button className="text-xs font-bold text-teal underline">Go</button></form>])} empty="No leads yet. Add the first below." />
        </Card>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Add a lead">
            <form action={addLead} className="grid gap-3 sm:grid-cols-2">
              <label className={`${lbl} sm:col-span-2`}>Organisation or group<input name="name" required className={inputCls} /></label>
              <label className={lbl}>Contact person<input name="contact_name" className={inputCls} /></label><label className={lbl}>Phone<input name="phone" className={inputCls} /></label>
              <label className={lbl}>Source (referral, forum, social)<input name="source" className={inputCls} /></label><label className={lbl}>Expected value (KES)<input name="expected_kes" inputMode="decimal" className={inputCls} /></label>
              <label className={lbl}>About how many participants<input name="participants" inputMode="numeric" className={inputCls} /></label><label className={lbl}>Next follow-up<input type="date" name="next_on" className={inputCls} /></label>
              <label className={`${lbl} sm:col-span-2`}>Next step<input name="next_step" className={inputCls} /></label>
              <div className="sm:col-span-2"><button className={submitCls}>Add lead</button></div>
            </form>
          </Card>
          <Card title="Log a call, visit or message">
            <form action={addLeadActivity} className="grid gap-3 sm:grid-cols-2">
              <label className={`${lbl} sm:col-span-2`}>Lead<select name="lead_id" className={inputCls}>{open.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
              <label className={lbl}>What<select name="kind" className={inputCls}>{['call', 'visit', 'whatsapp', 'email', 'meeting', 'note'].map((k) => <option key={k}>{k}</option>)}</select></label>
              <label className={lbl}>Date<input type="date" name="on" defaultValue={today} className={inputCls} /></label>
              <label className={`${lbl} sm:col-span-2`}>What was said or agreed<input name="note" className={inputCls} /></label>
              <div className="sm:col-span-2"><button className={submitCls}>Log it</button></div>
            </form>
            <div className="mt-4 space-y-1 text-xs text-slate-600">{X.acts.map((a: any) => <div key={a.id}><b>{d(a.happened_on)}</b> · {a.name} · {a.kind}{a.note ? `: ${a.note}` : ''}</div>)}</div>
          </Card>
        </div>
      </div>
      </fieldset>
    </>
  );
}
