import { FORM, IMPROVE } from '@/lib/mentoring';
import { submitSessionFeedback } from '../../app/portal/mentoring-actions';
import { submitCls } from './ui';

const Scale = ({ name, labels }: { name: string; labels: string[] }) => (
  <div className="grid grid-cols-5 gap-1.5">
    {labels.map((l, i) => (
      <label key={i} className="cursor-pointer text-center">
        <input type="radio" name={name} value={i + 1} required className="peer sr-only" />
        <span className="block rounded-lg border border-teal-100 px-1 py-2 text-xs font-semibold text-slate-600 peer-checked:border-teal peer-checked:bg-teal peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-gold">
          <span className="block text-base font-bold">{i + 1}</span>{l}
        </span>
      </label>
    ))}
  </div>
);

/** The short form after a session. Mentees answer by tapping; a mentor also gets two short boxes for their own reflection. */
export default function SessionFeedbackForm({ meeting, lang, mentor = false }: { meeting: string; lang: 'sw' | 'en'; mentor?: boolean }) {
  const t = FORM[lang];
  return (
    <form action={submitSessionFeedback} className="space-y-4">
      <input type="hidden" name="meeting" value={meeting} />
      <p className="text-xs text-slate-500">{t.sub}</p>
      <fieldset><legend className="mb-1 text-sm font-bold text-teal">{t.useful}</legend><Scale name="usefulness" labels={t.useScale} /></fieldset>
      <fieldset><legend className="mb-1 text-sm font-bold text-teal">{t.clear}</legend><Scale name="clear" labels={t.clearScale} /></fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-bold text-teal">{t.pace}</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(t.paceOpts).map(([k, l]) => (
            <label key={k} className="cursor-pointer text-center"><input type="radio" name="pace" value={k} className="peer sr-only" />
              <span className="block rounded-lg border border-teal-100 px-2 py-2 text-sm font-semibold text-slate-600 peer-checked:border-teal peer-checked:bg-teal peer-checked:text-white">{l}</span></label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-bold text-teal">{t.improve}</legend>
        <div className="flex flex-wrap gap-1.5">
          {IMPROVE.map((k) => (
            <label key={k} className="cursor-pointer"><input type="checkbox" name="improve" value={k} className="peer sr-only" />
              <span className="inline-block rounded-full border border-teal-100 px-3 py-1.5 text-sm text-slate-700 peer-checked:border-gold peer-checked:bg-gold-100 peer-checked:font-semibold">{t.improveOpts[k]}</span></label>
          ))}
        </div>
      </fieldset>
      {mentor && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold text-teal">{t.wentWell}<textarea name="went_well" maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-teal-100 p-2 text-sm font-normal text-ink" /></label>
          <label className="text-sm font-bold text-teal">{t.toImprove}<textarea name="to_improve" maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-teal-100 p-2 text-sm font-normal text-ink" /></label>
        </div>
      )}
      <button className={submitCls}>{t.send}</button>
    </form>
  );
}
