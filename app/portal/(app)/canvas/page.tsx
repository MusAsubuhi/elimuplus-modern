import Link from 'next/link';
import { asUser } from '@/lib/db';
import { getLang, requireMe } from '@/lib/session';
import { answerMap, participantContext, PHASES } from '@/lib/data';
import { t, phaseKey } from '@/lib/i18n';
import { Badge, Card, PageHeader, inputCls, submitCls } from '@/components/ui';
import { saveCanvas, submitCanvas } from '../../actions';

export default async function CanvasBuilder({ searchParams }: { searchParams: Promise<{ phase?: string }> }) {
  const me = await requireMe('participant', 'founder');
  const lang = await getLang(me);
  const { phase } = await searchParams;
  const ctx = await asUser(me.id, (q) => participantContext(q, me.id));
  if (!ctx || !ctx.canvas) return <Card title="No canvas yet">{me.roles.includes('founder') ? <>Start the participant journey to get your canvas. <Link href="/portal/journey" className="font-bold text-teal underline">Start it here</Link>.</> : 'Your canvas is created when you are enrolled in a cohort.'}</Card>;
  const { boxes, unlocked, answers, canvas, filled } = ctx;
  const am = answerMap(answers);
  const active = Number(phase) || (PHASES.find((p) => p.boxes.some((b) => unlocked.has(b) && !filled.has(b)))?.n ?? 1);
  const P = PHASES.find((p) => p.n === active)!;
  const L = lang === 'sw' ? 'sw' : 'en';
  return (
    <>
      <PageHeader image="/images/programme-canvas-hero.jpg" title={t(lang, 'myCanvas')}
        subtitle={lang === 'sw' ? 'Jibu swali moja kwa wakati. Visanduku vinafunguliwa kadri tunavyofundisha darasani.' : 'Answer one question at a time. Boxes open as we teach them in class.'}>
        <Link href="/portal/canvas/print" className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-teal">{t(lang, 'print')}</Link>
      </PageHeader>

      <div className="no-print mb-5 flex flex-wrap gap-2">
        {PHASES.map((p) => (
          <Link key={p.n} href={`/portal/canvas?phase=${p.n}`}
            className={`rounded-full px-4 py-1.5 text-sm font-bold ${p.n === active ? 'bg-teal text-white' : 'border border-teal-100 bg-white text-teal'}`}>
            {p.n}. {t(lang, phaseKey(p.n))}
          </Link>
        ))}
      </div>

      <div className="space-y-5">
        {P.boxes.map((b) => {
          const box = boxes.find((x) => x.number === b)!;
          const open = unlocked.has(b);
          const qs: { key: string; en: string; sw: string }[] = box.questions;
          return (
            <Card key={b} title={`${b}. ${lang === 'sw' ? box.name_sw : box.name_en}`}
              subtitle={lang === 'sw' ? box.name_en : box.name_sw}
              action={filled.has(b) ? <Badge tone="green">{t(lang, 'done')}</Badge> : open ? <Badge tone="gold">{t(lang, 'open')}</Badge> : <Badge>🔒 {t(lang, 'locked')}</Badge>}>
              <div id={`box-${b}`} />
              {open ? (
                <form action={saveCanvas} className="space-y-4">
                  <input type="hidden" name="canvas" value={canvas.id} /><input type="hidden" name="box" value={b} />
                  <input type="hidden" name="lang" value={lang} /><input type="hidden" name="back" value={`/portal/canvas?phase=${active}`} />
                  {qs.map((qq) => {
                    const a = am.get(`${b}:${qq.key}`);
                    return (
                      <label key={qq.key} className="block">
                        <span className="mb-1 block text-sm font-bold text-ink">{qq[L]}</span>
                        <textarea name={`q_${qq.key}`} defaultValue={a?.answer ?? ''} rows={3} className={inputCls} placeholder={t(lang, 'yourAnswer')} />
                        {a?.assisted && <span className="mt-1 inline-block"><Badge tone="blue">{t(lang, 'assisted')}</Badge></span>}
                      </label>
                    );
                  })}
                  <button className={submitCls}>{t(lang, 'save')}</button>
                </form>
              ) : (
                <ul className="list-disc pl-5 text-sm text-slate-400">{qs.map((qq) => <li key={qq.key}>{qq[L]}</li>)}</ul>
              )}
            </Card>
          );
        })}
      </div>

      {canvas.status === 'draft' && filled.size >= 3 && (
        <form action={submitCanvas} className="no-print mt-6">
          <input type="hidden" name="canvas" value={canvas.id} />
          <button className="rounded-lg bg-gold px-5 py-2.5 font-bold text-teal">{lang === 'sw' ? 'Wasilisha turubai kwa mkufunzi' : 'Submit canvas to my trainer'}</button>
        </form>
      )}
    </>
  );
}
