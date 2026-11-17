'use client';
import { useState } from 'react';
import { EASE_FACES, EASE_WORDS, FRUSTRATIONS, MISSING, UI, VALUABLE, tr, type Audience } from '@/lib/feedback-options';

export default function FeedbackForm({ audience, action, lang = 'en' }: { audience: Audience; lang?: 'en' | 'sw'; action: (f: FormData) => void | Promise<void> }) {
  const u = UI[lang];
  const [ease, setEase] = useState(0);
  const [rec, setRec] = useState<number | null>(null);
  const [val, setVal] = useState<string[]>([]);
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm font-semibold transition ${on ? 'border-teal bg-teal text-white' : 'border-teal-100 bg-white text-teal hover:border-teal'}`;
  const toggle = (v: string) => setVal((c) => (c.includes(v) ? c.filter((x) => x !== v) : c.length < 3 ? [...c, v] : c));
  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="ease" value={ease || ''} />
      <input type="hidden" name="recommend" value={rec ?? ''} />
      {val.map((v) => <input key={v} type="hidden" name="valuable" value={v} />)}

      <fieldset>
        <legend className="text-base font-black text-teal">{u.q1}</legend>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {EASE_FACES.map((face, i) => (
            <button type="button" key={i} onClick={() => setEase(i + 1)} aria-pressed={ease === i + 1}
              className={`rounded-xl border-2 py-3 text-center transition ${ease === i + 1 ? 'border-gold bg-gold/20' : 'border-teal-100 bg-white hover:border-teal'}`}>
              <div className="text-3xl">{face}</div><div className="mt-1 text-[11px] font-bold text-teal">{tr(lang, EASE_WORDS[i])}</div>
            </button>))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-base font-black text-teal">{u.q2}</legend>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }, (_, i) => (
            <button type="button" key={i} onClick={() => setRec(i)} aria-pressed={rec === i}
              className={`h-11 w-11 rounded-lg border-2 text-sm font-black ${rec === i ? 'border-gold bg-gold text-teal' : 'border-teal-100 bg-white text-teal hover:border-teal'}`}>{i}</button>))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-500"><span>{u.lo}</span><span>{u.hi}</span></div>
      </fieldset>

      <fieldset>
        <legend className="text-base font-black text-teal">{u.q3} <span className="font-normal text-slate-500">{u.up3}</span></legend>
        <div className="mt-3 flex flex-wrap gap-2">{VALUABLE[audience].map((v) => <button type="button" key={v} onClick={() => toggle(v)} aria-pressed={val.includes(v)} className={chip(val.includes(v))}>{tr(lang, v)}</button>)}</div>
      </fieldset>

      <fieldset>
        <legend className="text-base font-black text-teal">{u.q4}</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {FRUSTRATIONS.map((v) => <label key={v} className="cursor-pointer"><input type="radio" name="frustration" value={v} className="peer sr-only" /><span className="inline-block rounded-full border border-teal-100 bg-white px-3 py-1.5 text-sm font-semibold text-teal peer-checked:border-teal peer-checked:bg-teal peer-checked:text-white">{tr(lang, v)}</span></label>)}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-base font-black text-teal">{u.q5}</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {MISSING.map((v) => <label key={v} className="cursor-pointer"><input type="radio" name="missing" value={v} className="peer sr-only" /><span className="inline-block rounded-full border border-teal-100 bg-white px-3 py-1.5 text-sm font-semibold text-teal peer-checked:border-teal peer-checked:bg-teal peer-checked:text-white">{tr(lang, v)}</span></label>)}
        </div>
      </fieldset>

      <div className="flex items-center gap-4">
        <button disabled={!ease || rec === null} className="rounded-lg bg-teal px-6 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{u.send}</button>
        {(!ease || rec === null) && <span className="text-xs text-slate-500">{u.need}</span>}
      </div>
    </form>
  );
}
