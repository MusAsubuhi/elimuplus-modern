'use server';
import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin } from '@/lib/db';
import { requireFeature } from '@/lib/access';
import { audit } from '@/lib/audit';
import { HOST_FIELDS } from '@/lib/seminar';

const P = '/portal/seminars';
const back = (msg: string, kind: 'ok' | 'err' = 'ok'): never => redirect(`${P}?${kind}=${encodeURIComponent(msg)}`);
const s = (f: FormData, k: string, n = 2000) => String(f.get(k) ?? '').trim().slice(0, n);

export async function createSeminar(f: FormData) {
  const me = await requireFeature('seminars', 'edit');
  const title = s(f, 'title', 160), held = s(f, 'held_on', 10);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(held)) back('Please give a title and a date.', 'err');
  const code = randomBytes(4).toString('hex');
  await asAdmin((q) => q('insert into seminars(code, title, held_on, venue, created_by) values ($1,$2,$3,$4,$5)', [code, title, held, s(f, 'venue', 160) || null, me.id]));
  await audit(me.id, 'seminar.create', 'seminars');
  revalidatePath(P);
  back('Seminar created. Share the sign-in and feedback links below.');
}

export async function setSeminarStatus(f: FormData) {
  const me = await requireFeature('seminars', 'edit');
  const status = s(f, 'status', 10) === 'closed' ? 'closed' : 'open';
  await asAdmin((q) => q('update seminars set status = $2 where id = $1', [s(f, 'id', 40), status]));
  await audit(me.id, 'seminar.status', 'seminars');
  revalidatePath(P);
  back(status === 'open' ? 'Sign-in reopened.' : 'Sign-in closed.');
}

export async function saveHostReport(f: FormData) {
  const me = await requireFeature('seminars', 'edit');
  const report: Record<string, string> = {};
  for (const h of HOST_FIELDS) { const v = s(f, h.key); if (v) report[h.key] = v; }
  if (!report.agenda || !report.went_well) back('Please say what was covered and what went well.', 'err');
  await asAdmin((q) => q('update seminars set host_report = $2, host_report_by = $3, host_report_at = now() where id = $1', [s(f, 'id', 40), JSON.stringify(report), me.id]));
  await audit(me.id, 'seminar.host_report', 'seminars');
  revalidatePath(P);
  back('Host report saved.');
}
