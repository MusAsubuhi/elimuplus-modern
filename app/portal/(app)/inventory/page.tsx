import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import { d, kes } from '@/lib/format';
import { bookValue, todayEAT } from '@/lib/ops';
import { addItem, moveStock, setItemActive } from '../../biz-actions';

const lbl = 'block text-xs font-bold text-slate-600';
const CATS = ['materials', 'certificates', 'refreshments', 'equipment', 'other'];
const REASON: [string, string][] = [['received', 'Received (in)'], ['returned', 'Returned (in)'], ['issued_to_cohort', 'Issued to a cohort (out)'], ['used', 'Used (out)'], ['lost_damaged', 'Lost or damaged (out)'], ['count_correction', 'Stock count correction']];
export default async function Inventory({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams; const me = await requireMe('founder');
  const view = sp.view === 'assets' ? 'assets' : sp.view === 'log' ? 'log' : 'stock'; const today = todayEAT();
  const X = await asUser(me.id, async (q) => ({
    items: await q(`select i.*, i.purchase_date::text pd, i.cost_kes::float8 cost, i.reorder_level::float8 rl, coalesce((select sum(delta) from stock_movements m where m.item_id=i.id),0)::float8 on_hand from inventory_items i order by i.active desc, i.name`),
    log: await q(`select m.*, m.moved_on::text mo, m.delta::float8 dl, i.name, i.unit, c.name cohort from stock_movements m join inventory_items i on i.id=m.item_id left join cohorts c on c.id=m.cohort_id order by m.moved_on desc, m.created_at desc limit 80`),
    cohorts: await q(`select c.id, c.name from cohorts c join organisations o on o.id=c.organisation_id where not o.is_internal order by c.seq desc limit 30`),
  }));
  const stock = X.items.filter((i: any) => i.kind === 'stock'), assets = X.items.filter((i: any) => i.kind === 'asset');
  const low = stock.filter((i: any) => i.active && i.rl > 0 && i.on_hand <= i.rl);
  const bv = (a: any) => bookValue(a.cost ?? 0, a.pd, a.life_years ?? 0, today);
  const tab = (k: string, t: string) => <Link key={k} href={`/portal/inventory?view=${k}`} className={`rounded-full px-4 py-1.5 text-sm font-bold ${view === k ? 'bg-teal text-white' : 'border border-teal-100 bg-white text-teal'}`}>{t}</Link>;
  return (
    <>
      <PageHeader image="/images/hero-bg.jpg" title="Inventory and assets" subtitle="Workbooks, certificates, refreshments and other stock with a reorder level; plus equipment with who holds it and what it is worth today." />
      <div className="mb-4 grid gap-4 sm:grid-cols-3"><Stat label="Stock items" value={stock.filter((i: any) => i.active).length} /><Stat tone="red" label="At or below reorder level" value={low.length} /><Stat tone="gold" label="Equipment book value" value={kes(assets.filter((a: any) => a.active).reduce((s: number, a: any) => s + bv(a), 0))} sub={`${assets.filter((a: any) => a.active).length} items`} /></div>
      <div className="mb-5 flex gap-2">{tab('stock', 'Stock')}{tab('assets', 'Equipment')}{tab('log', 'Movements')}</div>
      <div className="space-y-5">
        {view === 'stock' && (<>
          <Card title="Stock on hand" subtitle="On hand is the sum of everything received, issued and counted. Items at or below their reorder level are marked.">
            <Table head={['Item', 'Category', 'On hand', 'Reorder at', '']}
              rows={stock.map((i: any) => [<span key="n" className={i.active ? '' : 'text-slate-400'}>{i.name}</span>, i.category, `${i.on_hand} ${i.unit}`, i.rl || '',
                i.active && i.rl > 0 && i.on_hand <= i.rl ? <Badge key="l" tone="red">reorder</Badge> : ''])} empty="No stock items yet." />
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Record stock moving">
              <form action={moveStock} className="grid gap-3 sm:grid-cols-2">
                <label className={`${lbl} sm:col-span-2`}>Item<select name="item_id" className={inputCls}>{stock.filter((i: any) => i.active).map((i: any) => <option key={i.id} value={i.id}>{i.name} ({i.on_hand} {i.unit})</option>)}</select></label>
                <label className={lbl}>What happened<select name="reason" className={inputCls}>{REASON.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
                <label className={lbl}>Quantity<input name="qty" inputMode="decimal" required className={inputCls} /></label>
                <label className={lbl}>For a correction, count is<select name="direction" className={inputCls}><option value="up">higher than the books</option><option value="down">lower than the books</option></select></label>
                <label className={lbl}>Cohort (if issued)<select name="cohort_id" className={inputCls}><option value="">None</option>{X.cohorts.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <label className={lbl}>Date<input type="date" name="on" defaultValue={today} className={inputCls} /></label><label className={lbl}>Note<input name="note" className={inputCls} /></label>
                <div className="sm:col-span-2"><button className={submitCls}>Save</button></div>
              </form>
            </Card>
            <Card title="Add an item">
              <form action={addItem} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="kind" value="stock" />
                <label className={`${lbl} sm:col-span-2`}>Name<input name="name" required className={inputCls} /></label>
                <label className={lbl}>Category<select name="category" className={inputCls}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></label><label className={lbl}>Unit<input name="unit" defaultValue="piece" className={inputCls} /></label>
                <label className={lbl}>Count now<input name="opening_qty" inputMode="decimal" className={inputCls} /></label><label className={lbl}>Reorder when at or below<input name="reorder_level" inputMode="decimal" className={inputCls} /></label>
                <label className={lbl}>Kept at<input name="location" className={inputCls} /></label>
                <div className="sm:col-span-2"><button className={submitCls}>Add item</button></div>
              </form>
            </Card>
          </div>
        </>)}
        {view === 'assets' && (<>
          <Card title="Equipment register" subtitle="Book value is straight-line over the life you give it. To bring it into the accounts, record the purchase and depreciation under Accounts and statements.">
            <Table head={['Item', 'Held by', 'Serial', 'Bought', 'Cost', 'Worth today', 'Condition', '']}
              rows={assets.map((a: any) => [a.name, a.assigned_to ?? '', a.serial ?? '', a.pd ? d(a.pd) : '', a.cost ? kes(a.cost) : '', a.cost ? kes(bv(a)) : '', a.condition ?? '',
                <form key="f" action={setItemActive}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="back" value="/portal/inventory?view=assets" /><input type="hidden" name="active" value={a.active ? 'no' : 'yes'} /><button className="text-xs font-bold text-teal underline">{a.active ? 'Retire' : 'Restore'}</button></form>])} empty="No equipment recorded." />
          </Card>
          <Card title="Add equipment">
            <form action={addItem} className="grid gap-3 sm:grid-cols-4"><input type="hidden" name="kind" value="asset" /><input type="hidden" name="category" value="equipment" />
              <label className={`${lbl} sm:col-span-2`}>Name<input name="name" required className={inputCls} /></label><label className={lbl}>Serial or tag<input name="serial" className={inputCls} /></label><label className={lbl}>Held by<input name="assigned_to" className={inputCls} /></label>
              <label className={lbl}>Bought on<input type="date" name="purchase_date" className={inputCls} /></label><label className={lbl}>Cost (KES)<input name="cost_kes" inputMode="decimal" className={inputCls} /></label>
              <label className={lbl}>Useful life (years)<input name="life_years" type="number" min={1} className={inputCls} /></label><label className={lbl}>Condition<input name="condition" placeholder="good, fair, needs repair" className={inputCls} /></label>
              <input type="hidden" name="opening_qty" value="1" /><div className="sm:col-span-4"><button className={submitCls}>Add equipment</button></div>
            </form>
          </Card>
        </>)}
        {view === 'log' && (
          <Card title="Recent movements"><Table head={['Date', 'Item', 'Change', 'Why', 'Cohort', 'Note']} rows={X.log.map((m: any) => [d(m.mo), m.name, `${m.dl > 0 ? '+' : ''}${m.dl} ${m.unit}`, m.reason.replace(/_/g, ' '), m.cohort ?? '', m.note ?? ''])} empty="Nothing yet." /></Card>
        )}
      </div>
    </>
  );
}
