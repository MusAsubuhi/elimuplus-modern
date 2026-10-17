import { NextResponse } from 'next/server';
import { asAdmin } from '@/lib/db';
import { validSecret } from '@/lib/forms-auth';
import { normPhone } from '@/lib/accounts';
import { notify } from '@/lib/mail';
import ins from '@/lib/instruments.json';
import {
  EDU_CODE, GENDER, STORY, asNum, clean, code, cohortFromLabel, findEnrolment, insertParts, isoDate, list, longText, personByPhone, pick, rekey, yesNo, type Field,
} from '@/lib/forms-map';

export const dynamic = 'force-dynamic';

type Q = (sql: string, params?: any[]) => Promise<any[]>;
type Instrument = { common: Field[]; branch?: { label: string; options: { label: string; value: string; sections: { fields: Field[] }[] }[] } };
const INSTR = ins.instruments as unknown as Record<string, Instrument>;

const BUSINESS_STAGE: [RegExp, string][] = [[/^running/i, 'running'], [/^starting/i, 'starting'], [/idea/i, 'idea']];
const PATH: [RegExp, string][] = [[/job/i, 'employment'], [/both/i, 'both'], [/business/i, 'own_business'], [/sure/i, 'not_sure']];
const EDU_STATUS: [RegExp, string][] = [[/^in school/i, 'in_school'], [/^out of school/i, 'out_of_school'], [/college|university/i, 'in_college'], [/^working/i, 'working'], [/self/i, 'self_employed'], [/looking/i, 'looking_for_work']];
const YOUTH_STATUS: [RegExp, string][] = [[/^employed/i, 'employed'], [/casual|piece/i, 'casual_work'], [/own business/i, 'own_business'], [/intern|apprentice/i, 'internship'], [/studying/i, 'studying'], [/looking/i, 'looking_for_work'], [/nothing/i, 'none']];
const OFFICER_VIEW: [RegExp, string][] = [[/on track/i, 'on_track'], [/needs/i, 'needs_support'], [/disengaged/i, 'disengaged']];

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
    return saveYouthVisit(q, en, cohort?.id ?? en.cohort_id, Number(option!.value), A, rid, participant, pphone, officerId, officerText, b.routed_email);
  });
  if (!(out as any).duplicate && (out as any).ok) await notify();
  return NextResponse.json(out);
}

