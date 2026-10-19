import Link from 'next/link';
import { asUser } from '@/lib/db';
import { getLang, requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Table, statusTone } from '@/components/ui';
import { d } from '@/lib/format';
import { STATUS_LABEL, themeLabel } from '@/lib/stories';

export default async function Stories() {
  const me = await requireMe('participant', 'facilitator', 'master', 'founder');
  const lang = await getLang(me);
  const rows = await asUser(me.id, (q) => q(
    `select s.id, s.title, s.body, s.status, s.themes, s.consent_story, s.consent_photo, s.created_at, p.full_name, c.name cohort_name,
            (select count(*)::int from story_photos sp where sp.story_id = s.id) photos
     from participant_stories s join people p on p.id = s.person_id join cohorts c on c.id = s.cohort_id
     where s.status <> 'withdrawn' order by s.created_at desc limit 200`));
  const staff = me.roles.some((r) => ['founder', 'facilitator', 'master'].includes(r));
  const sw = lang === 'sw';
  const waiting = rows.filter((r) => r.status === 'submitted').length;
  return (
    <>
      <PageHeader title={sw ? 'Hadithi zangu' : staff ? 'Participant stories' : 'My story'}
        subtitle={staff ? `${rows.length} stories${waiting ? `, ${waiting} waiting for review` : ''}` : sw ? 'Shiriki yaliyobadilika kwako.' : 'Share what has changed for you.'}>
        <Link href="/portal/stories/new" className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-teal">{sw ? 'Andika hadithi' : staff ? 'Collect a story' : 'Write my story'} →</Link>
      </PageHeader>
      <Card>
        <Table empty={sw ? 'Bado hakuna hadithi.' : 'No stories yet.'}
          head={staff ? ['Participant', 'Cohort', 'Story', 'What changed', 'Photos', 'Status', 'Sent'] : ['Story', 'Photos', 'Status', 'Sent']}
          rows={rows.map((r) => {
            const link = <Link href={`/portal/stories/${r.id}`} className="font-bold text-teal underline">{r.title || String(r.body).slice(0, 60) + '…'}</Link>;
            const st = <Badge tone={statusTone(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge>;
            return staff
              ? [r.full_name, r.cohort_name, link, (r.themes ?? []).map((t: string) => themeLabel(t)).join(', ') || '—', r.photos || '—', st, d(r.created_at)]
              : [link, r.photos || '—', st, d(r.created_at)];
          })} />
      </Card>
    </>
  );
}
