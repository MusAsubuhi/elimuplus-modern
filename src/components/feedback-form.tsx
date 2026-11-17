'use client';
import { useState } from 'react';
import { EASE_FACES, EASE_WORDS, FRUSTRATIONS, MISSING, VALUABLE, type Audience } from '@/lib/feedback-options';

export default function FeedbackForm({ audience, action }: { audience: Audience; action: (f: FormData) => void | Promise<void> }) {
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
        <legend className="text-base font-black text-teal">1. How easy is the portal to use?</legend>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {EASE_FACES.map((face, i) => (
            <button type="button" key={i} onClick={() => setEase(i + 1)} aria-pressed={ease === i + 1}
              className={`rounded-xl border-2 py-3 text-center transition ${ease === i + 1 ? 'border-gold bg-gold/20' : 'border-teal-100 bg-white hover:border-teal'}`}>
              <div className="text-3xl">{face}</div><div className="mt-1 text-[11px] font-bold text-teal">{EASE_WORDS[i]}</div>
            </button>))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-base font-black text-teal">2. How likely are you to recommend the Elimu+ portal to someone like you?</legend>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }, (_, i) => (
            <button type="button" key={i} onClick={() => setRec(i)} aria-pressed={rec === i}
              className={`h-11 w-11 rounded-lg border-2 text-sm font-black ${rec === i ? 'border-gold bg-gold text-teal' : 'border-teal-100 bg-white text-teal hover:border-teal'}`}>{i}</button>))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-500"><span>Not at all likely</span><span>Extremely likely</span></div>
      </fieldset>

      <fieldset>
        <legend className="text-base font-black text-teal">3. What do you find most valuable? <span className="font-normal text-slate-500">Pick up to three.</span></legend>
        <div className="mt-3 flex flex-wrap gap-2">{VALUABLE[audience].map((v) => <button type="button" key={v} onClick={() => toggle(v)} aria-pressed={val.includes(v)} className={chip(val.includes(v))}>{v}</button>)}</div>
      </fieldset>

      <fieldset>
        <legend className="text-base font-black text-teal">4. What gets in your way the most?</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {FRUSTRATIONS.map((v) => <label key={v} className="cursor-pointer"><input type="radio" name="frustration" value={v} className="peer sr-only" /><span className="inline-block rounded-full border border-teal-100 bg-white px-3 py-1.5 text-sm font-semibold text-teal peer-checked:border-teal peer-checked:bg-teal peer-checked:text-white">{v}</span></label>)}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-base font-black text-teal">5. What one thing would help you most next?</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {MISSING.map((v) => <label key={v} className="cursor-pointer"><input type="radio" name="missing" value={v} className="peer sr-only" /><span className="inline-block rounded-full border border-teal-100 bg-white px-3 py-1.5 text-sm font-semibold text-teal peer-checked:border-teal peer-checked:bg-teal peer-checked:text-white">{v}</span></label>)}
        </div>
      </fieldset>

      <div className="flex items-center gap-4">
        <button disabled={!ease || rec === null} className="rounded-lg bg-teal px-6 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">Send my answers</button>
        {(!ease || rec === null) && <span className="text-xs text-slate-500">Answer questions 1 and 2 to send.</span>}
      </div>
    </form>
  );
}
