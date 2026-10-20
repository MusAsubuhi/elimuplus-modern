import Link from 'next/link';
import { asUser } from '@/lib/db';
import { getLang, requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { loadBook } from '@/lib/book-data';
import { todayNairobi } from '@/lib/book';
import { bt } from '@/lib/book-text';
import { Card, PageHeader } from '@/components/ui';
import { BookHub } from '@/components/book-hub';

/** What a trainer or founder sees of a book its owner has chosen to share. Read only; the row rules decide whether anything comes back at all. */
export default async function BookView({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const me = await requireMe('facilitator', 'master', 'founder');
  const lang = await getLang(me);
  const t = bt(lang);
  const sp = await searchParams;
  const person = sp.person && /^[0-9a-f-]{36}$/.test(sp.person) ? sp.person : '';
  if (!person) return <Card title={t('title')}>{t('notShared')}</Card>;
  const who = await asUser(me.id, async (q) => (await q('select display_name from people where id=$1', [person]))[0]?.display_name ?? null);
  const loaded = await loadBook(me.id, person);
  if (loaded && me.roles.includes('founder')) await audit(me.id, 'read business book', 'business_books');
  return (
    <>
      <PageHeader image="/images/trainer-hero.jpg" title={`${t('title')}${who ? `: ${who}` : ''}`} subtitle={loaded ? t('viewingOther') : undefined}>
        <Link href="/portal/cohorts" className="rounded-lg border border-white/50 px-4 py-2 text-sm font-bold text-white">← {lang === 'sw' ? 'Nyuma' : 'Back'}</Link>
      </PageHeader>
      {loaded ? <BookHub lang={lang} loaded={loaded} asOf={todayNairobi()} readOnly /> : <Card title={t('notShared')}>{t('notSharedBody')}</Card>}
    </>
  );
}
