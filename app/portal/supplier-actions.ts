'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin, asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { alertFounders } from '@/lib/billing';
import { audit } from '@/lib/audit';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const back = (path: string, msg: string, kind: 'ok' | 'err' = 'ok'): never =>
  redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}`);
/** "Kisumu, Kondele" becomes ['Kisumu', 'Kondele']; duplicates (ignoring case) are dropped. */
const list = (t: string) => { const seen = new Set<string>(); return t.split(/[,\n;]/).map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())); };
const P = '/portal/suppliers';

/** Anyone who delivers can suggest a supplier; a founder's own entry is active straight away. Only a founder approves a suggestion. */
export async function addSupplier(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const founder = me.roles.includes('founder');
  const name = s(f, 'name');
  if (!name) back(P, 'Add the supplier’s name.', 'err');
  const cats = list(s(f, 'categories'));
  const regs = list(s(f, 'regions'));
  if (!cats.length) back(P, 'Add at least one category, for example Venue or Printing.', 'err');
  try {
    await asUser(me.id, async (q) => {
      if ((await q('select 1 from suppliers where lower(name)=lower($1)', [name])).length) throw new Error('dup');
      await q(`insert into suppliers(name,contact_name,phone,email,offers,notes,categories,regions,status,suggested_by,approved_by,approved_at)
               values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [name, s(f, 'contact_name') || null, s(f, 'phone') || null, s(f, 'email') || null, s(f, 'offers') || null, s(f, 'notes') || null, cats, regs,
         founder ? 'active' : 'suggested', me.id, founder ? me.id : null, founder ? new Date().toISOString() : null]);
    });
    if (!founder) await asAdmin((q) => alertFounders(q, `Supplier suggested: ${name}`, `${me.displayName} suggested ${name} (${cats.join(', ')}${regs.length ? ' · ' + regs.join(', ') : ''}). Approve or decline it.`, '/portal/suppliers', 'info', 'supplier'));
  } catch (e: any) {
    back(P, e?.message === 'dup' ? 'A supplier with that name is already listed.' : 'Could not save that supplier.', 'err');
  }
  revalidatePath(P);
  back(P, founder ? 'Supplier added.' : 'Suggested. A founder will approve it before it can be used.');
}

export async function setSupplierStatus(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'supplier');
  const status = s(f, 'status');
  if (!['active', 'on_hold', 'blocked', 'declined'].includes(status)) back(P, 'Unknown status.', 'err');
  await asUser(me.id, (q) => q(`update suppliers set status=$2, approved_by=case when $2='active' then $3::uuid else approved_by end, approved_at=case when $2='active' and approved_at is null then now() else approved_at end where id=$1`, [id, status, me.id]));
  await audit(me.id, `set supplier ${status}`, 'suppliers');
  revalidatePath(P); revalidatePath('/portal/needs');
  back(f.get('back') ? String(f.get('back')) : P, status === 'active' ? 'Supplier approved.' : 'Supplier updated.');
}

export async function updateSupplier(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'supplier');
  const cats = list(s(f, 'categories'));
  await asUser(me.id, (q) => q('update suppliers set contact_name=$2, phone=$3, email=$4, offers=$5, notes=$6, categories=$7, regions=$8 where id=$1',
    [id, s(f, 'contact_name') || null, s(f, 'phone') || null, s(f, 'email') || null, s(f, 'offers') || null, s(f, 'notes') || null, cats, list(s(f, 'regions'))]));
  revalidatePath(`${P}/${id}`);
  back(`${P}/${id}`, 'Saved.');
}

export async function reviewSupplier(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const id = s(f, 'supplier');
  const n = (k: string) => Math.min(5, Math.max(1, Number(s(f, k)) || 3));
  try {
    await asUser(me.id, (q) => q('insert into supplier_reviews(supplier_id,reviewer_id,cohort_id,price,quality,reliability,note) values($1,$2,$3,$4,$5,$6,$7)',
      [id, me.id, s(f, 'cohort') || null, n('price'), n('quality'), n('reliability'), s(f, 'note') || null]));
  } catch (e) { console.error('[supplier review]', e); back(`${P}/${id}`, 'Could not save that review.', 'err'); }
  revalidatePath(`${P}/${id}`);
  back(`${P}/${id}`, 'Thank you. The review is on the supplier’s record.');
}

// ---------- choosing a supplier for a need ----------

