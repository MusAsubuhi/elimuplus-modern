import Link from 'next/link';
import { asUser } from '@/lib/db';
import { getLang, requireMe } from '@/lib/session';
import { Badge, Card, PageHeader } from '@/components/ui';
import { FOCUS } from '@/lib/mentoring';
import { d } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Circles the signed-in person leads or belongs to. A partner's contact sees their own cohorts' circles as counts, never the people inside. */
export default async function Circles() {
  const me = await requireMe();
  const lang = await getLang(me);
  const rows = await asUser(me.id, (q) => q('select * from app.circles_visible() order by (status = \'closed\'), start_date desc nulls last, name'));
  const isPartner = me.roles.includes('org_admin') && !me.roles.includes('founder');
  const sw = lang === 'sw';
  const mine = (r: any) => me.roles.includes('founder') || r.mentor_person === me.id || !isPartner;
  return (
    <>
      <PageHeader title={isPartner ? 'Mentoring circles' : sw ? 'Vikundi vyangu vya ushauri' : 'My circles'}
        subtitle={isPartner ? 'Small mentoring circles formed from your cohorts. You see who mentors and how often they meet; the people and what is said stay private to the circle.' : sw ? 'Kikundi kidogo cha watu wachache wanaokutana na mshauri baada ya mafunzo.' : 'Small groups that meet with a mentor after the training.'} />
      {rows.length === 0 ? (
        <Card><p className="text-sm text-slate-600">{isPartner ? 'No circles have been formed from your cohorts yet.' : sw ? 'Bado hujawekwa kwenye kikundi cha ushauri. Tutakujulisha kikundi kikiundwa.' : 'You are not in a circle yet. When one is formed we will let you know.'}</p></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r: any) => (
            <Card key={r.id} title={r.name} subtitle={`${r.cohort_name} · ${FOCUS[r.focus]}`}>
              <p className="text-sm text-slate-700">{sw ? 'Mshauri' : 'Mentor'}: <b>{r.mentor_name}</b>{r.place ? ` · ${r.place}` : ''}</p>
              <p className="mt-1 text-xs text-slate-500">{r.members} {sw ? 'watu' : 'people'} · {r.held} {sw ? 'vikao vimefanyika' : 'sessions held'}{r.next_on ? ` · ${sw ? 'kinachofuata' : 'next'} ${d(r.next_on)}` : ''}</p>
              <div className="mt-3 flex items-center gap-2"><Badge tone={r.status === 'active' ? 'green' : 'grey'}>{r.status}</Badge>{r.has_minors && <Badge tone="gold">Includes under 18s</Badge>}
                {mine(r) && <Link href={`/portal/circles/${r.id}`} className="ml-auto text-sm font-bold text-teal underline">{sw ? 'Fungua' : 'Open'} →</Link>}</div>
            </Card>))}
        </div>)}
    </>
  );
}
