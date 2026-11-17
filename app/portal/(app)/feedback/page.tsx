import { redirect } from 'next/navigation';
import { getLang, requireMe } from '@/lib/session';
import { audienceOf } from '@/lib/feedback';
import { PageHeader, Card } from '@/components/ui';
import FeedbackForm from '@/components/feedback-form';
import { UI } from '@/lib/feedback-options';
import { submitFeedback } from '../../feedback-actions';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const me = await requireMe();
  const audience = audienceOf(me);
  if (!audience) redirect('/portal');
  const lang = await getLang(me);
  const u = UI[lang];
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={u.title} subtitle={u.sub} />
      <Card><FeedbackForm audience={audience} lang={lang} action={submitFeedback} /></Card>
    </div>
  );
}
