import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import PrintButton from '@/components/print-button';
import { d, kes } from '@/lib/format';
import { balanceSheet, loadRaw, profitAndLoss, receivablesSummary, startOf, todayIso, workingCapital, contractedNotInvoiced, type Line } from '@/lib/books';
import { addAccount, addLedgerEntry, addMoneyCheck, addOpeningItem, saveOpeningBalances, setAccountActive, setBooksStart, voidLedgerEntry, voidOpeningItem } from '../../books-actions';

const VIEWS = [['pnl', 'Profit and loss'], ['bs', 'Balance sheet'], ['wc', 'Working capital'], ['accounts', 'Accounts'], ['setup', 'Set up and enter']] as const;
const KINDS: Record<string, string> = { income: 'Income', direct_cost: 'Cost of delivery (can be tied to a cohort)', overhead: 'Running cost (general)' };
const OPEN_KIND: Record<string, string> = { equipment: 'Equipment and assets (value today)', prepayment: 'Paid in advance (prepayment)', other_asset: 'Other asset', loan: 'Loan owed', other_liability: 'Other amount owed', capital: 'Capital put in before the start date' };
const LEDGER_KIND: Record<string, string> = { capital_in: 'Capital put in (money in)', drawings: 'Drawings or dividends (money out)', loan_in: 'Loan received (money in)', loan_repaid: 'Loan repaid (money out)', asset_purchase: 'Equipment bought (money out)', depreciation: 'Depreciation of equipment (no money moves)', other_income: 'Other income received (money in)' };

const Row = ({ label, value, bold, indent }: { label: string; value: number; bold?: boolean; indent?: boolean }) => (
  <tr className={bold ? 'border-t-2 border-teal-100 font-bold' : ''}><td className={`py-1.5 ${indent ? 'pl-5 text-slate-600' : ''}`}>{label}</td><td className="py-1.5 text-right tabular-nums">{value < 0 ? `(${kes(-value)})` : kes(value)}</td></tr>
);
const Lines = ({ lines }: { lines: Line[] }) => <>{lines.map((l) => <Row key={l.code} label={`${l.code}  ${l.name}`} value={l.amount} indent />)}</>;

