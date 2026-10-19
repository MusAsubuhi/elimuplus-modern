'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { createInvoice, docUrl, issueReceipt, mailDoc, nextQuoteNumber, orgCode, orgContacts, quoteLines } from '@/lib/billing';
import { MIN_SESSIONS } from '@/lib/pricing';

const P = '/portal/deals';
const back = (msg: string, kind: 'ok' | 'err' = 'ok'): never => redirect(`${P}?${kind}=${encodeURIComponent(msg)}`);
const s = (f: FormData, k: string, n = 500) => String(f.get(k) ?? '').trim().slice(0, n);
const addDays = (n: number) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

/** Turn a warm lead into a cohort, a proposal and a quotation, all numbered and ready to send. */
export async function createDeal(f: FormData) {
  const me = await requireMe('founder');
  const org = s(f, 'org'), participants = Number(s(f, 'participants')), sessions = Number(s(f, 'sessions')) || MIN_SESSIONS;
  if (!org || !(participants > 0)) back('Choose the organisation and the number of participants.', 'err');
  const format = s(f, 'format') === '12-day' ? '12-day' : '5-day';
  let id = '';
  try {
    id = await asUser(me.id, async (q) => {
      const o = (await q('select id, name, code from organisations where id=$1', [org]))[0];
      if (!o) throw new Error('organisation');
      const code = orgCode(o.name, s(f, 'code', 12) || o.code);
      if (s(f, 'code', 12) && s(f, 'code', 12).toUpperCase() !== o.code) await q('update organisations set code=$2 where id=$1', [org, s(f, 'code', 12).toUpperCase()]);
      const co = (await q(
        `insert into cohorts(organisation_id,name,format,language,audience,start_date,venue,expected_participants,status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'quoted') returning id`,
        [org, s(f, 'cohort', 120) || `${o.name} cohort`, format, s(f, 'language') === 'en' ? 'en' : 'sw', s(f, 'audience', 200) || null, s(f, 'start') || null, s(f, 'venue', 200) || null, participants]))[0];
      const num = await nextQuoteNumber(q, code);
      const qt = (await q(
        `insert into quotes(organisation_id, cohort_id, number, participants, sessions, valid_until, status)
         values ($1,$2,$3,$4,$5,$6,'draft') returning id`, [org, co.id, num, participants, sessions, addDays(Number(s(f, 'valid')) || 30)]))[0];
      for (const l of quoteLines(participants, sessions))
        await q('insert into quote_lines(quote_id, kind, description, qty, unit_kes) values ($1,$2,$3,$4,$5)', [qt.id, l.kind, l.description, l.qty, l.unit_kes]);
      return qt.id as string;
    });
  } catch (e) { console.error('[deal]', e); back('Could not create the quotation. Check the organisation and numbers.', 'err'); }
  await audit(me.id, 'created a proposal and quotation', 'quotes');
  revalidatePath(P);
  back(`Proposal and quotation created (${id.slice(0, 4)}…). Review them, then send.`);
}

export async function sendDeal(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'quote');
  const x = (await asUser(me.id, (q) => q(`select qt.*, o.name org_name, o.contact_person from quotes qt join organisations o on o.id=qt.organisation_id where qt.id=$1`, [id])))[0];
  if (!x) back('That quotation is not there.', 'err');
  const to = await orgContacts(x.organisation_id);
  const err = await mailDoc(to, `Elimu+ partnership proposal and quotation for ${x.org_name}`,
    `Dear ${x.contact_person || x.org_name},\n\nThank you for your interest in working with Elimu+. We have prepared a partnership proposal and a quotation for ${x.org_name}. You can read, print or save both as PDF from the links below. The quotation is valid until ${x.valid_until}.\n\nWe would be glad to talk it through and confirm a start date with you.\n\nWarm regards,\nElimu+`,
    [{ label: 'Read the partnership proposal', url: docUrl('proposal', x.share_token) }, { label: 'Open the quotation', url: docUrl('quote', x.share_token) }]);
  if (err) back(err, 'err');
  await asUser(me.id, (q) => q("update quotes set sent_at=now(), sent_to=$2, status=case when status='draft' then 'sent' else status end where id=$1", [id, to.join(', ')]));
  await audit(me.id, `sent proposal and quotation to ${x.org_name}`, 'quotes');
  revalidatePath(P);
  back(`Sent to ${to.join(', ')}.`);
}

/** The partner said yes: confirm the cohort and raise the training invoice. */
export async function acceptDeal(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'quote');
  try {
    await asUser(me.id, async (q) => {
      const qt = (await q('select * from quotes where id=$1', [id]))[0];
      if (!qt || qt.accepted_at) throw new Error('already');
      const lines = await q('select * from quote_lines where quote_id=$1', [id]);
      const training = lines.filter((l: any) => l.kind === 'training').reduce((a: number, l: any) => a + l.qty * l.unit_kes, 0);
      const co = qt.cohort_id ? (await q('select start_date, name from cohorts where id=$1', [qt.cohort_id]))[0] : null;
      await q("update quotes set status='signed', accepted_at=now() where id=$1", [id]);
      if (qt.cohort_id) await q("update cohorts set status='confirmed' where id=$1 and status in ('requested','quoted')", [qt.cohort_id]);
      const due = co?.start_date ? String(co.start_date).slice(0, 10) : addDays(14);
      if (training > 0) await createInvoice(q, { quoteId: id, orgId: qt.organisation_id, cohortId: qt.cohort_id, kind: 'training', amount: training, description: `Training${co ? `: ${co.name}` : ''}, ${qt.participants ?? ''} participants, ${qt.sessions} sessions`, dueOn: due });
    });
  } catch (e) { console.error('[deal]', e); back('Could not mark it accepted. It may already be accepted.', 'err'); }
  await audit(me.id, 'quotation accepted, training invoice raised', 'quotes');
  revalidatePath(P);
  back('Accepted. The cohort is confirmed and the training invoice is raised. Send it from the invoices list.');
}

