import { inputCls, submitCls } from '@/components/ui';
import { assignToCohort } from '../ops-actions';

export type TrainerOption = { id: string; name: string; tier: number | null };

/** Founder-only form: put a trainer on a training as lead, co-facilitator or observer. Adding someone again changes their role. */
export function AssignTrainer({ cohort, people, returnTo, label = 'Add a trainer' }: { cohort: string; people: TrainerOption[]; returnTo: string; label?: string }) {
  return (
    <details className="mt-3 rounded-lg border border-teal-100 p-2 text-sm">
      <summary className="cursor-pointer font-bold text-teal">{label}</summary>
      <form action={assignToCohort} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="cohort" value={cohort} /><input type="hidden" name="back" value={returnTo} />
        <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Trainer</span>
          <select name="person" required className={inputCls}><option value="">Choose…</option>{people.map((t) => <option key={t.id} value={t.id}>{t.name}{t.tier ? ` (Tier ${t.tier})` : ''}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">As</span>
          <select name="role" className={inputCls}><option value="lead">Lead</option><option value="co">Co-facilitator</option><option value="observer">Observer (trainee)</option></select></label>
        <button className={submitCls}>Add to training</button>
      </form>
      <p className="mt-1 text-xs text-slate-500">The trainer then sees this training in their portal and phone calendar. Lead and co-facilitator can also set its daily time. Adding the same person again changes their role.</p>
    </details>
  );
}
