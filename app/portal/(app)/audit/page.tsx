import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Card, PageHeader, Table } from '@/components/ui';

export default async function Audit() {
  const me = await requireMe('founder');
  const rows = await asUser(me.id, (q) => q(`select a.*, p.display_name from audit_log a left join people p on p.id=a.actor_id order by a.at desc limit 200`));
  return (
    <>
      <PageHeader title="Audit log" subtitle="Who looked at money, welfare and people records, and when. Founders included." />
      <Card><Table head={['When', 'Who', 'What', 'Area']} rows={rows.map((r) => [new Date(r.at).toLocaleString('en-GB'), r.display_name ?? '—', r.action, r.table_name ?? ''])} empty="Nothing logged yet." /></Card>
    </>
  );
}
