import { NextResponse } from 'next/server';
import { asAdmin } from '@/lib/db';
import { validSecret } from '@/lib/forms-auth';
import { normPhone } from '@/lib/accounts';
import { notify } from '@/lib/mail';
import tpl from '@/lib/followup-template.json';
import { INCOME_VS, PAYS_SELF, SEPARATES, code, longText, profitKes, ticked, yesNo } from '@/lib/forms-map';

export const dynamic = 'force-dynamic';

type F = { key: string; label: string; options?: string[] };
const asNum = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? Math.round(n) : null; };
const STATUS: Record<string, string> = { Growing: 'growing', Stable: 'stable', Struggling: 'struggling', Closed: 'closed' };
const INCOME_SHORT: Record<string, string> = { higher: 'higher', about_the_same: 'same', lower: 'lower' };
const SUPPORT_USED: Record<string, string> = { Fully: 'yes', Partly: 'partly', 'Not yet': 'no' };

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
    const A = answers;
    const opts = (key: string) => fields.find((f) => f.key === key)?.options ?? [];
    // Challenges are listed most serious first and Google returns ticks in that order, so the first tick is the one counted in the charts.
    const challenges = ticked(A.a7_challenges, opts('a7_challenges')).filter((x) => !/^none/i.test(x));
    const risks = ticked(A.a7_risk, opts('a7_risk'));
    const safety = risks.includes('Personal safety concern');
    const status = STATUS[String(A.c_status ?? '')] ?? null;
    const operating = A.a1_operating ? A.a1_operating !== 'No' : null;
    const incomeVs = INCOME_VS(A.a4_compare);
    const nextStep = [A.c_next, A.c_next_who ? `(${A.c_next_who})` : '', A.c_next_date ? `by ${A.c_next_date}` : ''].filter(Boolean).join(' ');
    const typed = {
      sold_14_days: operating, weekly_profit_kes: profitKes(A.a4_profit, A.a4_profit_band), income_vs: incomeVs,
      keeps_records: code(A.a5_records), separates_money: SEPARATES(A.a5_separate), pays_self: PAYS_SELF(A.a5_pays_self),
      used_calc: yesNo(A.a5_used_calc), confidence: asNum(A.a7_confidence),
      challenge_category: code(challenges[0]), challenge_words: challenges.join(', ') || null,
      support_used: SUPPORT_USED[String(A.b1_received ?? '')] ?? null, next_step: longText(nextStep, 300),
    };
    const base = {
      stage, cohort_id: cohort, enrolment_id: enrolment, officer_id: officer, officer_text: officer ? null : (officerText || 'Unknown Google Form respondent'),
      participant_name: participant, participant_phone: pphone || null, visited_on: visited ?? new Date().toISOString().slice(0, 10),
      business_status: status, urgent: safety, operating, sales_range: A.a4_profit_band ?? null, stock_value_kes: asNum(A.a3_stock_value),
      answers: JSON.stringify({ ...answers, a7_words: challenges.join(', '), ...(rid ? { _response_id: rid } : {}) }), response_id: rid || null, routed_to: routed,
      ...typed,
    };
    const cols = Object.keys(base);
    const row = (await q(
      `insert into followup_forms(${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
      cols.map((c) => (base as Record<string, unknown>)[c])))[0];

    let linked = false;
    if (enrolment) {
      const sched = (await q('select id from followup_schedule where enrolment_id = $1 and visit = $2', [enrolment, stage]))[0]?.id;
      if (sched) {
        await q("select set_config('app.skip_alert', '1', true)");
        await q(
          `insert into followup_visits(schedule_id, visited_on, still_operating, sold_within_14_days, income_direction, weekly_sales_range, stock_cash_value_kes,
             knows_breakeven, tracks_key_metric, used_calc_for_decision, confidence, challenges, notes, officer_id)
           values ($1, coalesce($2::date, current_date), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           on conflict (schedule_id) do update set visited_on = excluded.visited_on, still_operating = excluded.still_operating,
             sold_within_14_days = excluded.sold_within_14_days, income_direction = excluded.income_direction, weekly_sales_range = excluded.weekly_sales_range,
             stock_cash_value_kes = excluded.stock_cash_value_kes, knows_breakeven = excluded.knows_breakeven, tracks_key_metric = excluded.tracks_key_metric,
             used_calc_for_decision = excluded.used_calc_for_decision, confidence = excluded.confidence, challenges = excluded.challenges, notes = excluded.notes`,
          [sched, visited, operating, operating, INCOME_SHORT[String(incomeVs)] ?? null, A.a4_profit_band ?? null, asNum(A.a3_stock_value),
           null, null, typed.used_calc, typed.confidence && typed.confidence >= 1 && typed.confidence <= 5 ? typed.confidence : null,
           challenges.map((c) => code(c)).filter(Boolean), String(A.c_impact ?? '').slice(0, 2000) || null, officer]);
        await q("update followup_schedule set status = 'done', attempts = attempts + 1 where id = $1 and status <> 'done'", [sched]);
        linked = true;
      }
    }
    return { id: row.id, urgent: safety, matchedParticipant: !!enrolment, matchedCohort: !!cohort, updatedStandardRecord: linked };
  });
  if (!(out as any).duplicate) await notify();
  return NextResponse.json({ ok: true, ...out });
}
