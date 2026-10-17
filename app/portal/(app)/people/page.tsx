import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, statusTone, submitCls } from '@/components/ui';
import { BarCard, PieCard } from '@/components/charts';
import { d } from '@/lib/format';
import { audit } from '@/lib/audit';
import { educationLabel, orgTypeLabel } from '@/lib/options';
import { ApproveInvitationForm } from '@/components/pin-forms';
import { decideInvitation, recordGuardianConsent } from '../../actions';
import { decideOrgSuggestion } from '../../team-actions';

export default async function People() {
  const me = await requireMe('founder');
  await audit(me.id, 'view people, agreements and welfare', 'welfare_flags');
  const P = await asUser(me.id, async (q) => ({
    invites: await q(`select i.*, o.name org_name, n.display_name nominator, coalesce(cp.called,false) called from invitations i left join organisations o on o.id=i.organisation_id join people n on n.id=i.nominated_by left join crm_person_status cp on cp.invitation_id=i.id order by case i.status when 'nominated' then 0 else 1 end, i.created_at desc`),
    orgSug: await q(`select s.*, n.display_name suggester, par.name parent_name from org_suggestions s join people n on n.id=s.suggested_by left join organisations par on par.id=s.parent_id order by case s.status when 'suggested' then 0 else 1 end, s.created_at desc`),
    roles: await q(`select role, coalesce(tier::text,'') tier, count(*)::int n from role_assignments where status='active' group by 1,2 order by 1,2`),
    orgs: await q(`select o.*, a.named_participant_access, a.welfare_flag_visibility, a.released_report_types, p.name parent_name from organisations o left join agreements a on a.organisation_id=o.id left join organisations p on p.id=o.parent_id where not o.is_internal order by coalesce(p.name,o.name), o.parent_id nulls first, o.name`),
    welfare: await q(`select w.*, p.display_name participant, r.display_name raised from welfare_flags w join enrolments e on e.id=w.enrolment_id join people p on p.id=e.person_id join people r on r.id=w.raised_by order by w.created_at desc`),
    types: await q(`select type, count(*)::int n from organisations where not is_internal group by 1`),
  }));
  const pending = P.invites.filter((i) => i.status === 'nominated');
  const pendingOrgs = P.orgSug.filter((s) => s.status === 'suggested');
  const roleBars = P.roles.map((r) => ({ role: r.role === 'facilitator' ? `Tier ${r.tier}` : r.role.replace('_', ' '), people: r.n }));
  const yr = new Date().getFullYear();
  return (
    <>
      <PageHeader image="/images/home-community.jpg" title="People and partners" subtitle="Suggestions waiting for you, who holds which role, the partner organisations and what each agreement allows them to see." />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat tone="gold" label="People to decide" value={pending.length} /><Stat tone="gold" label="Organisations to decide" value={pendingOrgs.length} /><Stat label="Organisations" value={P.orgs.length} /><Stat tone={P.welfare.filter((w) => w.status === 'open').length ? 'red' : 'green'} label="Open welfare flags" value={P.welfare.filter((w) => w.status === 'open').length} />
      </div>
      <Card title="People suggested" subtitle="Approving creates the account and gives you a one-time PIN to send them. Add people yourself on the Team page.">
        <Table head={['Person', 'Age · schooling · where', 'As', 'Partner', 'Suggested by', 'Decision']} rows={P.invites.map((i) => {
          const age = i.birth_year ? yr - i.birth_year : null;
          const minor = age !== null && age < 18;
          return [
            <div key="n"><b>{i.full_name}</b>{minor && <span className="ml-2"><Badge tone="gold">under 18</Badge></span>}<div className="text-xs text-slate-500">{i.contact}</div></div>,
            <div key="a" className="text-xs">{[age !== null ? `${age} yrs` : '', educationLabel(i.education_level), i.occupation].filter(Boolean).join(' · ')}<div className="text-slate-500">{[i.ward, i.county].filter(Boolean).join(', ')}</div>{i.note && <div className="mt-1 text-slate-600">{i.note}</div>}<div className={i.called ? 'text-emerald-700' : 'text-slate-500'}>{i.called ? '✓ Called' : 'Not called yet'} · <a className="underline" href={`/portal/crm?tab=people#p-${i.id}`}>log a call</a></div>{minor && <div className={i.guardian_consent ? 'text-emerald-700' : 'font-bold text-[#C8553D]'}>{i.guardian_consent ? 'Guardian consent on file' : 'No guardian consent yet'}</div>}</div>,
            i.role.replace(/_/g, ' '), i.org_name ?? 'Direct', i.nominator,
            i.status === 'nominated' ? (
              <div key="d" className="flex min-w-72 flex-col gap-2">
                {minor && !i.guardian_consent && <form action={recordGuardianConsent}><input type="hidden" name="invitation" value={i.id} /><button className="rounded-lg border border-teal px-2 py-1 text-xs font-bold text-teal">Record guardian consent</button></form>}
                <ApproveInvitationForm invitationId={i.id} contact={i.contact} called={i.called} />
                <form action={decideInvitation}><input type="hidden" name="invitation" value={i.id} /><button name="decision" value="decline" className="rounded-lg border border-[#C8553D] px-3 py-1.5 text-xs font-bold text-[#C8553D]">Decline</button></form>
              </div>) : <Badge key="s" tone={statusTone(i.status)}>{i.status === 'activated' ? 'account created' : i.status}</Badge>];
        })} empty="No suggestions." />
      </Card>
      <Card title="Organisations suggested" subtitle="Approving adds the organisation as a prospect with the safest agreement: it sees totals only, never participant names, until you change that." className="mt-4">
        <Table head={['Organisation', 'Where', 'Contact', 'Size · what they do', 'Suggested by', 'Decision']} rows={P.orgSug.map((o) => [
          <div key="n"><b>{o.name}</b><div className="text-xs text-slate-500">{orgTypeLabel(o.type)}{o.parent_name ? ` · part of ${o.parent_name}` : ''}</div></div>,
          <div key="w" className="text-xs"><b>{[o.ward, o.county].filter(Boolean).join(', ')}</b>{o.address && <div className="text-slate-600">{o.address}</div>}</div>,
          <div key="c" className="text-xs">{o.contact_person}<div className="text-slate-500">{[o.contact_phone, o.contact_email].filter(Boolean).join(' · ')}</div></div>,
          <div key="z" className="text-xs">{o.approx_people ? `about ${o.approx_people} people` : ''}<div className="text-slate-600">{o.what_they_do}</div>{o.why && <div className="mt-1 italic text-slate-600">“{o.why}”</div>}</div>,
          o.suggester,
          o.status === 'suggested' ? (
            <div key="d" className="flex min-w-48 flex-col gap-2">
              <form action={decideOrgSuggestion} className="flex flex-col gap-1"><input type="hidden" name="suggestion" value={o.id} />
                <input name="note" placeholder="Note (optional)" className={`${inputCls} text-xs`} />
                <div className="flex gap-1"><button name="decision" value="approve" className={submitCls}>Add as partner</button>
                  <button name="decision" value="decline" className="rounded-lg border border-[#C8553D] px-3 py-1.5 text-xs font-bold text-[#C8553D]">Decline</button></div></form>
            </div>) : <div key="s"><Badge tone={statusTone(o.status)}>{o.status}</Badge>{o.decision_note && <div className="mt-1 text-xs text-slate-500">{o.decision_note}</div>}</div>,
        ])} empty="No organisation suggestions." />
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="People by role"><BarCard data={roleBars} x="role" height={240} horizontal bars={[{ key: 'people', label: 'People', color: '#0D3B3B' }]} /></Card>
        <Card title="Partners by type"><PieCard data={P.types.map((t) => ({ name: t.type, value: t.n }))} height={240} /></Card>
        <Card title="What each partner can see" className="lg:col-span-1"><ul className="space-y-2 text-sm">{P.orgs.map((o) => (
          <li key={o.id} className="rounded-lg bg-mist p-2"><b>{o.parent_id ? '↳ ' : ''}{o.name}</b><div className="text-xs text-slate-600">{orgTypeLabel(o.type)}{o.ward || o.county ? ` · ${[o.ward, o.county].filter(Boolean).join(', ')}` : ''} · participants: <b>{o.named_participant_access ?? 'none'}</b> · welfare flags: {o.welfare_flag_visibility ? 'yes' : 'no'}</div></li>))}</ul></Card>
      </div>
      <Card title="Welfare flags" subtitle="Seen by founders, master trainers, the raising trainer and, only if the agreement allows, the partner." className="mt-4">
        <Table head={['Date', 'Participant', 'Category', 'Summary', 'Raised by', 'Status']} rows={P.welfare.map((w) => [d(w.created_at), w.participant, w.category, w.summary, w.raised, <Badge key="s" tone={statusTone(w.status)}>{w.status}</Badge>])} empty="No flags." />
      </Card>
    </>
  );
}
