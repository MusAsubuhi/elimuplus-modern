'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { createInvoice, docUrl, issueReceipt, mailDoc, nextQuoteNumber, orgCode, orgContacts, quoteLines, followupLines } from '@/lib/billing';
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

/**
 * Give a discount on a quotation, at any time, as a negative line. A percentage is taken off the fee the quotation covers
 * (training, or follow-up for a follow-up quotation); an amount is taken off as typed. Applying again replaces the earlier discount.
 * If the invoice for this quotation has been raised and nothing has been paid on it yet, it is brought down to the new amount.
 */
export async function applyDiscount(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'quote');
  const mode = s(f, 'mode') === 'amount' ? 'amount' : 'percent';
  const value = Number(s(f, 'value'));
  const reason = s(f, 'reason', 120);
  if (!(value > 0)) back('Enter the discount, as a percentage or an amount.', 'err');
  if (mode === 'percent' && value > 100) back('A percentage cannot be more than 100.', 'err');
  let msg = '';
  try {
    msg = await asUser(me.id, async (q) => {
      const qt = (await q('select * from quotes where id=$1', [id]))[0];
      if (!qt) throw new Error('missing');
      if (qt.status === 'declined') throw new Error('declined');
      await q("delete from quote_lines where quote_id=$1 and kind='discount'", [id]);
      const base = Number((await q("select coalesce(sum(qty*unit_kes) filter (where kind in ('training','followup_30','followup_60','followup_90','other')),0)::int n from quote_lines where quote_id=$1", [id]))[0].n);
      const off = mode === 'percent' ? Math.round((base * value) / 100) : Math.round(value);
      if (!(base > 0)) throw new Error('nothing');
      if (off > base) throw new Error('toomuch');
      const label = mode === 'percent' ? `Discount (${value}%)` : 'Discount';
      await q('insert into quote_lines(quote_id, kind, description, qty, unit_kes) values ($1,$2,$3,1,$4)', [id, 'discount', reason ? `${label}: ${reason}` : label, -off]);
      return await syncInvoiceToQuote(q, id, `Discount of KES ${off.toLocaleString('en-KE')} applied.`);
    });
  } catch (e: any) {
    console.error('[discount]', e);
    if (e?.message === 'toomuch') back('The discount is more than the quotation. Check the amount.', 'err');
    if (e?.message === 'nothing') back('There is nothing on this quotation to discount.', 'err');
    back('Could not apply the discount.', 'err');
  }
  await audit(me.id, `discount on quotation (${mode === 'percent' ? value + '%' : 'KES ' + value})`, 'quotes');
  revalidatePath('/portal', 'layout');
  back(msg);
}

export async function removeDiscount(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'quote');
  let msg = '';
  try {
    msg = await asUser(me.id, async (q) => {
      await q("delete from quote_lines where quote_id=$1 and kind='discount'", [id]);
      return await syncInvoiceToQuote(q, id, 'Discount removed.');
    });
  } catch (e) { console.error('[discount]', e); back('Could not remove the discount.', 'err'); }
  await audit(me.id, 'discount removed from quotation', 'quotes');
  revalidatePath('/portal', 'layout');
  back(msg);
}

/** After a discount changes, bring the training invoice (if already raised and still unpaid) in line with the quotation. Follow-up invoices are raised later from the quotation, so they follow it automatically. */
async function syncInvoiceToQuote(q: any, quoteId: string, done: string): Promise<string> {
  const hasTraining = (await q("select 1 from quote_lines where quote_id=$1 and kind='training'", [quoteId])).length > 0;
  if (!hasTraining) return `${done} Follow-up invoices not yet raised will use the new amount.`;
  const fee = Number((await q("select coalesce(sum(qty*unit_kes),0)::int n from quote_lines where quote_id=$1 and kind in ('training','discount')", [quoteId]))[0].n);
  const inv = (await q("select i.id, i.number, i.amount_kes, coalesce((select sum(amount_kes) from payments p where p.invoice_id=i.id),0)::int paid from invoices i where i.quote_id=$1 and i.kind='training' order by i.issued_on desc limit 1", [quoteId]))[0];
  if (!inv) return `${done} The training invoice, when it is raised, will use the new amount.`;
  if (inv.paid > 0) return `${done} Invoice ${inv.number} already has a payment on it, so it was left as it is. Adjust it by hand if needed.`;
  if (inv.amount_kes === fee) return done;
  await q("update invoices set amount_kes=$2, status='issued' where id=$1", [inv.id, fee]);
  return `${done} Invoice ${inv.number} is now KES ${fee.toLocaleString('en-KE')}. If you already emailed it, send it again so the partner has the new amount.`;
}