export async function raiseNeed(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const title = s(f, 'title');
  if (!title) back(`${P}/needs`, 'Say what you need.', 'err');
  let id = '';
  try {
    id = await asUser(me.id, async (q) => (await q('insert into sourcing_needs(title,details,category,region,cohort_id,budget_kes,raised_by) values($1,$2,$3,$4,$5,$6,$7) returning id',
      [title, s(f, 'details') || null, s(f, 'category') || null, s(f, 'region') || null, s(f, 'cohort') || null, Number(s(f, 'budget')) || null, me.id]))[0].id);
  } catch (e) { console.error('[need]', e); back(`${P}/needs`, 'Could not save that.', 'err'); }
  revalidatePath(`${P}/needs`);
  back(`${P}/needs#n-${id}`, 'Saved. Add the suppliers you are comparing, with their quotes.');
}

export async function addQuote(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const need = s(f, 'need');
  try {
    await asUser(me.id, (q) => q(`insert into sourcing_quotes(need_id,supplier_id,amount_kes,notes,added_by) values($1,$2,$3,$4,$5)
      on conflict (need_id,supplier_id) do update set amount_kes=excluded.amount_kes, notes=excluded.notes`, [need, s(f, 'supplier'), Number(s(f, 'amount')) || null, s(f, 'notes') || null, me.id]));
  } catch (e) { console.error('[quote]', e); back(`${P}/needs`, 'Could not add that supplier. Choose one from the list.', 'err'); }
  revalidatePath(`${P}/needs`);
  back(`${P}/needs#n-${need}`, 'Added to the comparison.');
}

/** The person who raised the need says which supplier they would choose and why. A founder then approves or picks another. */
export async function recommendQuote(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const need = s(f, 'need'); const quote = s(f, 'quote'); const reason = s(f, 'reason');
  if (!reason) back(`${P}/needs#n-${need}`, 'Give the reason for your choice.', 'err');
  let title = '';
  await asUser(me.id, async (q) => {
    await q("update sourcing_needs set recommended_quote_id=$2, recommended_reason=$3, status='recommended' where id=$1", [need, quote, reason]);
    title = (await q('select title from sourcing_needs where id=$1', [need]))[0]?.title ?? '';
  });
  await asAdmin((q) => alertFounders(q, `Supplier choice to approve: ${title}`, `${me.displayName} recommends a supplier. Open Suppliers to approve it or choose another.`, '/portal/suppliers/needs', 'info', 'supplier'));
  revalidatePath(`${P}/needs`); revalidatePath('/portal/needs');
  back(`${P}/needs#n-${need}`, 'Sent to the founders for approval.');
}

export async function approveQuote(f: FormData) {
  const me = await requireMe('founder');
  const need = s(f, 'need'); const quote = s(f, 'quote'); const reason = s(f, 'reason');
  if (!reason) back(`${P}/needs#n-${need}`, 'Record the reason for the choice. It stays with the supplier’s history.', 'err');
  await asUser(me.id, (q) => q("update sourcing_needs set selected_quote_id=$2, selected_reason=$3, status='selected', decided_by=$4, decided_at=now() where id=$1", [need, quote, reason, me.id]));
  await audit(me.id, 'approve supplier choice', 'sourcing_needs');
  revalidatePath(`${P}/needs`); revalidatePath('/portal/needs');
  back(`${P}/needs#n-${need}`, 'Supplier approved for this need.');
}

export async function closeNeed(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const need = s(f, 'need');
  await asUser(me.id, (q) => q("update sourcing_needs set status='closed' where id=$1", [need]));
  revalidatePath(`${P}/needs`);
  back(`${P}/needs`, 'Closed.');
}

// ---------- founders' own to-do items on the Needs me page ----------

export async function addTodo(f: FormData) {
  const me = await requireMe('founder');
  const title = s(f, 'title');
  if (!title) back('/portal/needs', 'Say what needs doing.', 'err');
  await asUser(me.id, (q) => q('insert into founder_todos(title,details,link,due_on,created_by) values($1,$2,$3,$4,$5)', [title, s(f, 'details') || null, s(f, 'link') || null, s(f, 'due') || null, me.id]));
  revalidatePath('/portal/needs');
  back('/portal/needs', 'Added to your list.');
}

export async function doneTodo(f: FormData) {
  const me = await requireMe('founder');
  await asUser(me.id, (q) => q('update founder_todos set done_at=now(), done_by=$2 where id=$1', [s(f, 'todo'), me.id]));
  revalidatePath('/portal/needs');
  back('/portal/needs', 'Done.');
}