export async function declineDeal(f: FormData) {
  const me = await requireMe('founder');
  await asUser(me.id, (q) => q("update quotes set status='declined' where id=$1", [s(f, 'quote')]));
  await audit(me.id, 'quotation declined', 'quotes');
  revalidatePath(P);
  back('Marked as declined.');
}

export async function sendInvoice(f: FormData) {
  const me = await requireMe('founder');
  const x = (await asUser(me.id, (q) => q(`select i.*, o.name org_name, o.contact_person from invoices i join organisations o on o.id=i.organisation_id where i.id=$1`, [s(f, 'invoice')])))[0];
  if (!x) back('Invoice not found.', 'err');
  const err = await mailDoc(await orgContacts(x.organisation_id), `Elimu+ invoice ${x.number}`,
    `Dear ${x.contact_person || x.org_name},\n\nPlease find invoice ${x.number} for KES ${Number(x.amount_kes).toLocaleString('en-KE')}, due ${x.due_on}. You can pay by bank transfer or M-Pesa using the details on the invoice. Once you have paid, sign in to the Elimu+ portal and choose “I have paid” on the invoice so we can confirm it and send your receipt.\n\nThank you,\nElimu+`,
    [{ label: 'Open the invoice', url: docUrl('invoice', x.share_token) }]);
  if (err) back(err, 'err');
  await asUser(me.id, (q) => q('update invoices set sent_at=now() where id=$1', [x.id]));
  revalidatePath(P);
  back(`Invoice ${x.number} sent.`);
}

/** A partner said they paid: check it against the bank or M-Pesa, then confirm to record the payment and issue the receipt. */
export async function confirmNotice(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'notice');
  let msg = '';
  try {
    msg = await asUser(me.id, async (q) => {
      const n = (await q("select * from payment_notices where id=$1 and status='pending'", [id]))[0];
      if (!n) throw new Error('gone');
      const amount = Number(s(f, 'amount')) > 0 ? Number(s(f, 'amount')) : n.amount_kes;
      const p = (await q('insert into payments(invoice_id,amount_kes,method,reference,received_on,recorded_by) values($1,$2,$3,$4,$5,$6) returning id',
        [n.invoice_id, amount, n.method, n.reference, n.paid_on, me.id]))[0];
      const r = (await q(`select i.amount_kes::int a, coalesce((select sum(amount_kes) from payments where invoice_id=i.id),0)::int p from invoices i where i.id=$1`, [n.invoice_id]))[0];
      await q('update invoices set status=$2 where id=$1', [n.invoice_id, r.p >= r.a ? 'paid' : 'part_paid']);
      const rc = await issueReceipt(q, p.id);
      await q("update payment_notices set status='confirmed', reviewed_by=$2, reviewed_at=now(), payment_id=$3 where id=$1", [id, me.id, p.id]);
      const org = (await q('select name, contact_email, contact_person from organisations where id=$1', [n.organisation_id]))[0];
      const err = await mailDoc(org?.contact_email ? [org.contact_email] : [], `Elimu+ receipt ${rc.number}`,
        `Dear ${org?.contact_person || org?.name},\n\nThank you. We have received KES ${amount.toLocaleString('en-KE')} and attached your receipt ${rc.number} below. You can also find it any time under Invoices and payments in the portal.\n\nElimu+`,
        [{ label: 'Open the receipt', url: docUrl('receipt', rc.token) }]);
      if (!err) await q('update receipts set sent_at=now() where id=$1', [rc.id]);
      return err ? `Payment recorded and receipt ${rc.number} issued. ${err}` : `Payment recorded, receipt ${rc.number} issued and emailed.`;
    });
  } catch (e) { console.error('[deal]', e); back('Could not confirm that notice. It may already be handled.', 'err'); }
  await audit(me.id, 'payment confirmed and receipt issued', 'payments');
  revalidatePath('/portal', 'layout');
  back(msg);
}

export async function rejectNotice(f: FormData) {
  const me = await requireMe('founder');
  await asUser(me.id, (q) => q("update payment_notices set status='rejected', reviewed_by=$2, reviewed_at=now(), review_note=$3 where id=$1 and status='pending'", [s(f, 'notice'), me.id, s(f, 'note') || null]));
  await audit(me.id, 'payment notice not matched', 'payment_notices');
  revalidatePath('/portal', 'layout');
  back('Marked as not matched. The partner will see your note.');
}

export async function resendReceipt(f: FormData) {
  const me = await requireMe('founder');
  const x = (await asUser(me.id, (q) => q(`select r.*, o.contact_email, o.contact_person, o.name org_name, p.amount_kes from receipts r join payments p on p.id=r.payment_id join invoices i on i.id=p.invoice_id join organisations o on o.id=i.organisation_id where r.id=$1`, [s(f, 'receipt')])))[0];
  if (!x) back('Receipt not found.', 'err');
  const err = await mailDoc(x.contact_email ? [x.contact_email] : [], `Elimu+ receipt ${x.number}`, `Dear ${x.contact_person || x.org_name},\n\nHere is your receipt ${x.number} for KES ${Number(x.amount_kes).toLocaleString('en-KE')}.\n\nElimu+`, [{ label: 'Open the receipt', url: docUrl('receipt', x.share_token) }]);
  if (err) back(err, 'err');
  await asUser(me.id, (q) => q('update receipts set sent_at=now() where id=$1', [x.id]));
  revalidatePath(P);
  back(`Receipt ${x.number} sent.`);
}
