import { NextResponse } from 'next/server';
import { asAdmin } from '@/lib/db';
import { validSecret } from '@/lib/forms-auth';
import { normPhone } from '@/lib/accounts';
import { ALL_TEMPLATES, CONCERN_FROM_TEXT, type Field } from '@/lib/levels';
import { notify } from '@/lib/mail';

export const dynamic = 'force-dynamic';

const asNum = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? Math.round(n) : null; };

/**
 * Receives one submitted Google Form response from the Elimu+ Forms script.
 * Body: { level, response_id, respondent_name, respondent_phone, cohort, routed_email, phase, answers: { "<question text>": value } }
 */
export async function POST(req: Request) {
  if (!validSecret(req.headers.get('x-forms-secret'))) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const level = Number(b.level);
  const tpl = ALL_TEMPLATES[String(level)];
  if (!tpl) return NextResponse.json({ error: 'unknown level' }, { status: 400 });

  // match question text to template keys
  const byLabel = new Map<string, Field>(tpl.fields.map((f) => [f.label.trim().toLowerCase(), f]));
  const answers: Record<string, any> = {};
  const core: Record<string, any> = {};
  for (const [label, value] of Object.entries(b.answers ?? {})) {
    const f = byLabel.get(String(label).trim().toLowerCase());
    if (!f) { answers[String(label).slice(0, 120)] = value; continue; }
    if (f.core) core[f.key] = value; else answers[f.key] = value;
  }
  const phone = normPhone(String(b.respondent_phone ?? ''));
  const respondentText = [b.respondent_name, b.respondent_phone].filter(Boolean).join(' · ').slice(0, 200);
  const rid = String(b.response_id ?? '').slice(0, 120);

  const out = await asAdmin(async (q) => {
    if (rid && (await q("select 1 from day_reports where answers->>'_response_id' = $1", [rid])).length) return { duplicate: true };
    const author = phone ? (await q('select id from people where phone = $1 or phone = $2', [phone, '+254' + phone.slice(1)]))[0]?.id ?? null : null;
    const email = String(b.routed_email ?? '').trim().toLowerCase();
    const routed = email ? (await q('select id from people where lower(email) = $1 limit 1', [email]))[0]?.id ?? null : null;
    const cm = /\[([0-9a-f]{8})\]\s*$/i.exec(String(b.cohort ?? ''));
    const cohort = cm ? (await q('select id from cohorts where id::text like $1 limit 1', [cm[1].toLowerCase() + '%']))[0]?.id ?? null : null;
    const phase = ['training', 'followup_30', 'followup_60', 'followup_90', 'other'].includes(b.phase) ? b.phase : 'training';
    const concern = CONCERN_FROM_TEXT(String(core.concern ?? ''));
    const row = (await q(
      `insert into day_reports(author_id, form_respondent, cohort_id, level, kind, phase, report_date, day_number, headcount, concern, concern_note, answers, routed_to, source)
       values ($1,$2,$3,$4,$5,$6,current_date,$7,$8,$9,$10,$11,$12,'google_form') returning id`,
      [author, author ? null : (respondentText || 'Unknown Google Form respondent'), cohort, level, tpl.kind === 'qa' ? 'qa' : 'day', phase,
       asNum(core.day_number), asNum(core.headcount), concern, core.concern_note ? String(core.concern_note).slice(0, 2000) : null,
       JSON.stringify({ ...answers, ...(rid ? { _response_id: rid } : {}) }), routed]))[0];
    return { id: row.id, matchedPerson: !!author, matchedCohort: !!cohort };
  });
  if (!(out as any).duplicate) await notify();
  return NextResponse.json({ ok: true, ...out });
}
