import { redirect } from 'next/navigation';
import { requireMe } from '@/lib/session';
import { audienceOf } from '@/lib/feedback';
import { PageHeader, Card } from '@/components/ui';
import FeedbackForm from '@/components/feedback-form';
import { submitFeedback } from '../../feedback-actions';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const me = await requireMe();
  const audience = audienceOf(me);
  if (!audience) redirect('/portal');
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="How is the portal working for you?" subtitle="Five quick questions, all taps. We only ever see the combined picture of everyone who answers, never who said what." />
      <Card><FeedbackForm audience={audience} action={submitFeedback} /></Card>
    </div>
  );
}
