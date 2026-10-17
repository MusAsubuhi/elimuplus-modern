import { NextResponse } from 'next/server';
import { asAdmin } from '@/lib/db';
import { validSecret } from '@/lib/forms-auth';
import { normPhone } from '@/lib/accounts';
import { notify } from '@/lib/mail';
import tpl from '@/lib/followup-template.json';

export const dynamic = 'force-dynamic';

type F = { key: string; label: string };
const asNum = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? Math.round(n) : null; };
const STATUS: Record<string, string> = { Growing: 'growing', Stable: 'stable', Struggling: 'struggling', Closed: 'closed' };
const INCOME: Record<string, string> = { Higher: 'higher', 'About the same': 'same', Lower: 'lower' };

/**
 * Receives one submitted Day 30/60/90 follow-up from the Elimu+ Forms script.
 * Body: { stage, response_id, officer_name, officer_phone, participant_name, participant_phone, cohort, routed_email, answers: { "<question text>": value } }
 */
export async function POST(req: Request) {
  if (!validSecret(req.headers.get('x-forms-secret'))) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const stage = Number(b.stage);
  const st = (tpl.stages as Record<string, any>)[String(stage)];
  if (!st) return NextResponse.json({ error: 'unknown stage' }, { status: 400 });
  const participant = String(b.participant_name ?? '').trim().slice(0, 120);
  if (!participant) return NextResponse.json({ error: 'participant name missing' }, { status: 400 });

  const fields: F[] = [...tpl.identity, ...st.a, ...st.b, ...st.c];
  const byLabel = new Map<string, F>(fields.map((f) => [f.label.trim().toLowerCase(), f]));
  const answers: Record<string, any> = {};
  for (const [label, value] of Object.entries(b.answers ?? {})) {
    const f = byLabel.get(String(label).trim().toLowerCase());
    answers[f ? f.key : String(label).slice(0, 120)] = value;
  }
  const rid = String(b.response_id ?? '').slice(0, 120);
  const pphone = normPhone(String(b.participant_phone ?? ''));
  const ophone = normPhone(String(b.officer_phone ?? ''));
  const officerText = [b.officer_name, b.officer_phone].filter(Boolean).join(' · ').slice(0, 200);
  const visited = /^\d{4}-\d{2}-\d{2}$/.test(String(answers.visited_on ?? '')) ? answers.visited_on : null;

  const out = await asAdmin(async (q) => {
    if (rid && (await q('select 1 from followup_forms where response_id = $1', [rid])).length) return { duplicate: true };
    const officer = ophone ? (await q('select id from people where phone = $1 or phone = $2', [ophone, '+254' + ophone.slice(1)]))[0]?.id ?? null : null;
    const email = String(b.routed_email ?? '').trim().toLowerCase();
    const routed = email ? (await q('select id from people where lower(email) = $1 limit 1', [email]))[0]?.id ?? null : null;
    const cm = /\[([0-9a-f]{8})\]\s*$/i.exec(String(b.cohort ?? ''));
    const cohort = cm ? (await q('select id from cohorts where id::text like $1 limit 1', [cm[1].toLowerCase() + '%']))[0]?.id ?? null : null;

    // Match the participant to an enrolment (same cohort first) so the standard follow-up record is filled too.
    let enrolment: string | null = null;
    if (pphone) {
      const rows = await q(
        `select e.id, e.cohort_id from enrolments e join people p on p.id = e.person_id
         where (p.phone = $1 or p.phone = $2) order by (e.cohort_id = $3) desc nulls last, e.id limit 1`,
        [pphone, '+254' + pphone.slice(1), cohort]);
      enrolment = rows[0]?.id ?? null;
    }
    const status = STATUS[String(answers.c_status ?? '')] ?? null;
    const operating = answers.a1_operating ? answers.a1_operating !== 'Closed' : null;
    const row = (await q(
      `insert into followup_forms(stage, cohort_id, enrolment_id, officer_id, officer_text, participant_name, participant_phone, visited_on,
         business_status, urgent, operating, sales_range, stock_value_kes, answers, response_id, routed_to)
       values ($1,$2,$3,$4,$5,$6,$7,coalesce($8::date, current_date),$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
      [stage, cohort, enrolment, officer, officer ? null : (officerText || 'Unknown Google Form respondent'), participant, pphone || null, visited,
       status, answers.c_urgent === 'Yes', operating, answers.a4_sales_range ?? null, asNum(answers.a3_stock_value),
       JSON.stringify({ ...answers, ...(rid ? { _response_id: rid } : {}) }), rid || null, routed]))[0];

    let linked = false;
    if (enrolment) {
      const sched = (await q('select id from followup_schedule where enrolment_id = $1 and visit = $2', [enrolment, stage]))[0]?.id;
      if (sched) {
        await q("select set_config('app.skip_alert', '1', true)");
        await q(
          `insert into followup_visits(schedule_id, visited_on, still_operating, income_direction, weekly_sales_range, stock_cash_value_kes, challenges, notes, officer_id)
           values ($1, coalesce($2::date, current_date), $3, $4, $5, $6, $7, $8, $9)
           on conflict (schedule_id) do update set visited_on = excluded.visited_on, still_operating = excluded.still_operating,
             income_direction = excluded.income_direction, weekly_sales_range = excluded.weekly_sales_range,
             stock_cash_value_kes = excluded.stock_cash_value_kes, challenges = excluded.challenges, notes = excluded.notes`,
          [sched, visited, operating, INCOME[String(answers.a4_compare ?? '')] ?? null, answers.a4_sales_range ?? null, asNum(answers.a3_stock_value),
           answers.a7_category ? [String(answers.a7_category)] : [], String(answers.a7_words ?? '').slice(0, 2000) || null, officer]);
        await q("update followup_schedule set status = 'done', attempts = attempts + 1 where id = $1 and status <> 'done'", [sched]);
        linked = true;
      }
    }
    return { id: row.id, matchedParticipant: !!enrolment, matchedCohort: !!cohort, updatedStandardRecord: linked };
  });
  if (!(out as any).duplicate) await notify();
  return NextResponse.json({ ok: true, ...out });
}
