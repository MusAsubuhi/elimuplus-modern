import { NextResponse } from 'next/server';
import { asAdmin } from '@/lib/db';
import { validSecret } from '@/lib/forms-auth';
import { normPhone } from '@/lib/accounts';
import { notify } from '@/lib/mail';
import ins from '@/lib/instruments.json';
import {
  PAYS_SELF, SEPARATES, asNum, clean, code, cohortFromLabel, findEnrolment, insertParts, isoDate, list, longText, personByPhone, pick, profitKes, rekey, ticked, yesNo, type Field,
} from '@/lib/forms-map';

export const dynamic = 'force-dynamic';

type Q = (sql: string, params?: any[]) => Promise<any[]>;
type Instrument = { common: Field[]; branch?: { label: string; options: { label: string; value: string; sections: { fields: Field[] }[] }[] } };
const INSTR = ins.instruments as unknown as Record<string, Instrument>;

const PATH: [RegExp, string][] = [[/job/i, 'employment'], [/both/i, 'both'], [/business/i, 'own_business'], [/study/i, 'study'], [/sure/i, 'not_sure']];
const EDU_STATUS: [RegExp, string][] = [[/^in school/i, 'in_school'], [/^out of school/i, 'out_of_school'], [/small business/i, 'self_employed'], [/casual|job/i, 'working']];
const YOUTH_STATUS: [RegExp, string][] = [[/^employed/i, 'employed'], [/^self/i, 'own_business'], [/casual|piece/i, 'casual_work'], [/studying/i, 'studying'], [/looking/i, 'looking_for_work']];
const OFFICER_VIEW: [RegExp, string][] = [[/on track/i, 'on_track'], [/stuck|needs/i, 'needs_support'], [/lost|disengaged/i, 'disengaged']];

/**
 * Receives one submitted Day 0 baseline, learning check, end-of-training feedback or youth follow-up from the Elimu+ Forms script.
 * Body: { instrument, branch, response_id, officer_name, officer_phone, participant_name, participant_phone, cohort, answers: { "<question text>": value } }
 * Answers with { ok: false, rejected } for data it cannot use, so the script reports it instead of retrying forever.
 */
export async function POST(req: Request) {
  if (!validSecret(req.headers.get('x-forms-secret'))) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const key = String(b.instrument ?? '');
  const inst = INSTR[key];
  if (!inst) return NextResponse.json({ error: 'unknown instrument' }, { status: 400 });

  // Which questions this response could have answered: the shared ones plus the pages of the chosen branch.
  let option: { value: string; sections: { fields: Field[] }[] } | undefined;
  if (inst.branch) {
    option = inst.branch.options.find((o) => o.label.trim().toLowerCase() === String(b.branch ?? '').trim().toLowerCase());
    if (!option) return NextResponse.json({ ok: false, rejected: `The form did not say which group or visit this was (${clean(b.branch, 60) || 'blank'}).` });
  }
  const fields: Field[] = [...inst.common, ...(option ? option.sections.flatMap((s) => s.fields) : [])];
  const A = rekey(fields, b.answers ?? {});
  const rid = clean(b.response_id, 120);
  const participant = clean(b.participant_name, 120);
  const pphone = normPhone(String(b.participant_phone ?? ''));
  if (!participant) return NextResponse.json({ ok: false, rejected: 'Participant name missing.' });

  const out = await asAdmin(async (q: Q) => {
    const table = { baseline: 'baselines', learning: 'learning_checks', exit: 'exit_feedback', youth_followup: 'youth_followups' }[key]!;
    if (rid && (await q(`select 1 from ${table} where response_id = $1`, [rid])).length) return { ok: true, duplicate: true };
    const cohort = await cohortFromLabel(q, b.cohort);
    const en = await findEnrolment(q, pphone, cohort?.id ?? null);
    if (!en) {
      return { ok: false, rejected: `${participant}${pphone ? ` (${pphone})` : ''} is not registered in the portal, so this ${key.replace('_', ' ')} could not be linked. Register them first, then submit again.` };
    }
    const ophone = normPhone(String(b.officer_phone ?? ''));
    const officerId = await personByPhone(q, ophone);
    const officerText = officerId ? null : [b.officer_name, b.officer_phone].filter(Boolean).join(' · ').slice(0, 200) || null;

    if (key === 'baseline') return saveBaseline(q, en, option!.value as 'adult' | 'youth', A, A, rid, officerId, officerText);
    if (key === 'learning') return saveLearning(q, en, fields, A, rid);
    if (key === 'exit') return saveExit(q, en, A, rid, participant);
    return saveYouthVisit(q, en, cohort?.id ?? en.cohort_id, Number(option!.value), fields, A, rid, participant, pphone, officerId, officerText, b.routed_email);
  });
  if (!(out as any).duplicate && (out as any).ok) await notify();
  return NextResponse.json(out);
}

