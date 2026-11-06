import { greeting } from '@/lib/i18n';
import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, inputCls, submitCls } from '@/components/ui';
import { d, kes } from '@/lib/format';
import { ensureSessions } from '@/lib/sessions';
import { audit } from '@/lib/audit';
import { addTodo, doneTodo } from '../../supplier-actions';

type Item = { title: string; detail?: string; href: string; tone?: string };
type Group = { name: string; blurb: string; items: Item[] };

export default async function Needs() {
  const me = await requireMe('founder');
  await audit(me.id, 'view needs my decision', 'founder');
  const one = async (q: any, sql: string, args: any[] = []) => q(sql, args).catch(() => []);
  const D = await asUser(me.id, async (q) => ({
    exp: await one(q, "select r.amount_kes, r.reason, r.requester_id, p.display_name who, r.status from expense_requests r join people p on p.id=r.requester_id where r.status in ('submitted','queried') order by r.created_at"),
    toPay: await one(q, "select r.amount_kes, r.reason, p.display_name who from expense_requests r join people p on p.id=r.requester_id where r.status='approved' and r.paid_from='to_be_paid' order by r.created_at"),
    photos: await one(q, "select c.name cohort_name, count(*)::int n from session_photos p join cohorts c on c.id=p.cohort_id where p.status='pending' group by c.name"),
    people: await one(q, "select i.id, n.display_name nominator, i.full_name from invitations i join people n on n.id=i.nominated_by where i.status='nominated' order by i.created_at"),
    orgs: await one(q, "select s.name, n.display_name who from org_suggestions s join people n on n.id=s.suggested_by where s.status='suggested'"),
    sups: await one(q, "select s.name, p.display_name who from suppliers s left join people p on p.id=s.suggested_by where s.status='suggested'"),
    picks: await one(q, "select n.title, p.display_name who from sourcing_needs n join people p on p.id=n.raised_by where n.status='recommended'"),
    quotes: await one(q, "select qt.number, o.name org_name from quotes qt join organisations o on o.id=qt.organisation_id where qt.status='draft' order by qt.issued_on"),
    notices: await one(q, "select i.number inv, o.name org_name from payment_notices n join invoices i on i.id=n.invoice_id join organisations o on o.id=n.organisation_id where n.status='pending'"),
    unconf: await (async () => { for (const c of await one(q, "select id from cohorts where status in ('confirmed','delivering') and start_date <= current_date")) await ensureSessions(q, c.id).catch(() => {}); return one(q, "select c.name, s.day_number, s.session_date from sessions s join cohorts c on c.id=s.cohort_id where c.status in ('confirmed','delivering') and s.session_date <= current_date and s.attendance_confirmed_at is null order by s.session_date"); })(),
    welfare: await one(q, "select count(*)::int n from welfare_flags where status='open'"),
    alerts: await one(q, "select a.id, a.kind, a.severity, a.title, a.link from founder_alerts a where a.severity in ('attention','urgent') and not exists (select 1 from alert_reads r where r.alert_id=a.id and r.person_id=$1) order by a.created_at desc limit 12", [me.id]),
    todos: await one(q, 'select * from founder_todos where done_at is null order by due_on nulls last, created_at'),
  }));
  const own = D.exp.filter((r: any) => r.requester_id === me.id).length;
  const groups: Group[] = [
    { name: 'Money', blurb: 'Spending to confirm and pay.', items: [
      ...(D.exp.length ? [{ title: `${D.exp.length} expense record${D.exp.length === 1 ? '' : 's'} to decide`, detail: `${kes(D.exp.reduce((t: number, r: any) => t + r.amount_kes, 0))}${own ? `, ${own} of them yours (the other founder confirms those)` : ''}`, href: '/portal/approvals', tone: 'gold' }] : []),
      ...(D.toPay.length ? [{ title: `${D.toPay.length} approved, waiting to be paid`, detail: kes(D.toPay.reduce((t: number, r: any) => t + r.amount_kes, 0)), href: '/portal/approvals' }] : []),
      ...(D.notices.length ? D.notices.map((n: any) => ({ title: `${n.org_name} says they paid ${n.inv}`, detail: 'Check the bank or M-Pesa, then confirm the payment.', href: '/portal/deals', tone: 'gold' })) : []),
      ...(D.quotes.length ? D.quotes.map((n: any) => ({ title: `Quotation ${n.number} for ${n.org_name} is a draft`, detail: 'Review and release it.', href: '/portal/deals', tone: 'gold' })) : []),
    ] },
    { name: 'Programme', blurb: 'Quality and safeguarding.', items: [
      ...D.unconf.map((u: any) => ({ title: `Attendance not confirmed: ${u.name}, day ${u.day_number}`, detail: d(u.session_date), href: '/portal/attendance', tone: 'gold' })),
      ...D.photos.map((p: any) => ({ title: `${p.n} session photo${p.n === 1 ? '' : 's'} to check`, detail: p.cohort_name, href: '/portal/approvals', tone: 'gold' })),
      ...(D.welfare[0]?.n ? [{ title: `${D.welfare[0].n} open welfare flag${D.welfare[0].n === 1 ? '' : 's'}`, detail: 'Follow up with the trainer who raised it.', href: '/portal/people', tone: 'red' }] : []),
    ] },
    { name: 'People and onboarding', blurb: 'Who and what is waiting to join.', items: [
      ...D.people.map((p: any) => ({ title: `${p.full_name ?? 'Someone'} suggested by ${p.nominator}`, detail: 'Approve to create the account and get the one-time PIN.', href: '/portal/people', tone: 'gold' })),
      ...D.orgs.map((o: any) => ({ title: `Organisation suggested: ${o.name}`, detail: `by ${o.who}`, href: '/portal/people', tone: 'gold' })),
      ...D.sups.map((s: any) => ({ title: `Supplier suggested: ${s.name}`, detail: s.who ? `by ${s.who}` : undefined, href: '/portal/suppliers', tone: 'gold' })),
      ...D.picks.map((n: any) => ({ title: `Supplier choice to approve: ${n.title}`, detail: `recommended by ${n.who}`, href: '/portal/suppliers/needs', tone: 'gold' })),
    ] },
  ];
  const total = groups.reduce((t, g) => t + g.items.length, 0) + D.todos.length;
  return (
    <>
      <PageHeader image="/images/home-community.jpg" title="Needs my decision" subtitle={`${greeting('en', me.displayName)}. Everything waiting for a founder, gathered from across the portal. Open an item to act on it; it leaves this list once it is dealt with.`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat tone={total ? 'gold' : 'green'} label="Waiting for you" value={total} />
        <Stat label="Money" value={groups[0].items.length} />
        <Stat label="Programme" value={groups[1].items.length} />
        <Stat label="People" value={groups[2].items.length} />
      </div>
      {total === 0 && <p className="mb-4 rounded-lg bg-teal-50 p-3 text-sm text-teal">Nothing is waiting for you.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.filter((g) => g.items.length).map((g) => (
          <Card key={g.name} title={g.name} subtitle={g.blurb}>
            <ul className="space-y-2 text-sm">{g.items.map((i, k) => (
              <li key={k} className="rounded-lg bg-mist p-3"><Link href={i.href} className="font-bold text-teal underline">{i.title}</Link>{i.detail && <div className="text-xs text-slate-600">{i.detail}</div>}</li>))}</ul>
          </Card>))}
        {D.alerts.length > 0 && (
          <Card title="Alerts that need attention" subtitle="Unread alerts marked attention or urgent.">
            <ul className="space-y-2 text-sm">{D.alerts.map((a: any) => <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-mist p-3"><Link href={a.link || '/portal/alerts'} className="font-bold text-teal underline">{a.title}</Link><Badge tone={a.severity === 'urgent' ? 'red' : 'gold'}>{a.severity}</Badge></li>)}</ul>
            <p className="mt-2 text-xs"><Link href="/portal/alerts" className="font-bold text-teal underline">All alerts →</Link></p>
          </Card>)}
        <Card title="My own list" subtitle="Things only you can do, such as replying to a partner. Email will feed this list later.">
          <ul className="mb-3 space-y-2 text-sm">{D.todos.length === 0 && <li className="text-slate-500">Nothing on your list.</li>}{D.todos.map((t: any) => (
            <li key={t.id} className="flex items-start justify-between gap-2 rounded-lg bg-mist p-3">
              <div>{t.link ? <Link href={t.link} className="font-bold text-teal underline">{t.title}</Link> : <b>{t.title}</b>}{t.due_on && <span className="text-xs text-slate-600"> · due {d(t.due_on)}</span>}{t.details && <div className="text-xs text-slate-600">{t.details}</div>}</div>
              <form action={doneTodo}><input type="hidden" name="todo" value={t.id} /><button className="text-xs font-bold text-teal underline">Done</button></form>
            </li>))}</ul>
          <form action={addTodo} className="grid gap-2 border-t border-teal-50 pt-3 text-sm sm:grid-cols-[2fr_1fr_auto]">
            <input name="title" required placeholder="Reply to the KE740 director" className={inputCls} />
            <input name="due" type="date" className={inputCls} />
            <button className={submitCls}>Add</button>
            <input name="details" placeholder="Notes (optional)" className={`${inputCls} sm:col-span-3`} />
          </form>
        </Card>
      </div>
    </>
  );
}
