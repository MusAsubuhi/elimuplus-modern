import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader } from '@/components/ui';
import { submitCls } from '@/components/ui';
import { markNoticesRead } from '../../ops-actions';

const when = (t: string) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });

export default async function Notices() {
  const me = await requireMe();
  const rows = await asUser(me.id, (q) => q('select id, title, body, link, created_at, read_at from trainer_alerts where person_id=$1 order by (read_at is not null), created_at desc limit 60', [me.id]));
  const unread = rows.filter((r) => !r.read_at).length;
  return (
    <>
      <PageHeader image="/images/home-facilitator.jpg" title="My notices" subtitle="When a founder puts you on a training or changes your role on one, it appears here and is emailed to you." />
      {unread > 0 && (
        <form action={markNoticesRead} className="mb-4"><button className={submitCls}>Mark all {unread} as seen</button></form>
      )}
      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.id} className={r.read_at ? '' : 'border-gold'}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <b className="text-teal">{r.title}</b>
              <span className="text-xs text-slate-500">{!r.read_at && <Badge tone="gold">New</Badge>} {when(r.created_at)}</span>
            </div>
            {r.body && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{r.body}</p>}
            {r.link && <Link href={r.link} className="mt-2 inline-block text-sm font-bold text-teal underline">Open the training</Link>}
          </Card>
        ))}
        {!rows.length && <Card>Nothing yet. You will see a notice here whenever you are put on a training.</Card>}
      </div>
    </>
  );
}
