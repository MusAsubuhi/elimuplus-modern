import type { Metadata } from 'next';
import { loadPublicImpact } from '@/lib/public-impact';
import { ImpactOverview } from '@/components/public-impact-view';

export const revalidate = 600;
export const metadata: Metadata = {
  title: { absolute: 'Elimu+ impact: people trained and what changed' },
  description: 'Live numbers from every Elimu+ cohort: people trained, attendance, learning gains and what happens to their businesses and incomes at 30, 60 and 90 days.',
  robots: { index: true, follow: true },
  openGraph: { title: 'Elimu+ impact, live', description: 'Numbers only, updated as each cohort is trained and followed up.', type: 'website' },
};

export default async function Page() {
  const list = await loadPublicImpact().catch(() => []);
  return <ImpactOverview list={list} />;
}
