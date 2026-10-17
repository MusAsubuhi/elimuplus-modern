import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, statusTone, submitCls } from '@/components/ui';
import { BarCard, PieCard } from '@/components/charts';
import { d } from '@/lib/format';
import { audit } from '@/lib/audit';
import { decideInvitation, recordGuardianConsent } from '../../actions';

export default async function People() {
  const me = await requireMe('founder');
  await audit(me.id, 'view people, agreements and welfare', 'welfare_flags');
  const P = await asUser(me.id, async (q) => ({
    invites: await q(`select i.*, o.name org_name, n.display_name nominator from invitations i left join organisations o on o.id=i.organisation_id join people n on n.id=i.nominated_by order by case i.status when 'nominated' then 0 else 1 end, i.created_at desc`),
    roles: await q(`select role, coalesce(tier::text,'') tier, count(*)::int n from role_assignments where status='active' group by 1,2 order by 1,2`),
    orgs: await q(`select o.*, a.named_participant_access, a.welfare_flag_visibility, a.released_report_types, p.name parent_name from organisations o left join agreements a on a.organisation_id=o.id left join organisations p on p.id=o.parent_id order by coalesce(p.name,o.name), o.parent_id nulls first, o.name`),
    welfare: await q(`select w.*, p.display_name participant, r.display_name raised from welfare_flags w join enrolments e on e.id=w.enrolment_id join people p on p.id=e.person_id join people r on r.id=w.raised_by order by w.created_at desc`),
    types: await q(`select type, count(*)::int n from organisations group by 1`),
  }));
  const pending = P.invites.filter((i) => i.status === 'nominated');
  const roleBars = P.roles.map((r) => ({ role: r.role === 'facilitator' ? `Tier ${r.tier}` : r.role.replace('_', ' '), people: r.n }));
  return (
    <>
      <PageHeader image="/images/home-community.jpg" title="People and partners" subtitle="Nominations waiting for you, who holds which role, the partner organisations and what each agreement allows them to see." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat tone="gold" label="Nominations to decide" value={pending.length} /><Stat label="Organisations" value={P.orgs.length} /><Stat tone={P.welfare.filter((w) => w.status === 'open').length ? 'red' : 'green'} label="Open welfare flags" value={P.welfare.filter((w) => w.status === 'open').length} />
      </div>
      <Card title="Nominations">
        <Table head={['Name', 'As', 'Partner', 'Nominated by', 'Notes', 'Decision']} rows={P.invites.map((i) => {
          const minor = i.birth_year && new Date().getFullYear() - i.birth_year < 18;
          return [<div key="n"><b>{i.full_name}</b>{minor && <span className="ml-2"><Badge tone="gold">under 18</Badge></span>}<div className="text-xs text-slate-500">{i.contact}</div></div>, i.role.replace('_', ' '), i.org_name ?? 'Direct', i.nominator, <span key="no" className="text-xs">{i.note}{minor ? (i.guardian_consent ? ' · guardian consent on file' : ' · NO guardian consent yet') : ''}</span>,
            i.status === 'nominated' ? (
              <div key="d" className="flex flex-wrap gap-1">
                {minor && !i.guardian_consent && <form action={recordGuardianConsent}><input type="hidden" name="invitation" value={i.id} /><button className="rounded-lg border border-teal px-2 py-1 text-xs font-bold text-teal">Record guardian consent</button></form>}
                <form action={decideInvitation}><input type="hidden" name="invitation" value={i.id} /><button name="decision" value="approve" className={submitCls}>Approve</button></form>
                <form action={decideInvitation}><input type="hidden" name="invitation" value={i.id} /><button name="decision" value="decline" className="rounded-lg border border-[#C8553D] px-3 py-2 text-sm font-bold text-[#C8553D]">Decline</button></form>
              </div>) : <Badge key="s" tone={statusTone(i.status)}>{i.status}</Badge>];
        })} empty="No nominations." />
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="People by role"><BarCard data={roleBars} x="role" height={240} horizontal bars={[{ key: 'people', label: 'People', color: '#0D3B3B' }]} /></Card>
        <Card title="Partners by type"><PieCard data={P.types.map((t) => ({ name: t.type, value: t.n }))} height={240} /></Card>
        <Card title="What each partner can see" className="lg:col-span-1"><ul className="space-y-2 text-sm">{P.orgs.map((o) => (
          <li key={o.id} className="rounded-lg bg-mist p-2"><b>{o.parent_id ? '↳ ' : ''}{o.name}</b><div className="text-xs text-slate-600">{o.type} · participants: <b>{o.named_participant_access}</b> · welfare flags: {o.welfare_flag_visibility ? 'yes' : 'no'}</div></li>))}</ul></Card>
      </div>
      <Card title="Welfare flags" subtitle="Seen by founders, master trainers, the raising trainer and, only if the agreement allows, the partner." className="mt-4">
        <Table head={['Date', 'Participant', 'Category', 'Summary', 'Raised by', 'Status']} rows={P.welfare.map((w) => [d(w.created_at), w.participant, w.category, w.summary, w.raised, <Badge key="s" tone={statusTone(w.status)}>{w.status}</Badge>])} empty="No flags." />
      </Card>
    </>
  );
}