async function saveBaseline(q: Q, en: any, kind: 'adult' | 'youth', A: Record<string, any>, raw: Record<string, any>, rid: string, officerId: string | null, officerText: string | null) {
  // Who they are (name, phone, age, gender, guardian) comes from the roster, so this form only records where the person starts.
  // A business not started yet is an idea; one that has stopped trading is starting again; anything else is running.
  const stage = kind !== 'adult' ? null : /^not started/i.test(String(A.business_stage ?? '')) ? 'idea' : String(A.business_stage ?? '') ? (String(A.a1_operating ?? '') === 'No' ? 'starting' : 'running') : null;
  if (stage) {
    await q(
      `update enrolments set has_business_at_entry = ($2 = 'running'), track = case when $2 = 'running' then 'standard' else 'starter' end where id = $1`,
      [en.id, stage]);
  }
  const conf = asNum(A.confidence);
  const row = insertParts({
    enrolment_id: en.id, kind, officer_id: officerId, officer_text: officerText,
    business_stage: stage, business_type: clean(A.business_type, 160) || null,
    // The profit band (adults) or the 30-day earnings band (youth) is kept in the same column the follow-ups use, so Day 0 and later visits compare directly.
    weekly_sales_range: clean(kind === 'adult' ? A.a4_profit_band : A.earning_range, 40) || null,
    weekly_profit_kes: kind === 'adult' ? profitKes(A.a4_profit, A.a4_profit_band) : null,
    stock_level: code(A.a3_stock_level), stock_value_kes: asNum(A.a3_stock_value),
    keeps_records: code(A.a5_records), separates_money: SEPARATES(A.a5_separate), pays_self: PAYS_SELF(A.a5_pays_self),
    education_status: kind === 'youth' ? pick(A.education_status, EDU_STATUS) : null,
    has_cv: yesNo(A.has_cv), prior_work: clean(A.prior_work, 100) || null, hoped_path: pick(A.hoped_path, PATH),
    confidence: conf && conf >= 1 && conf <= 5 ? conf : null,
    challenge_category: code(A.a7_category),
    answers: JSON.stringify(raw), response_id: rid || null,
  });
  await q(
    `insert into baselines(${row.cols}) values (${row.marks})
     on conflict (enrolment_id) do update set ${row.update(['enrolment_id'])}, captured_on = current_date`, row.values);
  return { ok: true, kind, enrolmentId: en.id };
}

async function saveLearning(q: Q, en: any, fields: Field[], A: Record<string, any>, rid: string) {
  const scored = fields.filter((f) => f.correct);
  const score = scored.filter((f) => String(A[f.key] ?? '').trim() === f.correct).length;
  const stage = /^end/i.test(String(A.stage ?? '').trim()) ? 'post' : 'pre';
  const conf = asNum(A.confidence);
  await q(
    `insert into learning_checks(enrolment_id, stage, score, out_of, confidence, answers, response_id) values ($1,$2,$3,$4,$5,$6::jsonb,$7)
     on conflict (enrolment_id, stage) do update set score = excluded.score, out_of = excluded.out_of, confidence = excluded.confidence,
       answers = excluded.answers, response_id = excluded.response_id, taken_on = current_date`,
    [en.id, stage, score, scored.length, conf && conf >= 1 && conf <= 5 ? conf : null, JSON.stringify(A), rid || null]);
  return { ok: true, stage, score, outOf: scored.length };
}

