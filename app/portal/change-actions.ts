'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { programmeDays, quoteLines, trainingDates } from '@/lib/billing';

const s = (f: FormData, k: string, n = 500) => String(f.get(k) ?? '').trim().slice(0, n);
const back = (msg: string, kind: 'ok' | 'err' = 'ok'): never => redirect(`/portal/changes?${kind}=${encodeURIComponent(msg)}`);

/** Approve or deny a partner's change request. Approving applies it; denying leaves everything as it was. */
export async function decideCohortChange(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'request'), approve = s(f, 'decision') === 'approve', note = s(f, 'note', 500);
  if (!approve && !note) back('Say briefly why it is denied, so the partner understands.', 'err');
  let msg = '';
  try {
    msg = await asUser(me.id, async (q) => {
      const r = (await q("select * from cohort_change_requests where id=$1 and status='pending'", [id]))[0];
      if (!r) throw new Error('gone');
      let out = approve ? 'Approved and applied.' : 'Denied. The partner will see your note.';
      if (approve) {
        const ch = r.changes as Record<string, any>;
        const c = (await q('select * from cohorts where id=$1', [r.cohort_id]))[0];
        if (!c || ['delivering', 'followup', 'closed'].includes(c.status)) throw new Error('started');
        const sets: string[] = [], vals: any[] = [r.cohort_id];
        for (const k of ['name', 'venue', 'audience', 'language', 'expected_participants', 'start_date'] as const) {
          if (k in ch) { vals.push(ch[k]); sets.push(`${k}=$${vals.length}${k === 'start_date' ? '::date' : ''}`); }
        }
        if (ch.start_date) {
          // keep the end date and the daily sessions in step with the new start, skipping weekends
          const days = trainingDates(ch.start_date, programmeDays(c.format));
          vals.push(days[days.length - 1]); sets.push(`end_date=$${vals.length}::date`);
          for (let i = 0; i < days.length; i++) await q('update sessions set session_date=$3::date where cohort_id=$1 and day_number=$2', [r.cohort_id, i + 1, days[i]]);
        }
        if (sets.length) await q(`update cohorts set ${sets.join(', ')} where id=$1`, vals);
        if ('expected_participants' in ch) {
          const qt = (await q("select id, status from quotes where cohort_id=$1 and scope='training' and status<>'declined' order by issued_on desc limit 1", [r.cohort_id]))[0];
          if (qt && ['draft', 'sent'].includes(qt.status)) {
            const sessions = programmeDays(c.format);
            await q("delete from quote_lines where quote_id=$1 and kind='training'", [qt.id]);
            for (const l of quoteLines(ch.expected_participants, sessions)) await q('insert into quote_lines(quote_id,kind,description,qty,unit_kes) values ($1,$2,$3,$4,$5)', [qt.id, l.kind, l.description, l.qty, l.unit_kes]);
            await q('update quotes set participants=$2 where id=$1', [qt.id, ch.expected_participants]);
            out += ' The unsigned quotation was recalculated for the new number of participants.';
          } else if (qt) out += ' The quotation is already signed, so its amount was not changed. Adjust it by hand if the price should move.';
        }
      }
      await q("update cohort_change_requests set status=$2, decided_by=$3, decided_at=now(), decision_note=$4 where id=$1", [id, approve ? 'approved' : 'denied', me.id, note || null]);
      return out;
    });
  } catch (e: any) { back(e?.message === 'started' ? 'This training has already started, so the change was not applied. Deny the request or handle it by hand.' : 'That request has already been decided or could not be applied.', 'err'); }
  await audit(me.id, `${approve ? 'approved' : 'denied'} a training change request`, 'cohort_change_requests');
  revalidatePath('/portal', 'layout');
  back(msg);
}
