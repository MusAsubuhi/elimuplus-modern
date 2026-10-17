import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { loadImpact } from '@/lib/impact';
import { Outcomes } from '@/components/outcomes';
import { PageHeader } from '@/components/ui';
import { d } from '@/lib/format';

export default async function CohortOutcomes({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe('facilitator', 'founder', 'master');
  const { id } = await params;
  const [c] = await asUser(me.id, (q) => loadImpact(q, id));
  if (!c) notFound();
  return (
    <>
      <PageHeader title={`${c.name}: outcomes`} subtitle={`${c.org} · ${d(c.start)} to ${d(c.end)}. Totals only; individual stories sit on each participant's profile.`}>
        <Link href={`/portal/cohorts/${id}`} className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-teal">Back to cohort</Link>
      </PageHeader>
      <Outcomes m={c.m} />
    </>
  );
}
