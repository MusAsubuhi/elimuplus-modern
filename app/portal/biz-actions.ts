'use server';
import { redirect } from 'next/navigation';
import { asAdmin } from '@/lib/db';
import { requireFeature } from '@/lib/access';
import { audit } from '@/lib/audit';
import { addDays, nextDue, todayEAT, type Recurrence } from '@/lib/ops';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const num = (f: FormData, k: string) => { const v = Number(s(f, k).replace(/,/g, '')); return Number.isFinite(v) ? v : NaN; };
const dateOk = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x);
const orNull = (x: string) => (x === '' ? null : x);
const go = (path: string, msg: string, kind: 'ok' | 'err' = 'ok'): never => redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}`);
const REC = ['none', 'weekly', 'monthly', 'quarterly', 'yearly'];

// ---------- sales ----------
const SALES = '/portal/sales';
export async function addLead(f: FormData) {
  const me = await requireFeature('sales', 'edit'); const name = s(f, 'name');
  if (!name) go(SALES, 'Give the lead a name.', 'err');
  const exp = num(f, 'expected_kes'), pax = num(f, 'participants'), nd = s(f, 'next_on');
  await asAdmin((q) => q(`insert into leads(name, contact_name, phone, email, source, expected_kes, participants, next_step, next_on, notes, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [name, orNull(s(f, 'contact_name')), orNull(s(f, 'phone')), orNull(s(f, 'email')), orNull(s(f, 'source')), Number.isFinite(exp) ? exp : 0, Number.isFinite(pax) ? Math.round(pax) : null, orNull(s(f, 'next_step')), dateOk(nd) ? nd : null, orNull(s(f, 'notes')), me.id]));
  go(SALES, 'Lead added.');
}
export async function moveLead(f: FormData) {
  const me = await requireFeature('sales', 'edit'); const st = s(f, 'stage'); const id = s(f, 'id');
  if (!['new', 'contacted', 'meeting', 'proposal', 'negotiation', 'won', 'lost'].includes(st)) go(SALES, 'Unknown stage.', 'err');
  await asAdmin((q) => q(`update leads set stage=$1, closed_on = case when $1 in ('won','lost') then current_date else null end, lost_reason = case when $1='lost' then coalesce(nullif($3,''), lost_reason) else null end where id=$2`, [st, id, s(f, 'lost_reason')]));
  go(SALES, st === 'won' ? 'Won. Add the organisation and quote under Partners and Proposals.' : 'Moved.');
}
export async function saveLeadNext(f: FormData) {
  const me = await requireFeature('sales', 'edit'); const nd = s(f, 'next_on');
  await asAdmin((q) => q('update leads set next_step=$1, next_on=$2 where id=$3', [orNull(s(f, 'next_step')), dateOk(nd) ? nd : null, s(f, 'id')]));
  go(SALES, 'Next step saved.');
}
export async function addLeadActivity(f: FormData) {
  const me = await requireFeature('sales', 'edit'); const id = s(f, 'lead_id'); const kinds = ['call', 'visit', 'whatsapp', 'email', 'meeting', 'note'];
  if (!id || !kinds.includes(s(f, 'kind'))) go(SALES, 'Choose the lead and what happened.', 'err');
  await asAdmin((q) => q('insert into lead_activities(lead_id, kind, happened_on, note, created_by) values ($1,$2,$3,$4,$5)', [id, s(f, 'kind'), dateOk(s(f, 'on')) ? s(f, 'on') : todayEAT(), orNull(s(f, 'note')), me.id]));
  go(SALES, 'Logged.');
}

