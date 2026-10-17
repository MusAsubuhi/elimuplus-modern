import { asUser } from '@/lib/db';
import { getLang, requireMe } from '@/lib/session';
import { answerMap, participantContext } from '@/lib/data';
import { t } from '@/lib/i18n';
import PrintButton from '@/components/print-button';

// Two-page A4 bilingual SEE Canvas. Page 1: boxes 1-7. Page 2: boxes 8-12 plus a footer.
export default async function PrintCanvas() {
  const me = await requireMe('participant', 'founder');
  const lang = await getLang(me);
  const ctx = await asUser(me.id, (q) => participantContext(q, me.id));
  if (!ctx) return null;
  const am = answerMap(ctx.answers);
  const boxCell = (n: number) => {
    const box = ctx.boxes.find((b) => b.number === n)!;
    const qs: { key: string; en: string; sw: string }[] = box.questions;
    return (
      <div key={n} className="rounded-md border border-teal p-3" style={{ breakInside: 'avoid' }}>
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-black text-teal">{n}. {box.name_en}</div>
          <div className="sw text-xs">{box.name_sw}</div>
        </div>
        <div className="mt-1.5 space-y-1.5 text-[12px] leading-snug">
          {qs.map((qq) => {
            const a = am.get(`${n}:${qq.key}`);
            return (
              <div key={qq.key}>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{qq.en} <span className="sw normal-case">· {qq.sw}</span></div>
                <div className="min-h-[1.4em] border-b border-dotted border-slate-300">{a?.answer ?? ''}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  const Head = ({ page }: { page: number }) => (
    <div className="mb-3 flex items-end justify-between border-b-4 border-gold pb-2">
      <div><div className="text-xl font-black text-teal">SEE Canvas <span className="sw text-sm font-normal">Turubai la SEE</span></div>
        <div className="text-xs text-slate-600">{me.displayName} · {ctx.en.cohort_name}</div></div>
      <div className="text-right text-xs text-slate-500">Elimu+ · {page}/2</div>
    </div>
  );
  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
        <span className="text-sm text-slate-600">{t(lang, 'printHint')}</span><PrintButton label={t(lang, 'print')} />
      </div>
      <div className="mx-auto max-w-[210mm] bg-[#F5FAF8] p-5 print:p-0">
        <section className="print-page"><Head page={1} />
          <div className="grid grid-cols-2 gap-3">{[1, 2, 3, 4, 5, 6, 7].map(boxCell)}</div></section>
        <section><Head page={2} />
          <div className="grid grid-cols-2 gap-3">{[8, 9, 10, 11, 12].map(boxCell)}
            <div className="rounded-md bg-teal p-3 text-white"><div className="text-sm font-black text-gold">Start. Start small. Start to finish.</div>
              <div className="sw mt-1 text-xs !text-gold">Anza. Anza kidogo. Anza hadi mwisho.</div>
              <div className="mt-3 text-[11px] text-teal-100">elimuplus.com</div></div></div></section>
      </div>
    </div>
  );
}
