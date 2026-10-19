import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Card, PageHeader, submitCls, inputCls } from '@/components/ui';
import { startPartnerPreview } from '../../preview-actions';

export default async function Preview() {
  const me = await requireMe('founder');
  const orgs = await asUser(me.id, (q) => q('select id, name from organisations where coalesce(is_internal,false)=false order by name'));
  return (
    <>
      <PageHeader image="/images/partner-hero.jpg" title="Preview the partner view" subtitle="See exactly what an organisation sees when it signs in: its cohorts, invoices, quotations, receipts, participant list and deliverables." />
      <Card title="Choose an organisation" subtitle="Everything shown is that organisation's real data, read-only. Nothing you click here changes anything.">
        <form action={startPartnerPreview} className="flex max-w-xl flex-wrap items-end gap-3 text-sm">
          <label className="block flex-1 font-bold">Organisation<select name="org" className={inputCls}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <button className={submitCls}>Open their view</button>
        </form>
        <p className="mt-3 text-xs text-slate-500">A preview account is created for each organisation the first time you use this. It has no sign-in, so nobody can use it to log in.</p>
      </Card>
    </>
  );
}