// ---------- procurement ----------
const PROC = '/portal/procurement';
export async function createPO(f: FormData) {
  const me = await requireFeature('procurement', 'edit');
  const lines: { item: string | null; desc: string; qty: number; price: number }[] = [];
  for (let i = 1; i <= 6; i++) {
    const item = s(f, `item_${i}`); let desc = s(f, `desc_${i}`); const qty = num(f, `qty_${i}`), price = num(f, `price_${i}`);
    if (!desc && !item) continue;
    if (!(qty > 0) || !(price >= 0)) go(PROC, `Line ${i} needs a quantity and a price.`, 'err');
    lines.push({ item: item || null, desc: desc || 'Item', qty, price });
  }
  if (!lines.length) go(PROC, 'Add at least one line.', 'err');
  const id = await asAdmin(async (q) => {
    for (const l of lines) if (l.item && l.desc === 'Item') l.desc = (await q('select name from inventory_items where id=$1', [l.item]))[0]?.name ?? 'Item';
    const yr = todayEAT().slice(0, 4);
    const n = Number((await q(`select count(*)::int n from purchase_orders where po_no like $1`, [`PO-${yr}-%`]))[0].n) + 1;
    const po = (await q(`insert into purchase_orders(po_no, supplier_id, cohort_id, purpose, expected_on, note, created_by) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [`PO-${yr}-${String(n).padStart(3, '0')}`, orNull(s(f, 'supplier_id')), orNull(s(f, 'cohort_id')), orNull(s(f, 'purpose')), dateOk(s(f, 'expected_on')) ? s(f, 'expected_on') : null, orNull(s(f, 'note')), me.id]))[0].id;
    for (const l of lines) await q('insert into po_lines(po_id, item_id, description, qty, unit_price) values ($1,$2,$3,$4,$5)', [po, l.item, l.desc, l.qty, l.price]);
    return po;
  });
  await audit(me.id, 'created purchase order', 'purchase_orders');
  go(`${PROC}/${id}`, 'Purchase order drafted. Approve it to commit the spend.');
}
export async function poStep(f: FormData) {
  const me = await requireFeature('procurement', 'edit'); const id = s(f, 'id'); const act = s(f, 'act');
  await asAdmin(async (q) => {
    if (act === 'approve') await q(`update purchase_orders set status='approved', approved_by=$1, approved_at=now() where id=$2 and status='draft'`, [me.id, id]);
    if (act === 'sent') await q(`update purchase_orders set status='sent' where id=$1 and status='approved'`, [id]);
    if (act === 'cancel') await q(`update purchase_orders set status='cancelled' where id=$1 and status in ('draft','approved','sent') and not exists (select 1 from po_lines where po_id=$1 and received_qty > 0)`, [id]);
  });
  await audit(me.id, `purchase order ${act}`, 'purchase_orders');
  go(`${PROC}/${id}`, act === 'approve' ? 'Approved.' : act === 'sent' ? 'Marked as sent to the supplier.' : 'Cancelled.');
}
export async function receiveLines(f: FormData) {
  const me = await requireFeature('procurement', 'edit'); const id = s(f, 'id');
  let got = 0;
  await asAdmin(async (q) => {
    const po = (await q('select status from purchase_orders where id=$1', [id]))[0];
    if (!po || !['approved', 'sent', 'partly_received'].includes(po.status)) return;
    for (const l of await q('select * from po_lines where po_id=$1', [id])) {
      const r = num(f, `recv_${l.id}`);
      if (!(r > 0)) continue;
      const take = Math.min(r, Number(l.qty) - Number(l.received_qty));
      if (take <= 0) continue;
      got += take;
      await q('update po_lines set received_qty = received_qty + $1 where id=$2', [take, l.id]);
      if (l.item_id) await q(`insert into stock_movements(item_id, delta, reason, po_id, note, created_by) values ($1,$2,'received',$3,$4,$5)`, [l.item_id, take, id, 'Received on purchase order', me.id]);
    }
    const open = (await q('select count(*)::int n from po_lines where po_id=$1 and received_qty < qty', [id]))[0].n;
    await q(`update purchase_orders set status = case when $2 = 0 then 'received' else 'partly_received' end where id=$1`, [id, open]);
  });
  if (!got) go(`${PROC}/${id}`, 'Enter a quantity received on at least one line.', 'err');
  go(`${PROC}/${id}`, 'Goods recorded. Stock items were added to stock. Record the actual spending in the Expenses ledger when you pay.');
}

/** Record what was paid (or billed) against a purchase order. It lands in the Expenses ledger as a normal record for a founder to confirm, with the PO on it. */
export async function recordPOPayment(f: FormData) {
  const me = await requireFeature('procurement', 'edit'); const id = s(f, 'id'); const back = `${PROC}/${id}`;
  const amount = Math.round(num(f, 'amount')); const how = ['to_be_paid', 'bank', 'mpesa', 'cash', 'own_pocket'].includes(s(f, 'how')) ? s(f, 'how') : 'to_be_paid';
  const spent = s(f, 'spent_on'); const today = todayEAT();
  if (!(amount > 0)) go(back, 'Enter the amount.', 'err');
  if (how !== 'to_be_paid' && (!dateOk(spent) || spent > today)) go(back, 'Add the date it was paid (not in the future).', 'err');
  const exp = await asAdmin(async (q) => {
    const po = (await q('select p.po_no, p.cohort_id, p.supplier_id, s.name supplier from purchase_orders p left join suppliers s on s.id=p.supplier_id where p.id=$1', [id]))[0];
    if (!po) return null;
    return (await q(`insert into expense_requests(requester_id, cohort_id, category_id, amount_kes, reason, purpose, paid_from, spent_on, reference, supplier_id, po_id)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [me.id, po.cohort_id, orNull(s(f, 'category')), amount, `${po.po_no}${po.supplier ? ` · ${po.supplier}` : ''}`, po.cohort_id ? 'training' : 'other', how, how === 'to_be_paid' ? null : spent, orNull(s(f, 'reference')), po.supplier_id, id]))[0].id;
  });
  if (!exp) go(PROC, 'Purchase order not found.', 'err');
  await audit(me.id, 'recorded payment against purchase order', 'expense_requests');
  go(back, how === 'to_be_paid' ? 'Recorded as billed and still to pay. A founder confirms it in Expenses.' : 'Payment recorded. Add the receipt in Expenses; a founder confirms it there.');
}
/** Attach an expense that was already recorded to this purchase order. */
export async function linkExpenseToPO(f: FormData) {
  const me = await requireFeature('procurement', 'edit'); const id = s(f, 'id'); const exp = s(f, 'expense_id');
  if (!exp) go(`${PROC}/${id}`, 'Choose an expense to link.', 'err');
  await asAdmin((q) => q('update expense_requests set po_id=$1 where id=$2 and po_id is null', [id, exp]));
  await audit(me.id, 'linked expense to purchase order', 'expense_requests');
  go(`${PROC}/${id}`, 'Linked.');
}

