'use client';
import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { addPerson, approveInvitation, invitePartnerContact, changePin, resetPin, type PinState } from '../../app/portal/team-actions';
import { EDUCATION, ROLE_OPTIONS } from '@/lib/options';
import { inputCls, submitCls } from '@/components/ui';

/** Submit without React 19's automatic form reset, so a refused submission keeps what the person typed. */
const submitter = (dispatch: (fd: FormData) => void) => (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  startTransition(() => dispatch(fd));
};

export function PinResult({ state, onClose }: { state: NonNullable<PinState>; onClose?: () => void }) {
  const [copied, setCopied] = useState(false);
  if (state.error) return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{state.error}</p>;
  if (!state.ok) return null;
  const text = state.message ?? `Elimu+ Portal sign-in\nPhone: ${state.phone}\nTemporary PIN: ${state.pin}\nYou will choose your own PIN the first time you sign in.`;
  return (
    <div className="rounded-xl border-2 border-gold bg-gold-100 p-4 text-sm">
      <p className="font-bold text-teal">{state.name} can now sign in.</p>
      <p className="mt-1">Phone <b>{state.phone}</b> · temporary PIN <b className="rounded bg-white px-2 py-0.5 font-mono text-lg tracking-widest">{state.pin}</b></p>
      <p className="mt-2 text-xs text-slate-700">This PIN is shown once and is not stored anywhere readable. Send it to them privately (WhatsApp or SMS). They must choose their own PIN at first sign-in.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className={submitCls} onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* ignore */ } }}>{copied ? 'Copied' : 'Copy message'}</button>
        {onClose && <button type="button" className="rounded-lg border border-teal px-3 py-2 text-sm font-bold text-teal" onClick={onClose}>Done</button>}
      </div>
    </div>
  );
}