export default async function Books({ searchParams }: { searchParams: Promise<{ view?: string; from?: string; to?: string; on?: string; cohort?: string }> }) {
  const sp = await searchParams;
  const me = await requireMe('founder');
  await audit(me.id, 'view accounts', 'books');
  const view = VIEWS.some(([k]) => k === sp.view) ? sp.view! : 'pnl';
  const X = await asUser(me.id, async (q) => ({
    raw: await loadRaw(q),
    cohorts: await q('select c.id, c.name from cohorts c join organisations o on o.id=c.organisation_id where not o.is_internal order by c.seq'),
    categories: await q('select k.name, a.code from expense_categories k join accounts a on a.id=k.account_id order by a.code'),
    ledger: await q(`select l.*, m.name money, a.name account, c.name cohort from ledger_entries l left join money_accounts m on m.id=l.money_account_id left join accounts a on a.id=l.account_id left join cohorts c on c.id=l.cohort_id where l.voided_at is null order by l.entry_date desc, l.created_at desc`),
    openItems: await q('select * from opening_items where voided_at is null order by created_at'),
    pending: await contractedNotInvoiced(q),
  }));
  const raw = X.raw, today = todayIso(), start = startOf(raw), startSet = !!raw.start;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? '') ? sp.from! : start, to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? '') ? sp.to! : today;
  const on = /^\d{4}-\d{2}-\d{2}$/.test(sp.on ?? '') ? sp.on! : today;
  const cohort = sp.cohort && sp.cohort !== 'all' ? sp.cohort : null;
  const cohortName = cohort === 'general' ? 'General (not tied to a cohort)' : X.cohorts.find((c) => c.id === cohort)?.name;

  return (
    <>
      <PageHeader image="/images/hero-bg.jpg" title="Accounts and statements" subtitle={`Elimu+ · accrual basis: income counts when an invoice is raised, costs when they are approved or incurred, whether or not money has moved. ${startSet ? `Books start ${d(raw.start)}.` : 'Books start date not set yet.'}`}>
        <Link href="/portal/books?view=setup" className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-teal">Set up and enter</Link>
      </PageHeader>
      <div className="no-print mb-5 flex flex-wrap gap-2">
        {VIEWS.map(([k, label]) => <Link key={k} href={`/portal/books?view=${k}`} className={`rounded-full px-4 py-1.5 text-sm font-bold ${view === k ? 'bg-teal text-white' : 'border border-teal-100 bg-white text-teal'}`}>{label}</Link>)}
      </div>
      {!startSet && view !== 'setup' && (
        <div className="mb-4 rounded-xl border-2 border-gold bg-gold-100 p-4 text-sm"><b>Set the books start date and your real bank and M-Pesa balances</b> so the balance sheet starts from true figures. Until then the statements start from your first record ({d(start)}) and money balances show as zero.
          <Link href="/portal/books?view=setup" className="ml-2 font-bold text-teal underline">Set up now</Link></div>
      )}

      {view === 'pnl' && (() => {
        const p = profitAndLoss(raw, from, to, cohort);
        const perCohort = X.cohorts.map((c) => ({ c, p: profitAndLoss(raw, from, to, c.id) })).filter((x) => x.p.totalRevenue || x.p.totalDirect);
        const general = profitAndLoss(raw, from, to, 'general');
        return (
          <>
            <form className="no-print mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-teal-100 bg-white p-3 text-sm">
              <input type="hidden" name="view" value="pnl" />
              <label className="font-bold">From<input type="date" name="from" defaultValue={from} className={inputCls} /></label>
              <label className="font-bold">To<input type="date" name="to" defaultValue={to} className={inputCls} /></label>
              <label className="font-bold">Show<select name="cohort" defaultValue={sp.cohort ?? 'all'} className={inputCls}><option value="all">Everything</option><option value="general">General costs only</option>{X.cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <button className={submitCls}>Update</button><PrintButton label="Print" />
            </form>
            <div className="mb-4 grid gap-4 sm:grid-cols-4">
              <Stat tone="green" label="Income" value={kes(p.totalRevenue)} /><Stat tone="red" label="Cost of delivery" value={kes(p.totalDirect)} />
              <Stat tone="gold" label="Gross profit" value={kes(p.grossProfit)} sub={p.totalRevenue ? `${Math.round((p.grossProfit / p.totalRevenue) * 100)}% of income` : ''} /><Stat label={p.netProfit >= 0 ? 'Net profit' : 'Net loss'} value={kes(p.netProfit)} />
            </div>
            <Card title="Profit and loss" subtitle={`Elimu+ · ${d(from)} to ${d(to)}${cohortName ? ` · ${cohortName}` : ''}`}>
              <table className="w-full text-sm"><tbody>
                <tr><td colSpan={2} className="pt-2 text-xs font-bold uppercase text-slate-500">Income</td></tr><Lines lines={p.revenue} /><Row label="Total income" value={p.totalRevenue} bold />
                <tr><td colSpan={2} className="pt-4 text-xs font-bold uppercase text-slate-500">Cost of delivery</td></tr><Lines lines={p.direct} /><Row label="Total cost of delivery" value={p.totalDirect} bold />
                <Row label="Gross profit" value={p.grossProfit} bold />
                <tr><td colSpan={2} className="pt-4 text-xs font-bold uppercase text-slate-500">Running costs</td></tr><Lines lines={p.overhead} /><Row label="Total running costs" value={p.totalOverhead} bold />
                <Row label={p.netProfit >= 0 ? 'Net profit' : 'Net loss'} value={p.netProfit} bold />
              </tbody></table>
              <p className="mt-3 text-xs text-slate-500">Support money given to participants is not Elimu+ money and is not included anywhere on these statements.</p>
            </Card>
            {!cohort && (
              <Card title="By cohort" subtitle="Income and the costs tied to each cohort. Costs not tied to a cohort, such as marketing, sit under General." className="mt-4">
                <Table head={['Cohort', 'Income', 'Cost of delivery', 'Margin']} rows={[
                  ...perCohort.map(({ c, p: x }) => [<b key={c.id}>{c.name}</b>, kes(x.totalRevenue), kes(x.totalDirect), kes(x.grossProfit)]),
                  [<b key="g">General (not tied to a cohort)</b>, kes(general.totalRevenue), kes(general.totalDirect + general.totalOverhead), kes(general.netProfit)],
                ]} />
              </Card>
            )}
          </>
        );
      })()}

      {view === 'bs' && (() => {
        const b = balanceSheet(raw, on);
        return (
          <>
            <form className="no-print mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-teal-100 bg-white p-3 text-sm">
              <input type="hidden" name="view" value="bs" />
              <label className="font-bold">As at<input type="date" name="on" defaultValue={on} className={inputCls} /></label>
              <button className={submitCls}>Update</button><PrintButton label="Print" />
            </form>
            <Card title="Balance sheet" subtitle={`Elimu+ · as at ${d(on)}`}>
              <table className="w-full text-sm"><tbody>
                <tr><td colSpan={2} className="pt-2 text-xs font-bold uppercase text-slate-500">What we have</td></tr>
                {b.cashLines.map((c) => <Row key={c.id} label={c.name} value={c.amount} indent />)}
                <Row label="Owed to us by partners (receivables)" value={b.receivables} indent />
                {b.prepayments > 0 && <Row label="Paid in advance" value={b.prepayments} indent />}
                {b.otherAssets > 0 && <Row label="Other assets" value={b.otherAssets} indent />}
                <Row label="Current assets" value={b.currentAssets} bold />
                <Row label="Equipment (after depreciation)" value={b.equipment} indent />
                <Row label="Total assets" value={b.totalAssets} bold />
                <tr><td colSpan={2} className="pt-4 text-xs font-bold uppercase text-slate-500">What we owe</td></tr>
                <Row label="Approved costs not yet paid (payables)" value={b.payables} indent />
                {b.payrollOwed > 0 && <Row label="Salaries and statutory payments due" value={b.payrollOwed} indent />}
                {b.otherLiab > 0 && <Row label="Other amounts owed" value={b.otherLiab} indent />}
                <Row label="Current liabilities" value={b.currentLiabilities} bold />
                {b.loans > 0 && <Row label="Loans" value={b.loans} indent />}
                <Row label="Total liabilities" value={b.totalLiabilities} bold />
                <tr><td colSpan={2} className="pt-4 text-xs font-bold uppercase text-slate-500">What belongs to the owners</td></tr>
                <Row label="Capital put in" value={b.capital} indent />
                <Row label="Reserves brought forward from before the start date" value={b.reserves} indent />
                <Row label="Profit or loss since the start date" value={b.profit} indent />
                {b.drawings > 0 && <Row label="Less drawings" value={-b.drawings} indent />}
                <Row label="Total equity" value={b.equity} bold />
                <Row label="Liabilities plus equity" value={b.totalLiabilities + b.equity} bold />
              </tbody></table>
              {b.difference !== 0 && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">The sheet is out by {kes(Math.abs(b.difference))}. That should not happen; please tell Claude.</p>}
              {!startSet && <p className="mt-3 text-xs text-slate-500">Opening balances are zero until you enter your real bank and M-Pesa balances under Set up.</p>}
            </Card>
            {b.checks.length > 0 && (
              <Card title="Books against real balances" subtitle="Latest balance you read from each statement, compared with what the books say on that day" className="mt-4">
                <Table head={['Account', 'Read on', 'Real balance', 'Books say', 'Difference']} rows={b.checks.map((c) => [c.name, d(c.on), kes(c.actual), kes(c.book), <span key="d" className={c.diff ? 'font-bold text-red-700' : ''}>{kes(c.diff)}</span>])} />
                <p className="mt-2 text-xs text-slate-500">A difference usually means a payment, fee or withdrawal that has not been recorded yet.</p>
              </Card>
            )}
          </>
        );
      })()}

      {view === 'wc' && (() => {
        const w = workingCapital(raw, on), r = receivablesSummary(raw, on);
        return (
          <>
            <form className="no-print mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-teal-100 bg-white p-3 text-sm">
              <input type="hidden" name="view" value="wc" />
              <label className="font-bold">As at<input type="date" name="on" defaultValue={on} className={inputCls} /></label>
              <button className={submitCls}>Update</button><PrintButton label="Print" />
            </form>
            <div className="mb-4 grid gap-4 sm:grid-cols-4">
              <Stat tone={w.workingCapital >= 0 ? 'green' : 'red'} label="Working capital" value={kes(w.workingCapital)} sub="current assets less current liabilities" />
              <Stat label="Cash and mobile money" value={kes(w.cash)} /><Stat tone="gold" label="Receivables" value={kes(r.total)} sub={`${kes(r.overdue)} overdue`} />
              <Stat label="Current ratio" value={w.currentRatio === null ? 'No debts' : w.currentRatio.toFixed(2)} sub="above 1 means we can cover what we owe" />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Working capital" subtitle={`As at ${d(on)}`}>
                <table className="w-full text-sm"><tbody>
                  {w.cashLines.map((c) => <Row key={c.id} label={c.name} value={c.amount} indent />)}
                  <Row label="Owed to us (receivables)" value={w.receivables} indent />
                  {(w.prepayments + w.otherAssets) > 0 && <Row label="Paid in advance and other" value={w.prepayments + w.otherAssets} indent />}
                  <Row label="Current assets" value={w.currentAssets} bold />
                  <Row label="Approved costs not yet paid" value={w.payables} indent />
                  {w.payrollOwed > 0 && <Row label="Salaries and statutory payments due" value={w.payrollOwed} indent />}
                  {w.otherLiab > 0 && <Row label="Other amounts owed" value={w.otherLiab} indent />}
                  <Row label="Current liabilities" value={w.currentLiabilities} bold />
                  <Row label="Working capital" value={w.workingCapital} bold />
                </tbody></table>
              </Card>
              <Card title="Looking ahead" subtitle={`Cash after collecting what is due and paying what we owe plus an average month of costs (${kes(w.monthlyCost)} a month over the last 90 days). An estimate, not a promise.`}>
                <Table head={['Next', 'Expected in', 'Expected out', 'Cash position']} rows={w.horizon.map((h) => [`${h.days} days`, kes(h.inflow), kes(h.outflow), <b key="p" className={h.position < 0 ? 'text-red-700' : ''}>{kes(h.position)}</b>])} />
                <p className="mt-2 text-xs text-slate-500">Money in counts only invoices already raised that fall due in that window. Signed work not yet invoiced ({kes(X.pending.total)}) is not counted.</p>
              </Card>
            </div>
            <Card title="Receivables: who owes us" subtitle="Unpaid invoices, oldest first" className="mt-4">
              <div className="mb-3 grid gap-3 sm:grid-cols-4">{r.buckets.map((b) => <Stat key={b.label} label={b.label} value={kes(b.amount)} tone={b.label.startsWith('Not') ? 'teal' : 'gold'} />)}</div>
              <Table head={['Partner', 'Invoice', 'Issued', 'Due', 'Balance', 'Late']} rows={r.rows.map((x) => [<b key="o">{x.org}</b>, x.number, d(x.issued_on), d(x.due_on), kes(x.balance), x.overdueDays ? <Badge key="l" tone="red">{x.overdueDays} days</Badge> : 'on time'])} empty="Nothing is owed to us." />
              {X.pending.items.length > 0 && (
                <div className="mt-4 rounded-lg bg-mist p-3 text-sm"><b>Contracted, not yet invoiced: {kes(X.pending.total)}</b>
                  <div className="mt-1 text-slate-600">{X.pending.items.map((i) => `${i.org}${i.cohort ? ` (${i.cohort})` : ''} ${kes(i.left)}`).join(' · ')}</div></div>
              )}
            </Card>
          </>
        );
      })()}

      {view === 'accounts' && (
        <>
          <Card title="Chart of accounts" subtitle="Every cost is recorded against one of these. Add your own for anything that matters to Elimu+; a new cost account is also offered when recording an expense.">
            {(['income', 'direct_cost', 'overhead'] as const).map((k) => (
              <div key={k} className="mb-4"><p className="mb-1 text-xs font-bold uppercase text-slate-500">{KINDS[k]}</p>
                <div className="divide-y divide-teal-50 text-sm">
                  {raw.accounts.filter((a) => a.kind === k).map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span><span className="font-mono text-xs text-slate-500">{a.code}</span> <b className={a.active ? '' : 'text-slate-400 line-through'}>{a.name}</b> {a.is_system && <span className="text-xs text-slate-400">built in</span>}</span>
                      {!a.is_system && <form action={setAccountActive}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="active" value={a.active ? 'no' : 'yes'} /><button className="text-xs font-bold text-teal underline">{a.active ? 'Stop using' : 'Use again'}</button></form>}</div>
                  ))}
                </div></div>
            ))}
          </Card>
          <Card title="Add an account" className="mt-4">
            <form action={addAccount} className="grid max-w-3xl gap-3 text-sm sm:grid-cols-4">
              <input name="name" placeholder="Name, for example Forum costs" required className={`${inputCls} sm:col-span-2`} />
              <select name="kind" className={inputCls} defaultValue="overhead"><option value="overhead">Running cost (general)</option><option value="direct_cost">Cost of delivery (cohort)</option><option value="income">Income</option></select>
              <button className={submitCls}>Add account</button>
              <input name="note" placeholder="What goes here (optional)" className={`${inputCls} sm:col-span-4`} />
            </form>
          </Card>
          <Card title="How expense categories map to accounts" className="mt-4"><Table head={['Expense category', 'Account']} rows={X.categories.map((c) => [c.name, c.code])} /></Card>
        </>
      )}

      {view === 'setup' && (
        <>
          <Card title="1. Books start date" subtitle="The day your accounts begin. Opening balances below are the real balances on this date. Invoices and costs from before it are treated as already in the opening position.">
            <form action={setBooksStart} className="flex max-w-md flex-wrap items-end gap-3 text-sm">
              <label className="block flex-1 font-bold">Start date<input type="date" name="start" defaultValue={raw.start ?? ''} required className={inputCls} /></label><button className={submitCls}>Save date</button>
            </form>
          </Card>
          <Card title="2. Real bank, M-Pesa and cash balances on that date" subtitle="Read these from your bank statement, M-Pesa statement and a cash count. Leave a box empty to keep what is there." className="mt-4">
            <form action={saveOpeningBalances} className="grid max-w-3xl gap-3 text-sm sm:grid-cols-3">
              {raw.money.map((m) => <label key={m.id} className="block font-bold">{m.name}<input name={`open_${m.id}`} type="number" step="1" defaultValue={m.opening_kes || ''} placeholder="KES" className={inputCls} /></label>)}
              <div className="sm:col-span-3"><button className={submitCls}>Save opening balances</button></div>
            </form>
          </Card>
          <Card title="3. Anything else you had on the start date (fill in when ready)" subtitle="Equipment, money paid in advance, loans, capital put in. Money owed to you by partners and money you owed for approved costs are worked out from the records, so do not enter those." className="mt-4">
            <form action={addOpeningItem} className="mb-3 grid gap-2 rounded-lg bg-mist p-3 text-sm sm:grid-cols-5">
              <select name="kind" className={inputCls}>{Object.entries(OPEN_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <input name="label" placeholder="What it is" required className={`${inputCls} sm:col-span-2`} />
              <input name="amount" type="number" min="0" step="1" placeholder="Amount (KES)" required className={inputCls} />
              <button className={submitCls}>Add</button>
            </form>
            <Table head={['Type', 'What', 'Amount', '']} rows={X.openItems.map((o) => [OPEN_KIND[o.kind], o.label, kes(o.amount_kes), <form key="v" action={voidOpeningItem}><input type="hidden" name="id" value={o.id} /><button className="text-xs font-bold text-red-700 underline">Remove</button></form>])} empty="Nothing entered yet." />
          </Card>
          <Card title="4. Capital, loans, equipment and other income during the year" subtitle="Things that change the books but are not an invoice or an expense. Costs and trainer pay come from their own pages." className="mt-4">
            <form action={addLedgerEntry} className="mb-3 grid gap-2 rounded-lg bg-mist p-3 text-sm sm:grid-cols-6">
              <select name="kind" className={`${inputCls} sm:col-span-2`}>{Object.entries(LEDGER_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <input name="on" type="date" defaultValue={today} required className={inputCls} />
              <input name="amount" type="number" min="1" step="1" placeholder="Amount (KES)" required className={inputCls} />
              <select name="money" className={inputCls}><option value="">Paid through…</option>{raw.money.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              <select name="account" className={inputCls}><option value="">Income account…</option>{raw.accounts.filter((a) => a.kind === 'income').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
              <input name="description" placeholder="Note (optional)" className={`${inputCls} sm:col-span-5`} /><button className={submitCls}>Add</button>
            </form>
            <Table head={['Date', 'Type', 'Amount', 'Through', 'Note', '']} rows={X.ledger.map((l) => [d(l.entry_date), LEDGER_KIND[l.kind], kes(l.amount_kes), l.money ?? '', l.description ?? '', <form key="v" action={voidLedgerEntry}><input type="hidden" name="id" value={l.id} /><button className="text-xs font-bold text-red-700 underline">Remove</button></form>])} empty="Nothing entered yet." />
          </Card>
          <Card title="5. Check the books against a real balance" subtitle="Enter what the bank or M-Pesa statement says on a date. The balance sheet then shows any difference." className="mt-4">
            <form action={addMoneyCheck} className="grid max-w-3xl gap-2 text-sm sm:grid-cols-5">
              <select name="account" className={inputCls}>{raw.money.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              <input name="on" type="date" defaultValue={today} required className={inputCls} />
              <input name="actual" type="number" step="1" placeholder="Real balance (KES)" required className={inputCls} />
              <input name="note" placeholder="Note (optional)" className={inputCls} /><button className={submitCls}>Save</button>
            </form>
          </Card>
        </>
      )}
    </>
  );
}
