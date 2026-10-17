import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, statusTone, submitCls } from '@/components/ui';
import { d, kes, pct } from '@/lib/format';
import { label } from '@/lib/impact';
import { recordExit } from '../../../../../actions';

const yn = (v: unknown) => (v === true ? 'Yes' : v === false ? 'No' : '—');
const t = (v: unknown) => (v == null || v === '' ? '—' : typeof v === 'string' ? label(v) : String(v));
const REASONS = ['Moved away', 'Illness or family emergency', 'Found work', 'Could not afford transport', 'Lost interest', 'Guardian withdrew consent', 'Could not be reached', 'Other'];

export default async function Participant({ params }: { params: Promise<{ id: string; eid: string }> }) {
  const me = await requireMe('facilitator', 'founder');
  const { id, eid } = await params;
  const x = await asUser(me.id, async (q) => {
    const e = (await q(`select e.*, p.display_name, p.full_name, p.phone, p.birth_year, p.gender, p.has_disability, c.name cohort_name
      from enrolments e join people p on p.id = e.person_id join cohorts c on c.id = e.cohort_id where e.id = $1 and e.cohort_id = $2`, [eid, id]))[0];
    if (!e) return null;
    const [base, learn, exit, adult, youth, att, boxes, support, welfare, sched] = await Promise.all([
      q('select * from baselines where enrolment_id = $1', [eid]),
      q('select * from learning_checks where enrolment_id = $1 order by stage desc', [eid]),
      q('select * from exit_feedback where enrolment_id = $1', [eid]),
      q('select * from followup_forms where enrolment_id = $1 order by stage, visited_on', [eid]),
      q('select * from youth_followups where enrolment_id = $1 order by stage, visited_on', [eid]),
      q('select count(*) filter (where a.present)::int present, count(*)::int total from attendance a join sessions s on s.id = a.session_id where s.cohort_id = $1 and a.enrolment_id = $2', [id, eid]),
      q('select count(distinct a.box_number)::int n from canvas_answers a join canvases cv on cv.id = a.canvas_id where cv.enrolment_id = $1', [eid]),
      q('select entry_date, item, amount_kes, funder from support_ledger where enrolment_id = $1 order by entry_date', [eid]),
      q('select category, summary, status, created_at from welfare_flags where enrolment_id = $1 order by created_at desc', [eid]),
      q('select visit, due_date, status from followup_schedule where enrolment_id = $1 order by visit', [eid]),
    ]);
    return { e, base: base[0], learn, exit: exit[0], adult, youth, att: att[0], boxes: boxes[0]?.n ?? 0, support, welfare, sched };
  });
  if (!x) notFound();
  const { e, base: b, learn, exit, adult, youth, att, boxes, support, welfare, sched } = x;
  const pre = learn.find((l) => l.stage === 'pre'), post = learn.find((l) => l.stage === 'post');
  const isYouth = b?.kind === 'youth' || (!b && e.birth_year && new Date().getFullYear() - e.birth_year < 25);
  const stages = [30, 60, 90];
  const A = (s: number) => adult.find((f) => f.stage === s);
  const row = (name: string, day0: any, f: (a: any) => any): any[] => [name, day0 ?? '—', ...stages.map((s) => (A(s) ? f(A(s)) ?? '—' : '—'))];
  return (
    <>
      <PageHeader title={e.display_name} subtitle={`${e.cohort_name} · ${e.track} track · ${e.birth_year ? `born ${e.birth_year}` : 'age not recorded'}${e.phone ? ` · ${e.phone}` : ''}`}>
        <Link href={`/portal/cohorts/${id}`} className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-teal">Back to cohort</Link>
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Status" value={<Badge tone={statusTone(e.status)}>{e.status}</Badge>} sub={e.exit_reason ? label(e.exit_reason) : undefined} />
        <Stat tone="green" label="Attendance" value={att?.total ? `${pct(att.present, att.total)}%` : '—'} sub={att?.total ? `${att.present} of ${att.total} sessions` : undefined} />
        <Stat tone="gold" label="Learning" value={pre && post ? `${Math.round(100 * pre.score / pre.out_of)}% → ${Math.round(100 * post.score / post.out_of)}%` : pre ? `${Math.round(100 * pre.score / pre.out_of)}%` : '—'} sub="Before and after the training" />
        <Stat label="Canvas" value={`${boxes}/12`} sub="boxes filled" />
      </div>

      <Card title="Consent" subtitle="Check before sharing a story or photo, or contacting a guardian.">
        <Table head={['Story', 'Photo', 'Guardian', 'Guardian consent', 'Recorded']} rows={[[t(e.story_consent), yn(e.photo_consent), e.guardian_name ? `${e.guardian_name}${e.guardian_phone ? ` (${e.guardian_phone})` : ''}` : '—', yn(e.guardian_consent), e.consented_on ? d(e.consented_on) : '—']]} />
      </Card>

      {b && !isYouth && (
        <Card title="Business and household, Day 0 to Day 90" className="mt-4">
          <Table head={['', 'Day 0', 'Day 30', 'Day 60', 'Day 90']} rows={[
            row('Status', t(b.business_stage), (a) => t(a.business_status)),
            row('Weekly sales', b.weekly_sales_range, (a) => a.sales_range),
            row('Weekly profit', b.weekly_profit_kes ? kes(b.weekly_profit_kes) : null, (a) => (a.weekly_profit_kes ? kes(a.weekly_profit_kes) : null)),
            row('Customers on a good day', b.customers_good_day, (a) => a.good_day_customers),
            row('Stock value', b.stock_value_kes ? kes(b.stock_value_kes) : null, (a) => (a.stock_value_kes ? kes(a.stock_value_kes) : null)),
            row('Keeps records', t(b.keeps_records), (a) => t(a.keeps_records)),
            row('Separates business money', t(b.separates_money), (a) => t(a.separates_money)),
            row('Pays self', t(b.pays_self), (a) => t(a.pays_self)),
            row('Sets money aside', yn(b.set_aside), (a) => yn(a.set_aside)),
            row('Skipped a meal', t(b.meal_skipped), (a) => t(a.meal_skipped)),
            row('Confidence (1 to 5)', b.confidence, (a) => a.confidence),
            row('Income compared with before', '', (a) => t(a.income_vs)),
          ]} />
          <p className="mt-3 text-xs text-slate-600">Household of {b.household_size ?? '—'}, {b.dependants ?? '—'} dependants, {b.children_in_school ?? '—'} children in school.{b.hope_words ? ` In their words: “${b.hope_words}”` : ''}</p>
        </Card>
      )}

      {b && isYouth && (
        <Card title="Starting point" className="mt-4">
          <Table head={['Situation', 'Hoped path', 'Has a CV', 'Prior work', 'Confidence']} rows={[[t(b.education_status), t(b.hoped_path), yn(b.has_cv), b.prior_work ?? '—', b.confidence ?? '—']]} />
        </Card>
      )}
      {!b && <Card title="Day 0 baseline" className="mt-4"><p className="text-sm text-slate-600">No baseline recorded yet. Submit the Day 0 baseline form for this participant to see the before-and-after here.</p></Card>}

      {youth.length > 0 && (
        <Card title="Youth follow-up" className="mt-4">
          <Table head={['Visit', 'Date', 'Situation', 'Earning', 'CV ready', 'Applications / interviews', 'Venture', 'Officer view']} rows={youth.map((y) => [
            `Day ${y.stage}`, d(y.visited_on), t(y.status), t(y.earning_range), yn(y.cv_ready), `${y.applications ?? '—'} / ${y.interviews ?? '—'}`, y.venture_started ? (y.venture_operating ? 'Operating' : 'Started') : 'No', t(y.officer_view)])} />
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Follow-up schedule"><Table head={['Visit', 'Due', 'Status']} rows={sched.map((s) => [`Day ${s.visit}`, d(s.due_date), <Badge key="s" tone={statusTone(s.status)}>{s.status}</Badge>])} empty="No visits scheduled." /></Card>
        <Card title="Exit feedback">
          {exit ? <div className="space-y-1 text-sm"><p>Rated the training {exit.rating ?? '—'}/5; confidence {exit.confidence ?? '—'}/5; would recommend: {yn(exit.recommend)}.</p>
            {exit.most_useful && <p><b>Most useful:</b> {exit.most_useful}</p>}{exit.least_useful && <p><b>Least useful:</b> {exit.least_useful}</p>}
            {exit.first_step && <p><b>First step planned:</b> {exit.first_step}</p>}{exit.concern && <p className="font-bold text-red-700">Concern raised: {exit.concern_note ?? 'see form'}</p>}</div>
            : <p className="text-sm text-slate-600">Not collected yet.</p>}
        </Card>
        <Card title="Start-up support given"><Table head={['Date', 'Item', 'Amount', 'Funder']} rows={support.map((s) => [d(s.entry_date), s.item, kes(s.amount_kes), s.funder ?? '—'])} empty="None recorded." /></Card>
        <Card title="Welfare flags"><Table head={['Raised', 'Category', 'Summary', 'Status']} rows={welfare.map((w) => [d(w.created_at), t(w.category), w.summary, <Badge key="s" tone={statusTone(w.status)}>{w.status}</Badge>])} empty="None." /></Card>
      </div>

      <Card title="Completed or left early" className="mt-4" subtitle="Give a reason when someone leaves, so partners see why and not only a number.">
        <form action={recordExit} className="grid gap-2 text-sm sm:grid-cols-4">
          <input type="hidden" name="enrolment" value={eid} /><input type="hidden" name="cohort" value={id} />
          <select name="status" defaultValue={e.status} className={inputCls}><option value="enrolled">Enrolled</option><option value="completed">Completed</option><option value="dropped">Left early</option></select>
          <select name="reason" defaultValue="" className={inputCls}><option value="">Reason (if left early)</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          <input name="date" type="date" className={inputCls} />
          <input name="note" placeholder="Note" className={inputCls} />
          <button className={submitCls}>Save</button>
        </form>
      </Card>
    </>
  );
}
