import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireFeature } from '@/lib/access';
import { Badge, Card, PageHeader, Table } from '@/components/ui';

const cell = (have: number, of: number) => {
  if (!of) return <span className="text-slate-400">—</span>;
  const tone = have >= of ? 'green' : have === 0 ? 'red' : 'gold';
  return <Badge tone={tone}>{have} of {of}</Badge>;
};

export default async function DataCompleteness() {
  const me = await requireFeature('data');
  const rows = await asUser(me.id, (q) => q(`
    select c.id, c.name, c.seq, c.status,
      (select count(*)::int from enrolments e where e.cohort_id = c.id and e.status <> 'dropped') enrolled,
      (select count(*)::int from enrolments e where e.cohort_id = c.id and e.status <> 'dropped' and exists (select 1 from baselines b where b.enrolment_id = e.id)) baselines,
      (select count(*)::int from enrolments e where e.cohort_id = c.id and e.status <> 'dropped' and exists (select 1 from learning_checks l where l.enrolment_id = e.id and l.stage = 'pre')) pre_checks,
      (select count(*)::int from enrolments e where e.cohort_id = c.id and e.status <> 'dropped' and exists (select 1 from learning_checks l where l.enrolment_id = e.id and l.stage = 'post')) post_checks,
      (select count(distinct m.enrolment_id)::int from outcome_measures m where m.cohort_id = c.id and m.stage = 30) f30,
      (select count(distinct m.enrolment_id)::int from outcome_measures m where m.cohort_id = c.id and m.stage = 60) f60,
      (select count(distinct m.enrolment_id)::int from outcome_measures m where m.cohort_id = c.id and m.stage = 90) f90,
      (select count(*)::int from enrolments e where e.cohort_id = c.id and e.status <> 'dropped' and e.story_consent in ('named','anonymous')) consent,
      (select count(*)::int from participant_stories s where s.cohort_id = c.id and s.status <> 'withdrawn') stories,
      (select count(*)::int from participant_certificates pc where pc.cohort_id = c.id) certs
    from cohorts c order by c.seq`));
  const tot = rows.reduce((a, r) => ({ enrolled: a.enrolled + r.enrolled, baselines: a.baselines + r.baselines, f30: a.f30 + r.f30, stories: a.stories + r.stories, consent: a.consent + r.consent }), { enrolled: 0, baselines: 0, f30: 0, stories: 0, consent: 0 });
  return (
    <>
      <PageHeader title="Data completeness" subtitle="Everything we hold for each cohort in one place, and what is still missing. Fill the gaps as the information arrives." />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Card title="People enrolled"><p className="text-2xl font-bold text-teal">{tot.enrolled}</p></Card>
        <Card title="With a starting point"><p className="text-2xl font-bold text-teal">{tot.baselines}</p><p className="text-xs text-slate-500">of {tot.enrolled}</p></Card>
        <Card title="30-day follow-ups"><p className="text-2xl font-bold text-teal">{tot.f30}</p><p className="text-xs text-slate-500">of {tot.enrolled}</p></Card>
        <Card title="Stories collected"><p className="text-2xl font-bold text-teal">{tot.stories}</p><p className="text-xs text-slate-500">permission on file for {tot.consent}</p></Card>
      </div>
      <Card title="By cohort" subtitle="Green is complete, amber is partly there, red is nothing yet.">
        <Table empty="No cohorts yet."
          head={['Cohort', 'Enrolled', 'Starting point', 'Learning check before', 'after', '30 days', '60 days', '90 days', 'Story permission', 'Stories', 'Certificates']}
          rows={rows.map((r) => [
            <Link key="n" href={`/portal/cohorts/${r.id}`} className="font-bold text-teal underline">{r.name}</Link>,
            r.enrolled, cell(r.baselines, r.enrolled), cell(r.pre_checks, r.enrolled), cell(r.post_checks, r.enrolled),
            cell(r.f30, r.enrolled), cell(r.f60, r.enrolled), cell(r.f90, r.enrolled), cell(r.consent, r.enrolled), r.stories || '—', cell(r.certs, r.enrolled)])} />
      </Card>
      <p className="mt-3 text-xs text-slate-500">Follow-up counts only include visits that are due. A 90-day gap for a cohort that has not reached day 90 is normal.</p>
    </>
  );
}
