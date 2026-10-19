'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { nextParticipantNumber } from '@/lib/certs';

/** Founders confirm who completed, and certificates are created for exactly those people. */
export async function issueParticipantCertificates(f: FormData) {
  const me = await requireMe('founder');
  const cohort = String(f.get('cohort') ?? '');
  const ids = f.getAll('enrol').map(String);
  const P = `/portal/cohorts/${cohort}`;
  if (!ids.length) redirect(`${P}?err=${encodeURIComponent('Tick at least one participant.')}`);
  let made = 0;
  try {
    await asUser(me.id, async (q) => {
      for (const id of ids) {
        const e = (await q('select id, person_id from enrolments where id=$1 and cohort_id=$2', [id, cohort]))[0];
        if (!e) continue;
        if ((await q('select 1 from participant_certificates where enrolment_id=$1', [id])).length) continue;
        await q('insert into participant_certificates(enrolment_id, cohort_id, person_id, number, issued_by) values ($1,$2,$3,$4,$5)', [id, cohort, e.person_id, await nextParticipantNumber(q), me.id]);
        await q("update enrolments set status='completed' where id=$1 and status='enrolled'", [id]);
        made++;
      }
      const n = (await q('select count(*)::int n from participant_certificates where cohort_id=$1', [cohort]))[0].n;
      await q('update cohorts set certificates_count=$2, certificates_issued_on=coalesce(certificates_issued_on, current_date) where id=$1', [cohort, n]);
    });
  } catch (e) { console.error('[certs]', e); redirect(`${P}?err=${encodeURIComponent('Could not issue the certificates.')}`); }
  await audit(me.id, `issued ${made} participant certificates`, 'participant_certificates');
  revalidatePath(P);
  revalidatePath('/portal/partner/timeline');
  redirect(`${P}?ok=${encodeURIComponent(`${made} certificate${made === 1 ? '' : 's'} issued. Print them all from "Print certificates".`)}`);
}