export function AddPersonForm({ orgs, cohorts }: { orgs: { id: string; name: string }[]; cohorts: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(addPerson, null);
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState('participant');
  useEffect(() => { if (state?.ok) { router.refresh(); ref.current?.reset(); } }, [state, router]);
  const needsOrg = role === 'org_admin' || role === 'org_viewer';
  return (
    <form ref={ref} onSubmit={submitter(action)} className="grid gap-3 text-sm sm:grid-cols-2">
      <label className="block font-bold sm:col-span-2">Full name<input name="name" required className={inputCls} /></label>
      <label className="block font-bold">Phone (their sign-in)<input name="phone" required inputMode="tel" placeholder="0712 345 678" className={inputCls} /></label>
      <label className="block font-bold">Known as<input name="display" placeholder="First name" className={inputCls} /></label>
      <label className="block font-bold">Role
        <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
          {ROLE_OPTIONS.map((g) => <optgroup key={g.group} label={g.group}>{g.items.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>)}
        </select>
      </label>
      <label className="block font-bold">Language
        <select name="lang" defaultValue="sw" className={inputCls}><option value="sw">Kiswahili</option><option value="en">English</option></select>
      </label>
      {(needsOrg || role === 'participant') && (
        <label className="block font-bold">Partner organisation{needsOrg ? '' : ' (optional)'}
          <select name="org" required={needsOrg} className={inputCls}><option value="">{needsOrg ? 'Choose…' : 'None / Elimu+ direct'}</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </label>
      )}
      {role === 'participant' && (
        <label className="block font-bold">Enrol in cohort (optional)
          <select name="cohort" className={inputCls}><option value="">Not yet</option>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
      )}
      <label className="block font-bold">Age<input name="age" type="number" min="10" max="99" className={inputCls} /></label>
      <label className="block font-bold">Education level
        <select name="education" defaultValue="" className={inputCls}><option value="">Not recorded</option>{EDUCATION.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      <label className="block font-bold">Occupation<input name="occupation" placeholder="e.g. tailor, student, teacher" className={inputCls} /></label>
      <label className="block font-bold">Email (optional)<input name="email" type="email" className={inputCls} /></label>
      <label className="flex items-start gap-2 text-sm"><input name="newsletter" type="checkbox" className="mt-1" /><span>They agreed to receive the Elimu+ newsletter by email (needs an email address)</span></label>
      <label className="block font-bold">County<input name="county" defaultValue="Mombasa" className={inputCls} /></label>
      <label className="block font-bold">Ward or area<input name="ward" placeholder="e.g. Likoni" className={inputCls} /></label>
      <label className="flex gap-2 sm:col-span-2"><input type="checkbox" name="guardian" />Guardian consent obtained (required under 18)</label>
      <div className="sm:col-span-2"><button disabled={pending} className={submitCls}>{pending ? 'Adding…' : 'Add person and create sign-in'}</button></div>
      {state && <div className="sm:col-span-2"><PinResult state={state} /></div>}
    </form>
  );
}

export function ResetPinButton({ personId }: { personId: string }) {
  const [state, action, pending] = useActionState(resetPin, null);
  const [open, setOpen] = useState(true);
  return (
    <div>
      <form onSubmit={(e) => { setOpen(true); submitter(action)(e); }}>
        <input type="hidden" name="person" value={personId} />
        <button disabled={pending} className="rounded-lg border border-teal px-2 py-1 text-xs font-bold text-teal hover:bg-teal-50">{pending ? '…' : 'Reset PIN'}</button>
      </form>
      {state && open && <div className="mt-2 min-w-72"><PinResult state={state} onClose={() => setOpen(false)} /></div>}
    </div>
  );
}

export function ApproveInvitationForm({ invitationId, contact, called = true }: { invitationId: string; contact: string; called?: boolean }) {
  const [state, action, pending] = useActionState(approveInvitation, null);
  const isEmail = contact.includes('@');
  if (state?.ok) return <PinResult state={state} />;
  return (
    <form onSubmit={submitter(action)} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="invitation" value={invitationId} />
      <label className="text-xs font-bold">Sign-in phone<input name="phone" required defaultValue={isEmail ? '' : contact} inputMode="tel" className={`${inputCls} w-36`} /></label>
      <label className="text-xs font-bold">Language<select name="lang" defaultValue="sw" className={`${inputCls} w-28`}><option value="sw">Kiswahili</option><option value="en">English</option></select></label>
      {!called && <label className="w-full text-xs font-bold text-[#C8553D]">Not called yet. If you must approve without a call, say why<input name="override" className={inputCls} placeholder="Reason (it is recorded)" /></label>}
      <button disabled={pending} className={submitCls}>{pending ? '…' : 'Approve and create account'}</button>
      {state?.error && <p role="alert" className="w-full text-xs font-semibold text-red-700">{state.error}</p>}
    </form>
  );
}

export function SetPinForm() {
  const [state, action, pending] = useActionState(changePin, null);
  return (
    <form onSubmit={submitter(action)} className="space-y-3">
      <label className="block text-sm font-bold">New PIN (6 to 12 digits)<input name="pin" type="password" inputMode="numeric" autoComplete="new-password" required className={inputCls} /></label>
      <label className="block text-sm font-bold">Type it again<input name="again" type="password" inputMode="numeric" autoComplete="new-password" required className={inputCls} /></label>
      {state?.error && <p role="alert" className="text-sm font-semibold text-red-700">{state.error}</p>}
      <button disabled={pending} className={`${submitCls} w-full py-2.5`}>{pending ? 'Saving…' : 'Save my PIN'}</button>
    </form>
  );
}

export function InvitePartnerForm({ orgs }: { orgs: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(invitePartnerContact, null);
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [org, setOrg] = useState('');
  useEffect(() => { if (state?.ok) { router.refresh(); ref.current?.reset(); setOrg(''); } }, [state, router]);
  return (
    <form ref={ref} onSubmit={submitter(action)} className="grid gap-3 text-sm sm:grid-cols-2">
      <label className="block font-bold">Organisation
        <select name="org" value={org} onChange={(e) => setOrg(e.target.value)} className={inputCls}><option value="">A new organisation…</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      </label>
      {!org && (
        <>
          <label className="block font-bold">New organisation name<input name="new_org" placeholder="e.g. Likoni Community Church" className={inputCls} /></label>
          <label className="block font-bold">Type
            <select name="org_type" defaultValue="church" className={inputCls}><option value="church">Church</option><option value="cdc">Church development centre</option><option value="school">School</option><option value="college">College</option><option value="ngo">NGO</option><option value="company">Company</option><option value="other">Other</option></select>
          </label>
          <label className="block font-bold">County<input name="county" defaultValue="Mombasa" className={inputCls} /></label>
        </>
      )}
      <label className="block font-bold">Their full name<input name="name" required placeholder="e.g. Pastor Grace Achieng" className={inputCls} /></label>
      <label className="block font-bold">Phone (their sign-in)<input name="phone" required inputMode="tel" placeholder="0712 345 678" className={inputCls} /></label>
      <label className="block font-bold">Email (for quotations and receipts)<input name="email" type="email" className={inputCls} /></label>
      <label className="block font-bold">Their role
        <select name="role" defaultValue="org_admin" className={inputCls}><option value="org_admin">Partner admin: requests training, loads participants, pays and views everything</option><option value="org_viewer">Partner viewer: read only</option></select>
      </label>
      <label className="block font-bold">Message language
        <select name="lang" defaultValue="en" className={inputCls}><option value="en">English</option><option value="sw">Kiswahili</option></select>
      </label>
      <div className="sm:col-span-2"><button disabled={pending} className={submitCls}>{pending ? 'Creating…' : 'Create invitation and sign-in'}</button></div>
      {state && <div className="sm:col-span-2"><PinResult state={state} /></div>}
    </form>
  );
}
