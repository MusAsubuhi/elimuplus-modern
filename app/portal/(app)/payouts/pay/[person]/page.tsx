import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { levelName } from '@/lib/levels';
import { METHOD_LABEL, PROVIDERS } from '@/lib/payouts';
import { Badge, Card, PageHeader } from '@/components/ui';
import PayForm from '@/components/pay-form';
import { d, kes } from '@/lib/format';
import { recordPayout } from '../../../../payout-actions';

/** The payment page: one trainer, the approved work being paid for, and the two ways to pay (one live now, one that arrives later). */
export default async function PayTrainer({ params }: { params: Promise<{ person: string }> }) {
  const me = await requireMe('founder');
  const { person } = await params;
  if (!/^[0-9a-f-]{36}$/.test(person)) notFound();
  const { who, claims, method, tier, recent } = await asUser(me.id, async (q) => ({
    who: (await q('select id, full_name, display_name from people where id=$1', [person]))[0],
    claims: await q(`select c.*, co.name cohort from payout_claims c left join cohorts co on co.id=c.cohort_id where c.person_id=$1 and c.status='approved' order by c.created_at`, [person]),
    method: (await q('select * from payout_methods where person_id=$1', [person]))[0] ?? null,
    tier: Number((await q("select coalesce(max(tier),0) t from role_assignments where person_id=$1 and role='facilitator' and status='active'", [person]))[0].t),
    recent: await q('select * from payouts where person_id=$1 order by paid_on desc limit 3', [person]),
  }));
  if (!who) notFound();
  if (!claims.length) redirect('/portal/payouts?tab=pay');
  await audit(me.id, 'opened payment page', 'payouts');
  const own = person === me.id;
  const today = new Date().toISOString().slice(0, 10);
  const items = claims.map((c) => ({ id: c.id, description: c.description, amount: Number(c.amount_kes), sub: `${c.cohort ?? 'General'} · approved ${d(c.decided_on)}` }));
  const total = items.reduce((s, i) => s + i.amount, 0);
  const manual = PROVIDERS[0], mpesa = PROVIDERS[1];

  return (
    <>
      <PageHeader image="/images/trainer-team.jpg" title={`Pay ${who.display_name}`} subtitle="Check the work and the payment details, pay from your M-Pesa app, then record the code here so it shows on their earnings page.">
        <Link href="/portal/payouts?tab=pay" className="rounded-lg border border-white/50 px-4 py-2 text-sm font-bold text-white">← All payments</Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="Who is being paid">
            <p className="text-lg font-bold text-teal">{who.full_name}</p>
            <p className="text-sm text-slate-600">{levelName(tier)}</p>
            <hr className="my-3 border-teal-100" />
            {method ? (
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Pays by</dt><dd className="font-semibold">{METHOD_LABEL[method.method]}</dd></div>
                {method.phone && <div className="flex justify-between"><dt className="text-slate-500">Number</dt><dd className="font-mono font-semibold">{method.phone}</dd></div>}
                {method.account_name && <div className="flex justify-between"><dt className="text-slate-500">Registered name</dt><dd className="font-semibold">{method.account_name}</dd></div>}
                <div className="flex justify-between"><dt className="text-slate-500">Details</dt><dd>{method.verified_on ? <Badge tone="green">confirmed {d(method.verified_on)}</Badge> : <Badge tone="gold">not confirmed</Badge>}</dd></div>
              </dl>
            ) : <p className="text-sm font-semibold text-[#C8553D]">No payment details yet. Ask them to add an M-Pesa number on their earnings page, or pay by cash or bank transfer.</p>}
            {method && !method.verified_on && <p className="mt-3 rounded-lg bg-gold-100 p-3 text-xs text-gold-600">Call them on a number you already know and confirm this one before paying. Then mark it confirmed on the previous page.</p>}
          </Card>
          {recent.length > 0 && (
            <Card title="Last payments to them"><ul className="space-y-1 text-sm">{recent.map((p) => <li key={p.id} className="flex justify-between"><span>{d(p.paid_on)} · {METHOD_LABEL[p.method]}</span><b>{kes(p.amount_kes)}</b></li>)}</ul></Card>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card title={manual.label} subtitle="Available now" action={<Badge tone="green">live</Badge>}>
            <PayForm person={person} items={items} action={recordPayout} today={today} defaultMethod={method?.method === 'mpesa' ? 'mpesa' : method?.method ?? 'cash'}
              hasMpesa={method?.method === 'mpesa'} locked={own ? 'This is your own pay. The other founder records it.' : undefined} />
          </Card>

          <Card title={mpesa.label} subtitle="Coming later" action={<Badge tone="grey">not switched on</Badge>}>
            <div className="rounded-xl border-2 border-dashed border-teal-100 bg-teal-50/40 p-5">
              <p className="text-sm text-slate-600">When this is switched on, you will review one summary and press one button. The portal sends the money, stores the M-Pesa reference itself, and the trainer sees it straight away.</p>
              <div className="mt-4 rounded-lg bg-white p-4 shadow-sm">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Preview</div>
                <div className="mt-1 text-2xl font-bold text-ink">{kes(total)}</div>
                <div className="text-sm text-slate-600">to {who.full_name}{method?.phone ? ` · ${method.phone}` : ''}</div>
                <button disabled className="mt-3 w-full cursor-not-allowed rounded-lg bg-teal/40 px-4 py-3 font-bold text-white">Send {kes(total)} with M-Pesa</button>
              </div>
              <p className="mt-3 text-xs text-slate-500">{mpesa.why}</p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