/** Once the training is done: a separate quotation for the 30, 60 and 90-day follow-up visits, for the people who actually took part. */
export async function quoteFollowups(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'quote');
  let msg = '';
  try {
    msg = await asUser(me.id, async (q) => {
      const base = (await q('select * from quotes where id=$1', [id]))[0];
      if (!base || !base.cohort_id) throw new Error('missing');
      if ((await q("select 1 from quotes where cohort_id=$1 and scope='followup' and status<>'declined'", [base.cohort_id])).length) throw new Error('exists');
      const en = Number((await q("select count(*)::int n from enrolments where cohort_id=$1 and status <> 'dropped'", [base.cohort_id]))[0].n);
      const participants = Number(s(f, 'participants')) || en || Number(base.participants) || 0;
      if (!(participants > 0)) throw new Error('count');
      const o = (await q('select id, name, code from organisations where id=$1', [base.organisation_id]))[0];
      const num = await nextQuoteNumber(q, orgCode(o.name, o.code));
      const qt = (await q(
        `insert into quotes(organisation_id, cohort_id, number, participants, sessions, valid_until, status, scope)
         values ($1,$2,$3,$4,$5,$6,'draft','followup') returning id`, [base.organisation_id, base.cohort_id, num, participants, base.sessions, addDays(30)]))[0];
      for (const l of followupLines(participants))
        await q('insert into quote_lines(quote_id, kind, description, qty, unit_kes) values ($1,$2,$3,$4,$5)', [qt.id, l.kind, l.description, l.qty, l.unit_kes]);
      return `Follow-up quotation ${num} created for ${participants} participants. Review it, add a discount if you are giving one, then email it. Once they accept, each visit is invoiced about two weeks before it.`;
    });
  } catch (e: any) {
    console.error('[followup quote]', e);
    if (e?.message === 'exists') back('A follow-up quotation already exists for this cohort.', 'err');
    if (e?.message === 'count') back('Enter how many participants the follow-up covers.', 'err');
    back('Could not create the follow-up quotation.', 'err');
  }
  await audit(me.id, 'created a follow-up quotation', 'quotes');
  revalidatePath(P);
  back(msg);
}

export async function sendDeal(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'quote');
  const x = (await asUser(me.id, (q) => q(`select qt.*, o.name org_name, o.contact_person from quotes qt join organisations o on o.id=qt.organisation_id where qt.id=$1`, [id])))[0];
  if (!x) back('That quotation is not there.', 'err');
  const to = await orgContacts(x.organisation_id);
  const err = x.scope === 'followup'
    ? await mailDoc(to, `Elimu+ quotation for follow-up visits: ${x.org_name}`,
      `Dear ${x.contact_person || x.org_name},\n\nThank you for partnering with us on the training. Here is our quotation for the 30, 60 and 90-day follow-up visits. You can read, print or save it as PDF from the link below. It is valid until ${x.valid_until}.\n\nWarm regards,\nElimu+`,
      [{ label: 'Open the quotation', url: docUrl('quote', x.share_token) }])
    : await mailDoc(to, `Elimu+ partnership proposal and quotation for ${x.org_name}`,
    `Dear ${x.contact_person || x.org_name},\n\nThank you for your interest in working with Elimu+. We have prepared a partnership proposal and a quotation for ${x.org_name}. You can read, print or save both as PDF from the links below. The quotation is valid until ${x.valid_until}.\n\nWe would be glad to talk it through and confirm a start date with you.\n\nWarm regards,\nElimu+`,
    [{ label: 'Read the partnership proposal', url: docUrl('proposal', x.share_token) }, { label: 'Open the quotation', url: docUrl('quote', x.share_token) }]);
  if (err) back(err, 'err');
  await asUser(me.id, (q) => q("update quotes set sent_at=now(), sent_to=$2, status=case when status='draft' then 'sent' else status end where id=$1", [id, to.join(', ')]));
  await audit(me.id, `sent proposal and quotation to ${x.org_name}`, 'quotes');
  revalidatePath(P);
  back(`Sent to ${to.join(', ')}.`);
}

/**
 * The partner said yes: confirm the cohort. The quotation is dated the day it was placed; the training invoice is raised
 * automatically on the day after the programme ends (5 or 12 days), by the daily billing job.
 */
