import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadPublicImpact } from '@/lib/public-impact';
import { CohortPage, cohortName } from '@/components/public-impact-view';

export const revalidate = 600;

export async function generateMetadata({ params }: { params: Promise<{ seq: string }> }): Promise<Metadata> {
  const { seq } = await params;
  const c = (await loadPublicImpact().catch(() => [])).find((x) => String(x.seq) === seq);
  return { title: { absolute: c ? `${cohortName(c)} | Elimu+ impact` : 'Elimu+ impact' }, robots: { index: true, follow: true } };
}

export default async function Page({ params }: { params: Promise<{ seq: string }> }) {
  const { seq } = await params;
  const c = (await loadPublicImpact().catch(() => [])).find((x) => String(x.seq) === seq);
  if (!c) notFound();
  return <CohortPage c={c} />;
}
