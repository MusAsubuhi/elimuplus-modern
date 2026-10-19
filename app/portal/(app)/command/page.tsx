import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, ImgBand, PageHeader, Stat } from '@/components/ui';
import { BarCard, Gauge, LineCard, PieCard } from '@/components/charts';
import { followupStats } from '@/lib/data';
import { kes, pct } from '@/lib/format';
import { audit } from '@/lib/audit';

export default async function Command() {
  const me = await requireMe('founder');
  await audit(me.id, 'view command', 'dashboard');
  const D = await asUser(me.id, async (q) => ({
    inv: await q(`select coalesce(sum(amount_kes),0)::int billed from invoices`),
    paid: await q(`select coalesce(sum(amount_kes),0)::int paid from payments`),
    exp: await q(`select coalesce(sum(coalesce(paid_amount_kes,amount_kes)),0)::int spent from expense_requests where status in ('paid','reconciled')`),
    fees: await q(`select coalesce(sum(amount_kes),0)::int fees from trainer_payments`),
    support: await q(`select coalesce(sum(amount_kes),0)::int s from support_ledger`),
    monthly: await q(`select to_char(m,'Mon') mon, m,
        coalesce((select sum(amount_kes) from payments where date_trunc('month',received_on)=m),0)::int income,
        (coalesce((select sum(coalesce(paid_amount_kes,amount_kes)) from expense_requests where status in ('paid','reconciled') and date_trunc('month',paid_on)=m),0)
         + coalesce((select sum(amount_kes) from trainer_payments where date_trunc('month',paid_on)=m),0))::int spent
        from generate_series(date_trunc('month',current_date) - interval '5 months', date_trunc('month',current_date), interval '1 month') m order by m`),
    byCat: await q(`select coalesce(k.name,'Other') name, sum(coalesce(r.paid_amount_kes,r.amount_kes))::int value from expense_requests r left join expense_categories k on k.id=r.category_id where r.status in ('paid','reconciled') group by 1 order by 2 desc`),
    byOrg: await q(`select o.name, coalesce(sum(p.amount_kes),0)::int value from organisations o join invoices i on i.organisation_id=o.id join payments p on p.invoice_id=i.id group by o.name having sum(p.amount_kes)>0`),
    follow: await q(`select s.visit, s.status, s.due_date, v.sold_within_14_days sold from followup_schedule s left join followup_visits v on v.schedule_id=s.id`),
    cohorts: await q(`select c.name, c.status, (select count(*) from enrolments e where e.cohort_id=c.id)::int enrolled, (select count(*) from enrolments e where e.cohort_id=c.id and e.status='completed')::int completed from cohorts c join organisations o on o.id=c.organisation_id where not o.is_internal order by c.seq`),
    pendingExp: await q(`select count(*)::int n, coalesce(sum(amount_kes),0)::int amt from expense_requests where status in ('submitted','queried')`),
    drafts: await q(`select count(*)::int n from reports where status <> 'released'`),
    noms: await q(`select count(*)::int n from invitations where status='nominated'`),
    welfare: await q(`select count(*)::int n from welfare_flags where status='open'`),
    people: await q(`select count(*)::int n from people`),
  }));
  const billed = D.inv[0].billed, paid = D.paid[0].paid, spent = D.exp[0].spent + D.fees[0].fees;
  const fs = followupStats(D.follow.map((f) => ({ ...f, sold_within_14_days: f.sold })));
  const overdue = D.follow.filter((f) => f.status === 'scheduled' && new Date(f.due_date) < new Date()).length;
  const fPie = ['done', 'scheduled', 'unreachable', 'missed'].map((s) => ({ name: s, value: D.follow.filter((f) => f.status === s).length, color: { done: '#0D3B3B', scheduled: '#D4A843', unreachable: '#C8553D', missed: '#9AA5A0' }[s] })).filter((x) => x.value);
  const pipeline = ['requested', 'quoted', 'confirmed', 'delivering', 'followup', 'closed'].map((s) => ({ stage: s, cohorts: D.cohorts.filter((c) => c.status === s).length }));
  return (
    <>
      <PageHeader image="/images/hero-bg.jpg" title={`Good day, ${me.displayName}`} subtitle="The whole of Elimu+ in one view: money in and out, how participants are doing, and what needs you today." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat tone="green" label="Received" value={kes(paid)} sub={`${kes(billed - paid)} still outstanding`} />
        <Stat tone="red" label="Spent" value={kes(spent)} sub="requests paid + trainer fees" />
        <Stat tone="gold" label="Net" value={kes(paid - spent)} sub={`${pct(paid - spent, paid)}% margin on cash received`} />
        <Stat label="Support given to participants" value={kes(D.support[0].s)} sub="kept separate from fees and costs" />
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        {[
          { href: '/portal/approvals', n: D.pendingExp[0].n, label: 'Expense requests to decide', sub: kes(D.pendingExp[0].amt) },
          { href: '/portal/command', n: overdue, label: 'Follow-ups overdue', sub: 'see cohort pages' },
          { href: '/portal/qa', n: D.drafts[0].n, label: 'Reports not yet released', sub: 'review then release' },
          { href: '/portal/people', n: D.noms[0].n + D.welfare[0].n, label: 'Nominations and welfare flags', sub: `${D.noms[0].n} nominations · ${D.welfare[0].n} open flags` },
        ].map((a) => (
          <Link key={a.label} href={a.href} className={`rounded-xl border p-4 shadow-sm transition hover:shadow-md ${a.n ? 'border-gold bg-gold-100' : 'border-teal-100 bg-white'}`}>
            <div className="text-3xl font-black text-teal">{a.n}</div><div className="text-sm font-bold">{a.label}</div><div className="text-xs text-slate-600">{a.sub}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Money in and out, by month" className="lg:col-span-2"><BarCard data={D.monthly} x="mon" money height={260} bars={[{ key: 'income', label: 'Received', color: '#0D3B3B' }, { key: 'spent', label: 'Spent', color: '#D4A843' }]} /></Card>
        <Card title="Survival at 90 days" subtitle="At least one sale in the 14 days before the visit"><Gauge value={fs[2].survival} target={75} label={`${fs[2].survived} of ${fs[2].done} reached`} /></Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Spend by category"><PieCard data={D.byCat as any} money height={250} /></Card>
        <Card title="Income by partner"><PieCard data={D.byOrg as any} money height={250} /></Card>
        <Card title="Follow-up visits"><PieCard data={fPie} height={250} /></Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Survival and reach by visit" className="lg:col-span-2"><LineCard data={fs.map((f) => ({ visit: `${f.visit}-day`, survival: f.survival, reach: f.reach, target: 75 }))} x="visit" height={240} lines={[{ key: 'survival', label: '% still trading' }, { key: 'reach', label: '% reached', color: '#D4A843' }, { key: 'target', label: 'Target', color: '#C8553D' }]} /></Card>
        <Card title="Cohort pipeline"><BarCard data={pipeline} x="stage" height={240} bars={[{ key: 'cohorts', label: 'Cohorts', color: '#2E8B7A' }]} /></Card>
      </div>
      <Card title="Cohort outcomes" className="mt-4"><BarCard data={D.cohorts.map((c) => ({ cohort: c.name.replace(/ \(.*\)/, ''), enrolled: c.enrolled, completed: c.completed }))} x="cohort" height={220} bars={[{ key: 'enrolled', label: 'Enrolled' }, { key: 'completed', label: 'Completed', color: '#D4A843' }]} /></Card>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <ImgBand src="/images/home-community.jpg" className="h-40" caption={`${D.people[0].n} people on the platform`} />
        <ImgBand src="/images/home-follow-up-visit.jpg" className="h-40" caption="Follow-up is where the impact shows" />
        <ImgBand src="/images/trainer-certificate.jpg" className="h-40" caption="Certified trainers carry the standard" />
      </div>
    </>
  );
}