export async function acceptDeal(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'quote');
  try {
    await asUser(me.id, async (q) => {
      const qt = (await q('select * from quotes where id=$1', [id]))[0];
      if (!qt || qt.accepted_at) throw new Error('already');
      await q("update quotes set status='signed', accepted_at=now() where id=$1", [id]);
      if (qt.cohort_id) await q("update cohorts set status='confirmed' where id=$1 and status in ('requested','quoted')", [qt.cohort_id]);
    });
  } catch (e: any) {
    console.error('[deal]', e);
    // The database holds back confirmation until the organisation is called, visited and checked; say so instead of a vague failure.
    if (String(e?.message ?? '').startsWith('Not ready')) back('Not confirmed yet: this organisation still has to be called, visited and pass the venue checks. Record those on its CRM page, or a founder can record an override reason there, then mark it accepted again. The quotation is unchanged.', 'err');
    back('Could not mark it accepted. It may already be accepted.', 'err');
  }
  await audit(me.id, 'quotation accepted', 'quotes');
  revalidatePath(P);
  back('Accepted. The cohort is confirmed. The training invoice will be raised the day after the programme ends, and you will be alerted to send it.');
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
      const rc = await issueReceipt(q, p.id, n.paid_on ? String(n.paid_on).slice(0, 10) : undefined);
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


/** Founders add an invoice by hand for work delivered before the portal could record it, optionally with the payment that settled it. */
export async function addEarlierInvoice(f: FormData) {
  const me = await requireMe('founder');
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const isDate = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x);
  const org = s(f, 'org'), cohort = s(f, 'cohort') || null, desc = s(f, 'description', 300), note = s(f, 'note', 400);
  const amount = Math.round(Number(s(f, 'amount'))), issued = s(f, 'issued_on'), due = s(f, 'due_on') || issued;
  const kind = (['training', 'followup', 'other'].includes(s(f, 'kind')) ? s(f, 'kind') : 'training') as 'training' | 'followup' | 'other';
  const paidAmt = Math.round(Number(s(f, 'paid_amount')) || 0), paidOn = s(f, 'paid_on');
  if (!org) back('Choose the organisation.', 'err');
  if (!desc) back('Describe what the invoice is for.', 'err');
  if (!(amount > 0)) back('Enter the invoice amount.', 'err');
  if (!isDate(issued) || !isDate(due)) back('Enter the date the invoice should carry.', 'err');
  if (issued < '2025-12-01') back('Elimu+ started in December 2025, so an invoice cannot be dated earlier than that.', 'err');
  if (issued > today) back('An earlier invoice cannot be dated in the future. Use a normal quotation for new work.', 'err');
  if (due < issued) back('The due date cannot be before the issue date.', 'err');
  if (paidAmt > amount) back('The amount received is more than the invoice.', 'err');
  if (paidAmt > 0) {
    if (!isDate(paidOn)) back('Enter the date the money came in.', 'err');
    if (paidOn < issued) back('The money cannot come in before the invoice date. Move the invoice date earlier.', 'err');
    if (paidOn > today) back('The date received cannot be in the future.', 'err');
  }
  const manualNo = s(f, 'number', 60);
  let msg = '';
  try {
    msg = await asUser(me.id, async (q) => {
      if (manualNo && (await q('select 1 from invoices where number=$1', [manualNo]))[0]) throw new Error('dup');
      const inv = await createInvoice(q, { quoteId: null, orgId: org, cohortId: cohort, kind, amount, description: desc, dueOn: due, issuedOn: issued, number: manualNo || undefined, manualNote: note || 'Added by hand for earlier work' });
      let out = `Invoice ${inv.number} dated ${issued} added.`;
      if (paidAmt > 0) {
        const pay = (await q('insert into payments(invoice_id,amount_kes,method,reference,received_on,recorded_by) values($1,$2,$3,$4,$5::date,$6) returning id',
          [inv.id, paidAmt, ['mpesa', 'bank', 'cash', 'card'].includes(s(f, 'method')) ? s(f, 'method') : 'mpesa', s(f, 'reference', 60), paidOn, me.id]))[0];
        await q('update invoices set status=$2 where id=$1', [inv.id, paidAmt >= amount ? 'paid' : 'part_paid']);
        const rc = await issueReceipt(q, pay.id, paidOn);
        out += ` Payment of KES ${paidAmt.toLocaleString('en-KE')} recorded on ${paidOn} and receipt ${rc.number} issued with that date. It now counts in cash received for that day.`;
      }
      return out;
    });
  } catch (e: any) {
    console.error('[earlier invoice]', e);
    back(e?.message === 'dup' ? 'That invoice number is already used.' : 'Could not add the invoice. Check the details and try again.', 'err');
  }
  await audit(me.id, `added earlier invoice (${issued}) KES ${amount}${paidAmt ? `, paid ${paidAmt} on ${paidOn}` : ''}`, 'invoices');
  revalidatePath('/portal', 'layout');
  back(msg + ' Press Email on the invoice or receipt below to send it.');
}
