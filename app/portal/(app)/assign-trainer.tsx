import { inputCls, submitCls } from '@/components/ui';
import { assignToCohort, removeFromCohort } from '../ops-actions';

export type TrainerOption = { id: string; name: string; tier: number | null };
export type TeamMember = { id: string; name: string; role: string };
const ROLE_WORD: Record<string, string> = { lead: 'lead', co: 'co-facilitator', observer: 'observer' };

/** Founder-only form: put a trainer on a training as lead, co-facilitator or observer. Adding someone again changes their role. */
export function AssignTrainer({ cohort, people, returnTo, team = [], label = 'Add a trainer' }: { cohort: string; people: TrainerOption[]; returnTo: string; team?: TeamMember[]; label?: string }) {
  return (
    <details className="mt-3 rounded-lg border border-teal-100 p-2 text-sm">
      <summary className="cursor-pointer font-bold text-teal">{label}</summary>
      {team.length > 0 && (
        <ul className="mt-2 space-y-1">
          {team.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-[#F5FAF8] px-2 py-1">
              <span>{m.name} <span className="text-xs text-slate-500">({ROLE_WORD[m.role] ?? m.role})</span></span>
              <form action={removeFromCohort}>
                <input type="hidden" name="cohort" value={cohort} /><input type="hidden" name="person" value={m.id} /><input type="hidden" name="back" value={returnTo} />
                <button className="rounded-lg border border-red-300 px-2 py-0.5 text-xs font-bold text-red-700 hover:bg-red-50" aria-label={`Remove ${m.name} from this training`}>Remove</button>
              </form>
            </li>))}
        </ul>)}
      <form action={assignToCohort} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="cohort" value={cohort} /><input type="hidden" name="back" value={returnTo} />
        <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Trainer</span>
          <select name="person" required className={inputCls}><option value="">Choose…</option>{people.map((t) => <option key={t.id} value={t.id}>{t.name}{t.tier ? ` (Tier ${t.tier})` : ''}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">As</span>
          <select name="role" className={inputCls}><option value="lead">Lead</option><option value="co">Co-facilitator</option><option value="observer">Observer (trainee)</option></select></label>
        <button className={submitCls}>Add to training</button>
      </form>
      <p className="mt-1 text-xs text-slate-500">The trainer then sees this training in their portal and phone calendar. Lead and co-facilitator can also set its daily time. Adding the same person again changes their role. Removing someone takes this training off their calendar; their past reports stay.</p>
    </details>
  );
}
