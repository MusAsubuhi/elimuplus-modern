import { redirect } from 'next/navigation';
import { getLang, requireMe } from '@/lib/session';
import { loadBook } from '@/lib/book-data';
import { bt } from '@/lib/book-text';
import { PageHeader } from '@/components/ui';
import { BookTabs } from '@/components/book-ui';
import { SetupForm } from '@/components/book-setup';
import { saveSetup } from '../../../book-actions';

export default async function BookSetup() {
  const me = await requireMe('participant');
  const lang = await getLang(me);
  const loaded = await loadBook(me.id, me.id);
  if (!loaded) redirect('/portal/book');
  return (
    <>
      <PageHeader image="/images/trainer-hero.jpg" title={bt(lang)('title')} subtitle={bt(lang)('tabSetup')} />
      <BookTabs lang={lang} active="setup" />
      <SetupForm lang={lang} loaded={loaded} action={saveSetup} />
    </>
  );
}
