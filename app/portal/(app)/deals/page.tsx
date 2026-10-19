import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, statusTone, submitCls } from '@/components/ui';
import { d, kes } from '@/lib/format';
import { docUrl } from '@/lib/billing';
import { training, followups } from '@/lib/pricing';
import { acceptDeal, confirmNotice, createDeal, declineDeal, rejectNotice, resendReceipt, sendDeal, sendInvoice } from '../../deal-actions';

const mini = 'rounded border border-teal-100 bg-white px-2 py-1 text-xs font-bold text-teal hover:bg-mist';
const Hidden = ({ k, v }: { k: string; v: string }) => <input type="hidden" name={k} value={v} />;

export default async function Deals() {
  const me = await requireMe('founder');
  const X = await asUser(me.id, async (q) => ({
    orgs: await q('select id, name, code from organisations where coalesce(is_internal,false)=false order by name'),
    quotes: await q(`select qt.*, o.name org_name, c.name cohort_name, c.format, (select coalesce(sum(qty*unit_kes),0)::int from quote_lines l where l.quote_id=qt.id) total
      from quotes qt join organisations o on o.id=qt.organisation_id left join cohorts c on c.id=qt.cohort_id order by qt.issued_on desc, qt.number desc nulls last`),
    invoices: await q(`select i.*, o.name org_name, coalesce((select sum(amount_kes) from payments p where p.invoice_id=i.id),0)::int paid from invoices i join organisations o on o.id=i.organisation_id order by i.issued_on desc`),
    notices: await q(`select n.*, i.number inv, o.name org_name from payment_notices n join invoices i on i.id=n.invoice_id join organisations o on o.id=n.organisation_id where n.status='pending' order by n.created_at`),
    receipts: await q(`select r.*, p.amount_kes, i.number inv, o.name org_name from receipts r join payments p on p.id=r.payment_id join invoices i on i.id=p.invoice_id join organisations o on o.id=i.organisation_id order by r.issued_on desc, r.number desc limit 30`),
  }));
  const open = X.quotes.filter((x) => ['draft', 'sent'].includes(x.status));
  const sample = (n: number) => `${kes(training(n, 5).total)} + ${kes(followups(n).total)}`;
  return (
    <>
      <PageHeader image="/images/hero-bg.jpg" title="Proposals and receipts" subtitle="From a warm lead to a signed quotation, an invoice and a receipt, all numbered and sent from here." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Waiting for an answer" value={open.length} sub="drafts and sent quotations" />
        <Stat tone="gold" label="Payments to confirm" value={X.notices.length} sub="partners who say they paid" />
        <Stat tone="green" label="Receipts issued" value={X.receipts.length} />
        <Stat tone="teal" label="Example, 30 people" value={sample(30)} sub="training + follow-up" />
      </div>

      {X.notices.length > 0 && (
        <Card title="Partners say they have paid" subtitle="Check the M-Pesa message or bank statement, then confirm. The receipt is created and emailed for you." className="mb-4">
          <div className="space-y-3">
            {X.notices.map((n) => (
              <div key={n.id} className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm">
                <p><b>{n.org_name}</b> says they paid <b>{kes(n.amount_kes)}</b> by {n.method} on {d(n.paid_on)} for invoice <b>{n.inv}</b>. Reference: <b>{n.reference}</b>.{n.note ? ` Note: ${n.note}` : ''}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <form action={confirmNotice} className="flex items-center gap-2"><Hidden k="notice" v={n.id} />
                    <input name="amount" type="number" min="1" defaultValue={n.amount_kes} className="w-32 rounded border border-teal-100 px-2 py-1 text-sm" aria-label="Amount received" />
                    <button className={submitCls}>Confirm and send receipt</button></form>
                  <form action={rejectNotice} className="flex items-center gap-2"><Hidden k="notice" v={n.id} />
                    <input name="note" placeholder="What did not match?" className="w-48 rounded border border-teal-100 px-2 py-1 text-sm" />
                    <button className={mini}>Not matched</button></form>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="New proposal and quotation" subtitle="For an organisation that is interested" className="lg:col-span-1">
          <form action={createDeal} className="space-y-3 text-sm">
            <label className="block font-bold">Organisation<select name="org" required className={inputCls}><option value="">Choose…</option>{X.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
            <label className="block font-bold">Short code for document numbers<input name="code" maxLength={12} placeholder="e.g. KE461 (optional)" className={inputCls} /></label>
            <label className="block font-bold">Cohort name<input name="cohort" placeholder="e.g. Youth cohort, March" className={inputCls} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block font-bold">Participants<input name="participants" type="number" min="1" required className={inputCls} /></label>
              <label className="block font-bold">Sessions<input name="sessions" type="number" min="1" defaultValue={5} className={inputCls} /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block font-bold">Programme<select name="format" className={inputCls}><option value="5-day">5-Day</option><option value="12-day">12-Day</option></select></label>
              <label className="block font-bold">Language<select name="language" className={inputCls}><option value="sw">Kiswahili</option><option value="en">English</option></select></label>
            </div>
            <label className="block font-bold">Who will attend<input name="audience" placeholder="Youth 15 to 24" className={inputCls} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block font-bold">Start date<input name="start" type="date" className={inputCls} /></label>
              <label className="block font-bold">Valid for (days)<input name="valid" type="number" min="1" defaultValue={30} className={inputCls} /></label>
            </div>
            <label className="block font-bold">Venue<input name="venue" className={inputCls} /></label>
            <button className={submitCls}>Create proposal and quotation</button>
            <p className="text-xs text-slate-500">Prices follow the standard tiers (300, 250 and 200 per session by size, with the small-group rate) and the follow-up fee of KES 1,000 per participant. The organisation must already exist under People and partners.</p>
          </form>
        </Card>

        <Card title="Quotations" className="lg:col-span-2">
          <div className="space-y-3">
            {X.quotes.map((x) => (
              <div key={x.id} className="rounded-lg border border-teal-100 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><b>{x.number ?? 'Unnumbered'}</b> · {x.org_name}{x.cohort_name ? ` · ${x.cohort_name}` : ''} <Badge tone={statusTone(x.status)}>{x.status}</Badge></div>
                  <b>{kes(x.total)}</b>
                </div>
                <p className="mt-1 text-xs text-slate-500">{x.participants ?? '—'} participants · {x.sessions} sessions · issued {d(x.issued_on)} · valid to {d(x.valid_until)}{x.sent_at ? ` · sent ${d(x.sent_at)} to ${x.sent_to}` : ''}{x.self_service && x.status === 'draft' ? ` · requested by the partner, releases automatically after ${new Date(x.release_at).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a className={mini} href={docUrl('proposal', x.share_token)} target="_blank">Proposal</a>
                  <a className={mini} href={docUrl('quote', x.share_token)} target="_blank">Quotation</a>
                  {['draft', 'sent'].includes(x.status) && <form action={sendDeal}><Hidden k="quote" v={x.id} /><button className={mini}>{x.sent_at ? 'Send again' : 'Email proposal and quotation'}</button></form>}
                  {['draft', 'sent'].includes(x.status) && <form action={acceptDeal}><Hidden k="quote" v={x.id} /><button className={mini}>They accepted</button></form>}
                  {['draft', 'sent'].includes(x.status) && <form action={declineDeal}><Hidden k="quote" v={x.id} /><button className={mini}>Declined</button></form>}
                </div>
                <p className="mt-2 break-all text-[11px] text-slate-400">Quotation link: {docUrl('quote', x.share_token)}</p>
              </div>
            ))}
            {!X.quotes.length && <p className="text-sm text-slate-500">No quotations yet. Create the first one on the left.</p>}
          </div>
        </Card>
      </div>

      <Card title="Invoices" className="mt-4" subtitle="Training invoices are raised when a quotation is accepted. The 30, 60 and 90-day follow-up visits are each invoiced automatically about two weeks before the visit, at a third of the follow-up fee.">
        <Table head={['Invoice', 'Partner', 'Type', 'Amount', 'Paid', 'Due', 'Status', '']}
          rows={X.invoices.map((i) => [<b key="n">{i.number}</b>, i.org_name, i.kind, kes(i.amount_kes), kes(i.paid), d(i.due_on), <Badge key="s" tone={statusTone(i.status)}>{i.status}</Badge>,
            <div key="a" className="flex gap-2"><a className={mini} href={docUrl('invoice', i.share_token)} target="_blank">Open</a>
              <form action={sendInvoice}><Hidden k="invoice" v={i.id} /><button className={mini}>{i.sent_at ? 'Resend' : 'Email'}</button></form></div>])} />
        <p className="mt-3 text-xs text-slate-500">To record a payment you received without a notice from the partner, use Finance. It issues a receipt too.</p>
      </Card>

      <Card title="Receipts" className="mt-4">
        <Table head={['Receipt', 'Partner', 'Invoice', 'Amount', 'Date', '']}
          rows={X.receipts.map((r) => [<b key="n">{r.number}</b>, r.org_name, r.inv, kes(r.amount_kes), d(r.issued_on),
            <div key="a" className="flex gap-2"><a className={mini} href={docUrl('receipt', r.share_token)} target="_blank">Open</a>
              <form action={resendReceipt}><Hidden k="receipt" v={r.id} /><button className={mini}>{r.sent_at ? 'Resend' : 'Email'}</button></form></div>])} empty="No receipts yet." />
      </Card>
    </>
  );
}
