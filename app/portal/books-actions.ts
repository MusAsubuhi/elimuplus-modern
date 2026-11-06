'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const back = (view: string, msg: string, kind: 'ok' | 'err' = 'ok'): never => redirect(`/portal/books?view=${view}&${kind}=${encodeURIComponent(msg)}`);
const kes = (f: FormData, k: string) => Math.round(Number(s(f, k).replace(/,/g, '')));
const dateOk = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x);
const done = (view: string, msg: string): never => { revalidatePath('/portal/books'); revalidatePath('/portal/command'); return back(view, msg); };

export async function setBooksStart(f: FormData) {
  const me = await requireMe('founder');
  const d = s(f, 'start');
  if (!dateOk(d)) back('setup', 'Choose the date the books start.', 'err');
  await asUser(me.id, (q) => q(`insert into settings(key, value, note) values ('books_start_date', to_jsonb($1::text), 'Date the accounts start; opening balances are as at this date')
                               on conflict (key) do update set value = excluded.value`, [d]));
  await audit(me.id, `set books start date ${d}`, 'settings');
  done('setup', 'Books start date saved.');
}

export async function saveOpeningBalances(f: FormData) {
  const me = await requireMe('founder');
  await asUser(me.id, async (q) => {
    for (const m of await q('select id from money_accounts')) {
      const v = s(f, `open_${m.id}`);
      if (v === '') continue;
      const n = Math.round(Number(v.replace(/,/g, '')));
      if (!Number.isFinite(n)) continue;
      await q('update money_accounts set opening_kes=$2 where id=$1', [m.id, n]);
    }
  });
  await audit(me.id, 'set opening money balances', 'money_accounts');
  done('setup', 'Opening balances saved.');
}

export async function addMoneyCheck(f: FormData) {
  const me = await requireMe('founder');
  const on = s(f, 'on'), amt = kes(f, 'actual');
  if (!dateOk(on) || !Number.isFinite(amt)) back('setup', 'Give the date and the balance you read.', 'err');
  await asUser(me.id, (q) => q('insert into money_checks(money_account_id, checked_on, actual_kes, note, created_by) values ($1,$2,$3,$4,$5)', [s(f, 'account'), on, amt, s(f, 'note') || null, me.id]));
  done('setup', 'Balance check saved. It is compared with the books on the balance sheet.');
}

export async function addOpeningItem(f: FormData) {
  const me = await requireMe('founder');
  const kind = s(f, 'kind'), label = s(f, 'label'), amt = kes(f, 'amount');
  if (!['equipment', 'prepayment', 'other_asset', 'loan', 'other_liability', 'capital'].includes(kind) || !label || !(amt >= 0)) back('setup', 'Say what it is and the amount.', 'err');
  await asUser(me.id, (q) => q('insert into opening_items(kind, label, amount_kes, note, created_by) values ($1,$2,$3,$4,$5)', [kind, label, amt, s(f, 'note') || null, me.id]));
  await audit(me.id, `opening item: ${label} ${amt}`, 'opening_items');
  done('setup', 'Added to the opening position.');
}
export async function voidOpeningItem(f: FormData) {
  const me = await requireMe('founder');
  await asUser(me.id, (q) => q('update opening_items set voided_at=now() where id=$1', [s(f, 'id')]));
  done('setup', 'Removed from the opening position (kept in the history).');
}

export async function addLedgerEntry(f: FormData) {
  const me = await requireMe('founder');
  const kind = s(f, 'kind'), on = s(f, 'on'), amt = kes(f, 'amount');
  if (!['capital_in', 'drawings', 'loan_in', 'loan_repaid', 'asset_purchase', 'depreciation', 'other_income'].includes(kind) || !dateOk(on) || !(amt > 0)) back('setup', 'Choose the type, date and amount.', 'err');
  const cashKinds = ['capital_in', 'drawings', 'loan_in', 'loan_repaid', 'asset_purchase', 'other_income'];
  const money = cashKinds.includes(kind) ? s(f, 'money') || null : null;
  await asUser(me.id, (q) => q(`insert into ledger_entries(entry_date, kind, amount_kes, money_account_id, account_id, cohort_id, description, created_by)
    values ($1,$2,$3,$4,$5,$6,$7,$8)`, [on, kind, amt, money, kind === 'other_income' ? s(f, 'account') || null : null, s(f, 'cohort') || null, s(f, 'description') || null, me.id]));
  await audit(me.id, `ledger ${kind} ${amt}`, 'ledger_entries');
  done('setup', 'Entry saved.');
}
export async function voidLedgerEntry(f: FormData) {
  const me = await requireMe('founder');
  await asUser(me.id, (q) => q('update ledger_entries set voided_at=now() where id=$1', [s(f, 'id')]));
  done('setup', 'Entry removed from the books (kept in the history).');
}

/** Founders add their own cost (or income) accounts. Cost accounts also become something an expense can be recorded against. */
export async function addAccount(f: FormData) {
  const me = await requireMe('founder');
  const name = s(f, 'name'), kind = s(f, 'kind');
  if (!name || !['income', 'direct_cost', 'overhead'].includes(kind)) back('accounts', 'Give the account a name and say what it is.', 'err');
  const prefix = kind === 'income' ? '4' : kind === 'direct_cost' ? '5' : '6';
  await asUser(me.id, async (q) => {
    if ((await q('select 1 from accounts where lower(name)=lower($1)', [name])).length) throw new Error('dup');
    const codes = (await q("select code from accounts where code like $1 and code not in ('4900','6990') order by code", [prefix + '%'])).map((r) => Number(r.code));
    const code = String(Math.max(Number(prefix) * 1000, ...codes) + 10);
    const a = (await q('insert into accounts(code, name, kind, note, created_by) values ($1,$2,$3,$4,$5) returning id', [code, name, kind, s(f, 'note') || null, me.id]))[0];
    if (kind !== 'income') await q('insert into expense_categories(name, account_id) values ($1,$2) on conflict (name) do nothing', [name, a.id]);
  }).catch((e) => { if (String(e?.message) === 'dup') back('accounts', 'There is already an account with that name.', 'err'); throw e; });
  await audit(me.id, `added account ${name}`, 'accounts');
  done('accounts', 'Account added. It is now available when recording an expense.');
}
export async function setAccountActive(f: FormData) {
  const me = await requireMe('founder');
  await asUser(me.id, (q) => q('update accounts set active=$2 where id=$1 and not is_system', [s(f, 'id'), s(f, 'active') === 'yes']));
  done('accounts', 'Account updated.');
}
