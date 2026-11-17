'use client';
import { useActionState } from 'react';
import { activateMentor } from '../../app/portal/mentoring-actions';
import { PinResult } from './pin-forms';
import { submitCls } from './ui';

/** Passing a mentor creates the sign-in; the one-time PIN message appears once, ready to copy. */
export function ActivateMentorForm({ id, ready }: { id: string; ready: boolean }) {
  const [state, action, pending] = useActionState(activateMentor, null);
  if (state?.ok) return <PinResult state={state} />;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      {state?.error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{state.error}</p>}
      <button disabled={pending || !ready} className={submitCls}>{pending ? 'Creating…' : 'Pass this mentor and create their sign-in'}</button>
      {!ready && <p className="text-xs text-slate-500">This unlocks when all four vetting steps above have a date.</p>}
    </form>
  );
}