// ---------- inventory ----------
const INV = '/portal/inventory';
export async function addItem(f: FormData) {
  const me = await requireFeature('inventory', 'edit'); const name = s(f, 'name');
  if (!name) go(INV, 'Give the item a name.', 'err');
  const kind = s(f, 'kind') === 'asset' ? 'asset' : 'stock';
  const cost = num(f, 'cost_kes'), life = num(f, 'life_years'), re = num(f, 'reorder_level'), pd = s(f, 'purchase_date');
  const cats = ['materials', 'certificates', 'refreshments', 'equipment', 'other'];
  await asAdmin(async (q) => {
    const it = (await q(`insert into inventory_items(name, category, kind, unit, reorder_level, location, serial, assigned_to, condition, purchase_date, cost_kes, life_years, note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
      [name, cats.includes(s(f, 'category')) ? s(f, 'category') : 'materials', kind, s(f, 'unit') || 'piece', Number.isFinite(re) ? re : 0, orNull(s(f, 'location')), orNull(s(f, 'serial')), orNull(s(f, 'assigned_to')), orNull(s(f, 'condition')), dateOk(pd) ? pd : null, Number.isFinite(cost) ? cost : null, Number.isFinite(life) ? Math.round(life) : null, orNull(s(f, 'note'))]))[0].id;
    const open = num(f, 'opening_qty');
    if (open > 0) await q(`insert into stock_movements(item_id, delta, reason, note, created_by) values ($1,$2,'count_correction','Opening count',$3)`, [it, kind === 'asset' ? 1 : open, me.id]);
  });
  go(kind === 'asset' ? `${INV}?view=assets` : INV, 'Item added.');
}
export async function moveStock(f: FormData) {
  const me = await requireFeature('inventory', 'edit'); const item = s(f, 'item_id'); const qty = num(f, 'qty'); const reason = s(f, 'reason');
  const out = ['issued_to_cohort', 'used', 'lost_damaged'];
  if (!item || !(qty > 0) || ![...out, 'received', 'returned', 'count_correction'].includes(reason)) go(INV, 'Choose the item, the reason and a quantity.', 'err');
  const sign = out.includes(reason) ? -1 : reason === 'count_correction' && s(f, 'direction') === 'down' ? -1 : 1;
  try {
    await asAdmin(async (q) => {
      const have = Number((await q('select coalesce(sum(delta),0) n from stock_movements where item_id=$1', [item]))[0].n);
      if (sign < 0 && qty > have) throw new Error(`Only ${have} in stock.`);
      await q('insert into stock_movements(item_id, delta, reason, cohort_id, note, moved_on, created_by) values ($1,$2,$3,$4,$5,$6,$7)', [item, sign * qty, reason, orNull(s(f, 'cohort_id')), orNull(s(f, 'note')), dateOk(s(f, 'on')) ? s(f, 'on') : todayEAT(), me.id]);
    });
  } catch (e: any) { go(INV, e.message, 'err'); }
  go(INV, 'Stock updated.');
}
export async function setItemActive(f: FormData) {
  const me = await requireFeature('inventory', 'edit');
  await asAdmin((q) => q('update inventory_items set active=$1 where id=$2', [s(f, 'active') === 'yes', s(f, 'id')]));
  go(s(f, 'back') || INV, 'Saved.');
}

// ---------- operations ----------
const OPS = '/portal/operations';
export async function addTask(f: FormData) {
  const me = await requireFeature('operations', 'edit'); const title = s(f, 'title'); const due = s(f, 'due_on');
  if (!title) go(OPS, 'Give the task a title.', 'err');
  await asAdmin((q) => q(`insert into ops_tasks(title, detail, owner_name, due_on, recurrence, created_by) values ($1,$2,$3,$4,$5,$6)`, [title, orNull(s(f, 'detail')), orNull(s(f, 'owner_name')), dateOk(due) ? due : null, REC.includes(s(f, 'recurrence')) ? s(f, 'recurrence') : 'none', me.id]));
  go(OPS, 'Task added.');
}
export async function completeTask(f: FormData) {
  const me = await requireFeature('operations', 'edit'); const id = s(f, 'id'); const today = todayEAT();
  await asAdmin(async (q) => {
    const t = (await q('select title, detail, owner_name, due_on::text due, recurrence from ops_tasks where id=$1 and status=\'open\'', [id]))[0];
    if (!t) return;
    await q(`update ops_tasks set status='done', done_on=$1 where id=$2`, [today, id]);
    const nd = nextDue(t.due ?? today, t.recurrence as Recurrence);
    if (nd) await q(`insert into ops_tasks(title, detail, owner_name, due_on, recurrence, created_by) values ($1,$2,$3,$4,$5,$6)`, [t.title, t.detail, t.owner_name, nd, t.recurrence, me.id]);
  });
  go(OPS, 'Done. The next one is scheduled if it repeats.');
}
export async function addIncident(f: FormData) {
  const me = await requireFeature('operations', 'edit'); const desc = s(f, 'description');
  if (!desc) go(OPS + '?view=incidents', 'Describe what happened.', 'err');
  const kinds = ['safety', 'safeguarding', 'equipment', 'data', 'complaint', 'conduct', 'other'];
  await asAdmin((q) => q(`insert into incidents(occurred_on, kind, severity, description, action_taken, cohort_id, reported_by) values ($1,$2,$3,$4,$5,$6,$7)`,
    [dateOk(s(f, 'occurred_on')) ? s(f, 'occurred_on') : todayEAT(), kinds.includes(s(f, 'kind')) ? s(f, 'kind') : 'other', ['low', 'medium', 'high'].includes(s(f, 'severity')) ? s(f, 'severity') : 'low', desc, orNull(s(f, 'action_taken')), orNull(s(f, 'cohort_id')), me.id]));
  await audit(me.id, `logged ${s(f, 'kind')} incident`, 'incidents');
  go(OPS + '?view=incidents', 'Incident recorded.');
}
export async function closeIncident(f: FormData) {
  const me = await requireFeature('operations', 'edit');
  await asAdmin((q) => q(`update incidents set status='closed', closed_on=current_date, action_taken = coalesce(nullif($1,''), action_taken) where id=$2`, [s(f, 'action_taken'), s(f, 'id')]));
  go(OPS + '?view=incidents', 'Closed.');
}

// ---------- compliance ----------
const COMP = '/portal/compliance';
export async function addCompliance(f: FormData) {
  const me = await requireFeature('compliance', 'edit'); const title = s(f, 'title'); const due = s(f, 'due_on');
  const cats = ['tax', 'statutory', 'licence', 'insurance', 'data_protection', 'safeguarding', 'contract', 'other'];
  if (!title) go(COMP, 'Give the obligation a title.', 'err');
  await asAdmin((q) => q(`insert into compliance_items(title, authority, category, due_on, recurrence, note) values ($1,$2,$3,$4,$5,$6)`, [title, orNull(s(f, 'authority')), cats.includes(s(f, 'category')) ? s(f, 'category') : 'other', dateOk(due) ? due : null, ['none', 'monthly', 'quarterly', 'yearly'].includes(s(f, 'recurrence')) ? s(f, 'recurrence') : 'none', orNull(s(f, 'note'))]));
  go(COMP, 'Added.');
}
export async function setComplianceDate(f: FormData) {
  const me = await requireFeature('compliance', 'edit'); const due = s(f, 'due_on');
  if (!dateOk(due)) go(COMP, 'Choose a date.', 'err');
  await asAdmin((q) => q('update compliance_items set due_on=$1, status=\'open\' where id=$2', [due, s(f, 'id')]));
  go(COMP, 'Date saved.');
}
export async function completeCompliance(f: FormData) {
  const me = await requireFeature('compliance', 'edit'); const id = s(f, 'id'); const today = todayEAT();
  await asAdmin(async (q) => {
    const c = (await q('select due_on::text due, recurrence from compliance_items where id=$1', [id]))[0];
    if (!c) return;
    const nd = nextDue(c.due ?? today, c.recurrence as Recurrence);
    if (nd) await q(`update compliance_items set due_on=$1, last_done_on=$2, evidence_note=coalesce(nullif($3,''), evidence_note) where id=$4`, [nd, today, s(f, 'evidence_note'), id]);
    else await q(`update compliance_items set status='done', last_done_on=$1, evidence_note=coalesce(nullif($2,''), evidence_note) where id=$3`, [today, s(f, 'evidence_note'), id]);
  });
  await audit(me.id, 'completed compliance item', 'compliance_items');
  go(COMP, 'Recorded. If it repeats, the next date is set.');
}
export async function addDataRequest(f: FormData) {
  const me = await requireFeature('compliance', 'edit'); const name = s(f, 'from_name'); const rec = dateOk(s(f, 'received_on')) ? s(f, 'received_on') : todayEAT();
  if (!name) go(COMP + '?view=requests', 'Say who made the request.', 'err');
  const kinds = ['access', 'correction', 'deletion', 'withdraw_consent', 'complaint'];
  await asAdmin((q) => q('insert into data_requests(received_on, from_name, kind, due_on) values ($1,$2,$3,$4)', [rec, name, kinds.includes(s(f, 'kind')) ? s(f, 'kind') : 'access', addDays(rec, 30)]));
  await audit(me.id, 'logged data request', 'data_requests');
  go(COMP + '?view=requests', 'Logged. It is due within 30 days.');
}
export async function closeDataRequest(f: FormData) {
  const me = await requireFeature('compliance', 'edit');
  await asAdmin((q) => q(`update data_requests set status='done', closed_on=current_date, outcome=$1 where id=$2`, [orNull(s(f, 'outcome')), s(f, 'id')]));
  go(COMP + '?view=requests', 'Closed.');
}
