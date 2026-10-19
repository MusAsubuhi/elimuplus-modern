import { NextResponse } from 'next/server';
import { asAdmin, asUser } from '@/lib/db';
import { getMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { THEMES, isMinor } from '@/lib/stories';

export const runtime = 'nodejs';
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Save a participant's story. The participant can write their own; a trainer or founder can collect it on their behalf.
 * For under-18s the guardian's agreement must already be on file or be confirmed by the trainer. The consent is copied onto
 * the story, so a later change to the enrolment cannot rewrite what was agreed on the day.
 */
export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return bad('Please sign in again.', 401);
  let b: any;
  try { b = await req.json(); } catch { return bad('We could not read the form. Please try again.'); }

  const clip = (v: unknown, n: number) => { const s = String(v ?? '').trim().slice(0, n); return s || null; };
  const body = String(b.body ?? '').trim().slice(0, 6000);
  if (body.length < 20) return bad('Please write a little more. A few sentences is enough.');
  const consentStory = b.consent_story === 'named' ? 'named' : b.consent_story === 'anonymous' ? 'anonymous' : null;
  if (!consentStory) return bad('Choose whether the story may carry your name or stay anonymous.');
  const consentPhoto = b.consent_photo === true;
  const lang = ['sw', 'en', 'mixed'].includes(b.language) ? b.language : 'sw';
  const themes = (Array.isArray(b.themes) ? b.themes : []).filter((t: unknown) => THEMES.some((x) => x.k === t)).slice(0, 6);

  // which enrolment: a participant writes for themselves; trainers and founders name the participant
  const wanted = String(b.enrolment_id ?? '');
  if (wanted && !/^[0-9a-f-]{36}$/i.test(wanted)) return bad('We could not find that participant.', 404);
  const isTrainer = me.roles.includes('facilitator') || me.roles.includes('founder');
  const params: any[] = [me.id, isTrainer];
  let where = `e.status <> 'dropped' and (e.person_id = $1 or $2::boolean)`;
  if (wanted) { params.push(wanted); where += ' and e.id = $3'; } else where += ' and e.person_id = $1';
  const en = (await asUser(me.id, (q) => q(
    `select e.id, e.cohort_id, e.person_id, e.guardian_consent, p.birth_year, c.name cohort_name
     from enrolments e join people p on p.id = e.person_id join cohorts c on c.id = e.cohort_id
     where ${where} order by c.seq desc limit 1`, params).catch(() => [])))[0];
  if (!en) return bad('We could not find that participant. Check that they are enrolled in one of your cohorts.', 404);

  const own = en.person_id === me.id;
  const source = own ? 'self' : b.source === 'followup' ? 'followup' : 'trainer';

  // under-18s need a guardian's agreement; where the age is unknown, the person confirms they are an adult
  const minor = isMinor(en.birth_year);
  let guardianOk = false;
  if (minor) {
    guardianOk = !!en.guardian_consent || (!own && b.guardian_confirmed === true);
    if (!guardianOk) return bad(own
      ? 'Please ask your facilitator to record your parent or guardian’s agreement first.'
      : 'A parent or guardian must agree first. Tick the guardian box once they have.');
  } else if (en.birth_year == null && b.age_ok !== true) {
    return bad('Please confirm that this person is 18 or older, or that a guardian has agreed.');
  }
  const guardianName = clip(b.guardian_name, 120);

  try {
    // the insert runs as the signed-in person: row level security decides whether they may collect for this participant
    const row = await asUser(me.id, async (q) => (await q(
      `insert into participant_stories(enrolment_id, person_id, cohort_id, title, body, quote, language, themes, source, collected_by,
         consent_story, consent_photo, consent_guardian)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
      [en.id, en.person_id, en.cohort_id, clip(b.title, 140), body, clip(b.quote, 300), lang, themes, source, me.id,
        consentStory, consentPhoto, minor && guardianOk]))[0]);

    // the consent also goes on the enrolment, the one place reports and partners read it from
    await asAdmin(async (q) => {
      await q(
        `update enrolments set story_consent=$2, photo_consent=$3, guardian_consent = guardian_consent or $4,
           guardian_name = coalesce($5, guardian_name), consented_on = current_date where id=$1`,
        [en.id, consentStory, consentPhoto, minor && guardianOk, guardianName]);
      await q(
        `insert into founder_alerts(kind, severity, title, body, link, source_table, source_id)
         values ('story','info',$1,$2,$3,'participant_stories',$4)`,
        [`New story from ${en.cohort_name}`, `Waiting for review${consentPhoto ? ', photos allowed' : ''}.`, `/portal/stories/${row.id}`, row.id]);
    });
    await audit(me.id, own ? 'story submitted' : 'story collected for a participant', 'participant_stories');
    return NextResponse.json({ id: row.id });
  } catch (e) {
    console.error('[story]', e);
    return bad('We could not save the story. Please try again, or ask a founder to check your access.', 500);
  }
}
