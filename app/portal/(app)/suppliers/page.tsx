import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import { kes, d } from '@/lib/format';
import { addSupplier, setSupplierStatus } from '../../supplier-actions';

const tone = (s: string) => (s === 'active' ? 'green' : s === 'suggested' ? 'gold' : s === 'on_hold' ? 'grey' : 'red');
const stars = (n: number | null) => (n == null ? 'not rated yet' : `${Number(n).toFixed(1)} / 5`);

export default async function Suppliers({ searchParams }: { searchParams: Promise<{ category?: string; region?: string; q?: string }> }) {
  const me = await requireMe('facilitator', 'founder');
  const founder = me.roles.includes('founder');
  const { category = '', region = '', q: text = '' } = await searchParams;
  const rows = await asUser(me.id, (q) => q(`select s.*,
      (select coalesce(sum(coalesce(r.paid_amount_kes, r.amount_kes)),0)::int from expense_requests r where r.supplier_id=s.id and r.status in ('approved','paid','reconciled')) spent,
      (select count(*)::int from expense_requests r where r.supplier_id=s.id and r.status in ('approved','paid','reconciled')) jobs,
      (select max(coalesce(r.spent_on, r.created_at::date)) from expense_requests r where r.supplier_id=s.id and r.status in ('approved','paid','reconciled')) last_used,
      (select round(avg((v.price+v.quality+v.reliability)/3.0),1) from supplier_reviews v where v.supplier_id=s.id) rating,
      (select count(*)::int from supplier_reviews v where v.supplier_id=s.id) reviews
      from suppliers s order by (s.status='suggested') desc, s.name`));
  const all = rows as any[];
  const cats = [...new Set(all.flatMap((x) => x.categories as string[]))].sort();
  const regs = [...new Set(all.flatMap((x) => x.regions as string[]))].sort();
  const has = (arr: string[], v: string) => arr.some((a) => a.toLowerCase() === v.toLowerCase());
  const shown = all.filter((x) =>
    (!category || has(x.categories, category)) &&
    (!region || has(x.regions, region) || x.regions.length === 0) &&
    (!text || `${x.name} ${x.offers ?? ''} ${x.contact_name ?? ''}`.toLowerCase().includes(text.toLowerCase())));
  const waiting = all.filter((x) => x.status === 'suggested');
  const mineWaiting = waiting.filter((x) => x.suggested_by === me.id);
  return (
    <>
      <PageHeader image="/images/trainer-team.jpg" title="Suppliers" subtitle="Who we buy from, by category and region, with what we have spent and how each did. Anyone who delivers can suggest a supplier; a founder approves it before it is used." />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Approved suppliers" value={all.filter((x) => x.status === 'active').length} />
        <Stat tone={waiting.length ? 'gold' : 'green'} label={founder ? 'To approve' : 'Waiting for approval'} value={founder ? waiting.length : mineWaiting.length} />
        <Stat label="Categories" value={cats.length} />
        <Stat label="Regions" value={regs.length} />
      </div>
      <p className="mb-4 text-sm"><Link className="font-bold text-teal underline" href="/portal/suppliers/needs">Choosing a supplier for something we need →</Link></p>
      {founder && waiting.length > 0 && (
        <Card title={`Suggested suppliers to decide (${waiting.length})`} className="mb-4">
          <div className="space-y-3">{waiting.map((x) => (
            <div key={x.id} className="rounded-lg bg-mist p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><Link href={`/portal/suppliers/${x.id}`} className="font-bold text-teal underline">{x.name}</Link>
                  <div className="text-xs text-slate-600">{x.categories.join(', ')}{x.regions.length ? ` · ${x.regions.join(', ')}` : ' · any region'}{x.phone ? ` · ${x.phone}` : ''}</div>
                  {x.offers && <div className="mt-1 text-xs">{x.offers}</div>}</div>
                <form action={setSupplierStatus} className="flex gap-2"><input type="hidden" name="supplier" value={x.id} />
                  <button name="status" value="active" className={submitCls}>Approve</button>
                  <button name="status" value="declined" className="rounded-lg border border-teal-100 px-3 py-2 text-sm font-bold text-teal">Decline</button></form>
              </div>
            </div>))}</div>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Find a supplier" className="lg:col-span-2">
          <form className="mb-3 grid gap-2 sm:grid-cols-4" action="/portal/suppliers">
            <input name="q" defaultValue={text} placeholder="Name or what they offer" className={inputCls} />
            <input name="category" defaultValue={category} list="cats" placeholder="Category" className={inputCls} />
            <input name="region" defaultValue={region} list="regs" placeholder="Region or town" className={inputCls} />
            <button className={submitCls}>Filter</button>
          </form>
          {region && <p className="mb-2 text-xs text-slate-500">Showing suppliers for {region}, and those that serve any region.</p>}
          <Table head={['Supplier', 'Serves', 'Used', 'Rating', 'Status']} empty="No suppliers match. Add the first one on the right." rows={shown.map((x) => [
            <div key="n"><Link href={`/portal/suppliers/${x.id}`} className="font-bold text-teal underline">{x.name}</Link><div className="text-xs text-slate-500">{x.categories.join(', ')}</div></div>,
            <span key="r" className="text-xs">{x.regions.length ? x.regions.join(', ') : 'Any region'}</span>,
            <span key="u" className="text-xs">{x.jobs ? `${x.jobs} job${x.jobs === 1 ? '' : 's'} · ${kes(x.spent)}${x.last_used ? ` · last ${d(x.last_used)}` : ''}` : 'Not used yet'}</span>,
            <span key="s" className="text-xs">{stars(x.rating)}{x.reviews ? ` (${x.reviews})` : ''}</span>,
            <Badge key="b" tone={tone(x.status)}>{x.status.replace('_', ' ')}</Badge>])} />
        </Card>
        <Card title={founder ? 'Add a supplier' : 'Suggest a supplier'} subtitle={founder ? 'Active straight away.' : 'A founder approves it before anyone can use it.'}>
          <form action={addSupplier} className="space-y-2 text-sm">
            <label className="block font-bold">Name<input name="name" required className={inputCls} /></label>
            <label className="block font-bold">Categories <span className="font-normal text-slate-500">(comma-separated; type anything new)</span><input name="categories" list="cats" required className={inputCls} placeholder="Venue, Catering" /></label>
            <label className="block font-bold">Regions or towns <span className="font-normal text-slate-500">(leave empty if they serve anywhere)</span><input name="regions" list="regs" className={inputCls} placeholder="Mombasa, Likoni" /></label>
            <label className="block font-bold">Contact person<input name="contact_name" className={inputCls} /></label>
            <label className="block font-bold">Phone<input name="phone" className={inputCls} /></label>
            <label className="block font-bold">Email<input name="email" type="email" className={inputCls} /></label>
            <label className="block font-bold">What they offer<textarea name="offers" rows={2} className={inputCls} /></label>
            <button className={submitCls}>{founder ? 'Add supplier' : 'Suggest supplier'}</button>
          </form>
        </Card>
      </div>
      <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="regs">{regs.map((c) => <option key={c} value={c} />)}</datalist>
    </>
  );
}