async function saveExit(q: Q, en: any, A: Record<string, any>, rid: string, name: string) {
  const bound = (v: unknown) => { const n = asNum(v); return n && n >= 1 && n <= 5 ? n : null; };
  const concern = yesNo(A.concern) === true;
  const row = (await q(
    `insert into exit_feedback(enrolment_id, rating, confidence, recommend, most_useful, least_useful, change_suggestion, first_step, support_needed,
       concern, concern_note, answers, response_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
     on conflict (enrolment_id) do update set rating = excluded.rating, confidence = excluded.confidence, recommend = excluded.recommend,
       most_useful = excluded.most_useful, least_useful = excluded.least_useful, change_suggestion = excluded.change_suggestion, first_step = excluded.first_step,
       support_needed = excluded.support_needed, concern = excluded.concern, concern_note = excluded.concern_note, answers = excluded.answers,
       response_id = excluded.response_id, given_on = current_date returning id`,
    [en.id, bound(A.rating), bound(A.confidence), yesNo(A.recommend), clean(A.most_useful, 200) || null, clean(A.least_useful, 200) || null,
     longText(A.change_suggestion, 800), longText(A.first_step, 800), list(A.support_needed), concern, longText(A.concern_note, 800), JSON.stringify(A), rid || null]))[0];
  if (concern) {
    await q(`select app.raise_alert('exit_feedback', 'attention', $1, $2, $3, 'exit_feedback', $4)`,
      [`${name} raised a concern at the end of training`, longText(A.concern_note, 300) ?? 'No detail given. Ask the trainer to follow up privately.', `/portal/cohorts/${en.cohort_id}`, row.id]);
  }
  return { ok: true, concern };
}

async function saveYouthVisit(q: Q, en: any, cohortId: string, stage: number, fields: Field[], A: Record<string, any>, rid: string, name: string, phone: string,
  officerId: string | null, officerText: string | null, routedEmail: unknown) {
  const email = String(routedEmail ?? '').trim().toLowerCase();
  const routed = email ? (await q('select id from people where lower(email) = $1 limit 1', [email]))[0]?.id ?? null : null;
  const opts = (key: string) => (fields.find((f) => f.key === key) as any)?.options ?? [];
  const since = ticked(A.since_training, opts('since_training'));
  const has = (re: RegExp) => since.some((x) => re.test(x));
  // Challenges are listed most serious first and Google returns ticks in that order, so the first tick is the one counted in the charts.
  const challenges = ticked(A.challenges, opts('challenges')).filter((x) => !/^none/i.test(x));
  const risks = ticked(A.risks, opts('risks'));
  const safety = risks.some((x) => /safety|welfare/i.test(x));
  const band = clean(A.earning_range, 40) || null;
  const nextStep = [A.next_step, A.next_who ? `(${A.next_who})` : '', A.next_date ? `by ${A.next_date}` : ''].filter(Boolean).join(' ');
  const row = insertParts({
    stage, cohort_id: cohortId, enrolment_id: en.id, officer_id: officerId, officer_text: officerText, participant_name: name, participant_phone: phone || null,
    visited_on: isoDate(A.visited_on) ?? new Date().toISOString().slice(0, 10),
    status: pick(A.status, YOUTH_STATUS), earning_range: band, first_income: band ? !/^nothing/i.test(band) : null,
    cv_ready: has(/CV/i) || /^yes/i.test(String(A.cv_status ?? '')) ? true : A.cv_status ? false : null,
    // Ticks count people, so one tick is one applicant, one interview and so on.
    applications: has(/^Applied/i) ? 1 : 0, interviews: has(/interview/i) ? 1 : 0, venture_started: has(/^Started/i),
    skills_used: [], challenge_category: code(challenges[0]), challenge_words: challenges.join(', ') || null,
    support_needed: list(A.support_needed).length ? ticked(A.support_needed, opts('support_needed')) : [],
    safety_concern: safety, officer_view: pick(A.officer_view, OFFICER_VIEW), urgent: safety,
    next_step: longText(nextStep, 400),
    answers: JSON.stringify(A), response_id: rid || null, routed_to: routed,
  });
  const saved = (await q(`insert into youth_followups(${row.cols}) values (${row.marks}) returning id`, row.values))[0];
  const sched = (await q('select id from followup_schedule where enrolment_id = $1 and visit = $2', [en.id, stage]))[0]?.id;
  if (sched) await q("update followup_schedule set status = 'done', attempts = attempts + 1 where id = $1 and status <> 'done'", [sched]);
  return { ok: true, id: saved.id, stage, urgent: safety, updatedSchedule: !!sched };
}
