import Link from 'next/link';
import { asUser } from '@/lib/db';
import { getLang, requireMe } from '@/lib/session';
import { Card, PageHeader } from '@/components/ui';
import StoryForm, { type Who } from '@/components/story-form';
import { THEMES, isMinor, photosEnabled } from '@/lib/stories';

export default async function NewStory() {
  const me = await requireMe('participant', 'facilitator', 'master', 'founder');
  const lang = await getLang(me);
  const trainer = me.roles.includes('facilitator') || me.roles.includes('founder');
  const rows = await asUser(me.id, (q) => q(
    `select e.id, p.full_name, p.birth_year, p.id person_id, c.name cohort_name
     from enrolments e join people p on p.id = e.person_id join cohorts c on c.id = e.cohort_id
     where e.status <> 'dropped' and (${trainer ? 'true' : 'p.id = $1'}) order by c.seq desc, p.full_name limit 400`, trainer ? [] : [me.id]));
  const who: Who[] = rows.map((r) => ({ id: r.id, name: r.person_id === me.id ? (lang === 'sw' ? 'Mimi' : 'Me') : r.full_name, cohort: r.cohort_name, minor: isMinor(r.birth_year), ageKnown: r.birth_year != null }));
  const own = !trainer;
  return (
    <>
      <PageHeader title={lang === 'sw' ? 'Hadithi yako' : trainer ? 'Collect a story' : 'Your story'}
        subtitle={lang === 'sw' ? 'Tunapenda kusikia kutoka kwako.' : 'Tell us what has changed since the training, in your own words.'} />
      <Card>
        {who.length ? <StoryForm who={who} themes={THEMES} photos={await photosEnabled()} lang={lang} own={own} />
          : <p className="text-sm">{lang === 'sw' ? 'Bado hujasajiliwa kwenye kundi.' : 'You are not enrolled in a cohort yet.'} <Link href="/portal/me" className="font-bold text-teal underline">Back</Link></p>}
      </Card>
    </>
  );
}
