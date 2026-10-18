import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asAdmin } from '@/lib/db';
import { FEEDBACK_SCALES, FEEDBACK_TEXT } from '@/lib/seminar';
import { submitFeedback } from '../../actions';
import { Shell, inputCls, labelCls, submitCls, whenOf } from '../../shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Seminar feedback | Elimu+', robots: { index: false } };

export default async function Feedback({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const sem = (await asAdmin((q) => q('select title, held_on, venue from seminars where code = $1', [code])))[0];
  if (!sem) notFound();
  return (
    <Shell title={`Feedback: ${sem.title}`} when={whenOf(sem)}>
      <form action={submitFeedback} className="space-y-5">
        <input type="hidden" name="code" value={code} />
        <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        {FEEDBACK_SCALES.map((sc) => (
          <fieldset key={sc.key}>
            <legend className={labelCls}>{sc.label}</legend>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="flex-1 cursor-pointer rounded-lg border border-teal-100 px-2 py-2 text-center text-sm has-[:checked]:border-teal has-[:checked]:bg-teal has-[:checked]:text-white">
                  <input type="radio" name={sc.key} value={n} required className="sr-only" />{n}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">1 is not at all, 5 is very much.</p>
          </fieldset>
        ))}
        {FEEDBACK_TEXT.map((t) => (
          <div key={t.key}><label className={labelCls} htmlFor={t.key}>{t.label}</label><textarea id={t.key} name={t.key} rows={3} className={inputCls} /></div>
        ))}
        <fieldset>
          <legend className={labelCls}>Would you come to another Elimu+ seminar?</legend>
          {[['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No']].map(([v, l]) => (
            <label key={v} className="mr-4 text-sm"><input type="radio" name="again" value={v} required className="mr-1" />{l}</label>
          ))}
        </fieldset>
        <div><label className={labelCls} htmlFor="name">Your name (optional)</label><input id="name" name="name" className={inputCls} /></div>
        <div><label className={labelCls} htmlFor="phone">Your phone (optional, only if you want us to follow up)</label><input id="phone" name="phone" inputMode="tel" className={inputCls} /></div>
        <button className={submitCls}>Send feedback</button>
      </form>
      <p className="mt-6 text-sm"><Link className="font-bold text-teal underline" href={`/seminar/${code}`}>Back to sign-in</Link></p>
    </Shell>
  );
}