async function saveBaseline(q: Q, en: any, kind: 'adult' | 'youth', A: Record<string, any>, raw: Record<string, any>, rid: string, officerId: string | null, officerText: string | null) {
  const born = asNum(A.birth_year);
  await q(
    `update people set gender = coalesce($2, gender), birth_year = coalesce($3, birth_year), education_level = coalesce($4, education_level),
       has_disability = coalesce($5, has_disability) where id = $1`,
    [en.person_id, GENDER(A.gender), born && born > 1900 && born <= new Date().getFullYear() ? born : null, pick(A.education, EDU_CODE),
     /^yes/i.test(String(A.disability ?? '')) ? true : /^no$/i.test(String(A.disability ?? '').trim()) ? false : null]);

  const stage = pick(A.business_stage, BUSINESS_STAGE);
  await q(
    `update enrolments set partner_ref = coalesce($2, partner_ref), guardian_name = coalesce($3, guardian_name), guardian_phone = coalesce($4, guardian_phone),
       guardian_consent = coalesce($5, guardian_consent), story_consent = coalesce($6, story_consent), photo_consent = coalesce($7, photo_consent),
       consented_on = coalesce(consented_on, current_date),
       has_business_at_entry = case when $8::text is null then has_business_at_entry else $8 = 'running' end,
       track = case when $8::text is null then track when $8 = 'running' then 'standard' else 'starter' end
     where id = $1`,
    [en.id, clean(A.partner_ref, 60) || null, clean(A.guardian_name, 120) || null, normPhone(String(A.guardian_phone ?? '')) || null,
     yesNo(A.guardian_consent), STORY(A.story_consent), yesNo(A.photo_consent), kind === 'adult' ? stage : null]);

  const skills: Record<string, number> = {};
  for (const k of ['communication', 'teamwork', 'money', 'customer', 'problem']) { const n = asNum(A[`skill_${k}`]); if (n) skills[k] = n; }
  const row = insertParts({
    enrolment_id: en.id, kind, officer_id: officerId, officer_text: officerText,
    business_stage: kind === 'adult' ? stage : null, business_type: clean(A.business_type, 160) || null,
    days_open: asNum(A.a1_days_open), customers_good_day: asNum(A.a2_good_day), customers_slow_day: asNum(A.a2_slow_day),
    weekly_sales_range: clean(A.a4_sales_range, 40) || null, weekly_profit_kes: asNum(A.a4_profit), restock_range: clean(A.a4_restock_range, 40) || null,
    stock_level: code(A.a3_stock_level), stock_value_kes: asNum(A.a3_stock_value),
    keeps_records: code(A.a5_records), separates_money: code(A.a5_separate), pays_self: code(A.a5_pays_self),
    set_aside: A.a4_set_aside === 'Yes' ? true : A.a4_set_aside === 'Not enough' ? false : null, in_savings_group: yesNo(A.savings_group),
    household_size: asNum(A.household_size), dependants: asNum(A.dependants), children_in_school: asNum(A.children_in_school),
    meal_skipped: code(A.a6_meal), income_sources: list(A.income_sources),
    support_promised: longText(A.support_promised), support_promised_kes: asNum(A.support_promised_kes),
    education_status: kind === 'youth' ? pick(A.education_status, EDU_STATUS) : null, school_class: clean(A.school_class, 80) || null,
    has_cv: yesNo(A.has_cv), prior_work: longText(A.prior_work, 600), hoped_path: pick(A.hoped_path, PATH), digital_access: list(A.digital_access),
    skills_self: JSON.stringify(skills), confidence: asNum(A.confidence) && asNum(A.confidence)! >= 1 && asNum(A.confidence)! <= 5 ? asNum(A.confidence) : null,
    main_challenge: longText(A.a7_words, 600), challenge_category: code(A.a7_category), hope_words: longText(A.hope_words, 600),
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

async function saveYouthVisit(q: Q, en: any, cohortId: string, stage: number, A: Record<string, any>, rid: string, name: string, phone: string,
  officerId: string | null, officerText: string | null, routedEmail: unknown) {
  const email = String(routedEmail ?? '').trim().toLowerCase();
  const routed = email ? (await q('select id from people where lower(email) = $1 limit 1', [email]))[0]?.id ?? null : null;
  const safety = String(A.safety_concern ?? '');
  const row = insertParts({
    stage, cohort_id: cohortId, enrolment_id: en.id, officer_id: officerId, officer_text: officerText, participant_name: name, participant_phone: phone || null,
    visited_on: isoDate(A.visited_on) ?? new Date().toISOString().slice(0, 10),
    status: pick(A.status, YOUTH_STATUS), earning_range: clean(A.earning_range, 40) || null, first_income: yesNo(A.first_income), cv_ready: yesNo(A.cv_ready),
    applications: asNum(A.applications), interviews: asNum(A.interviews), venture_started: yesNo(A.venture_started), venture_operating: yesNo(A.venture_operating),
    team_project_done: yesNo(A.team_project_done), skills_used: list(A.skills_used), challenge_category: code(A.challenge_category),
    challenge_words: longText(A.challenge_words, 1000), support_needed: list(A.support_needed),
    safety_concern: /^yes/i.test(safety), officer_view: pick(A.officer_view, OFFICER_VIEW), urgent: yesNo(A.urgent) === true || /urgent/i.test(safety),
    next_step: longText(A.next_step ?? A.b_next, 400), story_consent: STORY(A.story_consent),
    answers: JSON.stringify(A), response_id: rid || null, routed_to: routed,
  });
  const saved = (await q(`insert into youth_followups(${row.cols}) values (${row.marks}) returning id`, row.values))[0];
  const sched = (await q('select id from followup_schedule where enrolment_id = $1 and visit = $2', [en.id, stage]))[0]?.id;
  if (sched) await q("update followup_schedule set status = 'done', attempts = attempts + 1 where id = $1 and status <> 'done'", [sched]);
  return { ok: true, id: saved.id, stage, updatedSchedule: !!sched };
}
