import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import { AddPersonForm, ResetPinButton } from '@/components/pin-forms';
import { EDUCATION, ROLE_OPTIONS, educationLabel, roleLabel } from '@/lib/options';
import { audit } from '@/lib/audit';
import { endRole, grantRole, issueCertificate } from '../../team-actions';

export default async function Team() {
  const me = await requireMe('founder');
  await audit(me.id, 'view team and sign-ins', 'people');
  const T = await asUser(me.id, async (q) => ({
    people: await q(`select p.id, p.full_name, p.display_name, p.phone, p.birth_year, p.education_level, p.county, p.ward, p.auth_user_id, p.pin_reset_required, p.status,
        (select coalesce(json_agg(json_build_object('id', ra.id, 'role', ra.role, 'tier', ra.tier, 'org', o.name) order by ra.start_date), '[]'::json)
           from role_assignments ra left join organisations o on o.id = ra.organisation_id where ra.person_id = p.id and ra.status = 'active') roles,
        (select max(tier) from certifications c where c.person_id = p.id and c.status = 'active') cert_tier
        from people p order by p.created_at desc, p.full_name`),
    orgs: await q('select id, name from organisations where not is_internal order by name'),
    cohorts: await q('select c.id, c.name from cohorts c join organisations o on o.id = c.organisation_id where not o.is_internal order by c.start_date desc nulls last'),
  }));
  const trainers = T.people.filter((p) => (p.roles as any[]).some((r) => r.role === 'facilitator'));
  const nextTier = (p: any) => (p.cert_tier ?? 0) + 1;
  return (
    <>
      <PageHeader image="/images/trainer-team.jpg" title="Team and people" subtitle="Add the people who work with you, give them a role and a first sign-in, and issue trainer certificates. Nobody can create an account on their own." />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="People" value={T.people.length} />
        <Stat tone="gold" label="Founders" value={T.people.filter((p) => (p.roles as any[]).some((r) => r.role === 'founder')).length} />
        <Stat tone="green" label="Trainers" value={trainers.length} sub={`${trainers.filter((p) => (p.roles as any[]).some((r) => r.role === 'facilitator' && r.tier >= 3)).length} master trainers`} />
        <Stat tone="red" label="Not signed in yet" value={T.people.filter((p) => p.pin_reset_required).length} sub="still on a temporary PIN" />
      </div>

      <Card title="Add a person" subtitle="Creates their record, role and sign-in in one step. You get a one-time temporary PIN to send them.">
        <AddPersonForm orgs={T.orgs as any} cohorts={T.cohorts as any} />
      </Card>

      <Card title="Everyone on the platform" className="mt-4">
        <Table head={['Person', 'Roles', 'Details', 'Sign-in', '']} rows={T.people.map((p) => [
          <div key="n"><b>{p.full_name}</b><div className="text-xs text-slate-500">{p.phone ?? 'no phone'}</div></div>,
          <div key="r" className="flex flex-col gap-1">{(p.roles as any[]).map((r) => (
            <form key={r.id} action={endRole} className="flex items-center gap-1">
              <input type="hidden" name="assignment" value={r.id} />
              <Badge tone={r.role === 'founder' ? 'gold' : r.role === 'facilitator' ? 'teal' : 'grey'}>{roleLabel(r.role, r.tier)}{r.org ? ` · ${r.org}` : ''}</Badge>
              <button title="End this role" className="text-xs font-bold text-[#C8553D] hover:underline">end</button>
            </form>))}
            {!(p.roles as any[]).length && <span className="text-xs text-slate-400">no active role</span>}</div>,
          <span key="d" className="text-xs text-slate-600">{[p.birth_year ? `${new Date().getFullYear() - p.birth_year} yrs` : '', educationLabel(p.education_level), [p.ward, p.county].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</span>,
          p.auth_user_id ? (p.pin_reset_required ? <Badge key="s" tone="gold">temporary PIN</Badge> : <Badge key="s" tone="green">signed in</Badge>) : <Badge key="s" tone="red">no sign-in</Badge>,
          <ResetPinButton key="x" personId={p.id} />,
        ])} empty="No one yet." />
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Give someone another role" subtitle="For example a participant who becomes a trainer candidate, or a partner admin for a new organisation. Founders cannot raise their own facilitator tier.">
          <form action={grantRole} className="space-y-3 text-sm">
            <label className="block font-bold">Person<select name="person" required className={inputCls}><option value="">Choose…</option>{T.people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
            <label className="block font-bold">Role<select name="role" className={inputCls}>{ROLE_OPTIONS.map((g) => <optgroup key={g.group} label={g.group}>{g.items.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>)}</select></label>
            <label className="block font-bold">Partner organisation (for partner roles and participants)<select name="org" className={inputCls}><option value="">None</option>{T.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
            <button className={submitCls}>Add role</button>
          </form>
        </Card>
        <Card title="Trainer certificates" subtitle="Tiers cannot be skipped. You issue your co-founder’s certificate and they issue yours.">
          <Table head={['Trainer', 'Holds', 'Next', '']} rows={trainers.map((p) => [
            <b key="n">{p.full_name}</b>,
            p.cert_tier ? `Tier ${p.cert_tier}` : <span key="u" className="text-slate-400">uncertified</span>,
            nextTier(p) <= 4 ? `Tier ${nextTier(p)}` : 'Highest',
            nextTier(p) > 4 ? '' : p.id === me.id
              ? <Link key="l" href="/portal/pathway" className="text-xs font-bold text-teal underline">Your pathway</Link>
              : <div key="a" className="flex gap-2"><Link href={`/portal/pathway?person=${p.id}`} className="self-center text-xs font-bold text-teal underline">Review</Link>
                  <form action={issueCertificate}><input type="hidden" name="person" value={p.id} /><input type="hidden" name="tier" value={nextTier(p)} /><button className={`${submitCls} whitespace-nowrap`}>Issue Tier {nextTier(p)}</button></form></div>,
          ])} empty="No trainers yet. Add one above, or start your own pathway under My journeys." />
        </Card>
      </div>
    </>
  );
}
