import 'server-only';
import { asAdmin } from './db';
import { sendConfirmation } from './newsletter';
import { orgConfirmEmail, trainerConfirmEmail } from './emails';

type Row = { id: string; kind: string; name: string | null; email: string | null; org_name: string | null };

/** The acknowledgement a person receives after a website form: the trainer one for trainers, the organisation one for everything else. */
export const ackText = (r: Pick<Row, 'kind' | 'name' | 'org_name'>) => {
  const first = (r.name ?? '').trim().split(/\s+/)[0] || undefined;
  const m = r.kind === 'trainer' ? trainerConfirmEmail(first) : orgConfirmEmail(first, r.org_name ?? undefined);
  return { subject: m.subject, text: m.text };
};

/** Sends the acknowledgement for one enquiry and records what happened on the enquiry itself. Never throws. */
export async function sendEnquiryAck(id: string): Promise<'sent' | 'skipped' | 'failed'> {
  const r = (await asAdmin((q) => q('select id, kind, name, email, org_name from web_enquiries where id=$1', [id])))[0] as Row | undefined;
  if (!r?.email) return 'failed';
  try {
    const res = await sendConfirmation(r.kind === 'trainer' ? 'confirm_trainer' : 'confirm_org', r.email, r.name ?? '', r.org_name ?? undefined);
    await asAdmin((q) => q('update web_enquiries set ack_sent_at = coalesce(ack_sent_at, now()), ack_error = null where id=$1', [id]));
    return res;
  } catch (e: any) {
    await asAdmin((q) => q('update web_enquiries set ack_error=$2 where id=$1', [id, String(e?.message ?? e).slice(0, 300)])).catch(() => {});
    return 'failed';
  }
}
