import { getLang, requireMe } from '@/lib/session';
import { loadBook } from '@/lib/book-data';
import { todayNairobi } from '@/lib/book';
import { bt } from '@/lib/book-text';
import { Card, PageHeader } from '@/components/ui';
import { BookTabs } from '@/components/book-ui';
import { BookHub } from '@/components/book-hub';
import { SetupForm } from '@/components/book-setup';
import { startBook } from '../../book-actions';

export default async function BookHome() {
  const me = await requireMe('participant');
  const lang = await getLang(me);
  const t = bt(lang);
  const loaded = await loadBook(me.id, me.id);
  return (
    <>
      <PageHeader image="/images/trainer-hero.jpg" title={t('title')} subtitle={t('intro')} />
      {loaded ? (
        <>
          <BookTabs lang={lang} active="today" />
          <BookHub lang={lang} loaded={loaded} asOf={todayNairobi()} />
          <p className="mt-5 text-xs text-slate-500">{t('privacyNote')}</p>
        </>
      ) : (
        <>
          <Card title={t('notYetBook')}>{t('noBookBody')}</Card>
          <div className="mt-5"><SetupForm lang={lang} loaded={null} action={startBook} /></div>
        </>
      )}
    </>
  );
}
