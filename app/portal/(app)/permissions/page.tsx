import { asAdmin } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Table, inputCls, submitCls } from '@/components/ui';
import { DELEGABLE_ROLES, FEATURES } from '@/lib/features';
import { saveRoleGrid, setPersonFeature, saveAgreement } from '../../permissions-actions';
import { levelName } from '@/lib/levels';

export const dynamic = 'force-dynamic';
const ghost = 'rounded-lg border border-teal px-3 py-1.5 text-xs font-bold text-teal';
const ROLE_LABEL: Record<string, string> = { facilitator: 'Facilitators', master: 'Master trainers', founder: 'Founders', org_admin: 'Partners', participant: 'Participants' };

export default async function Permissions() {
  await requireMe('founder');
  const { roleRows, personRows, people, orgs, chain } = await asAdmin(async (q) => ({
    orgs: await q(`select o.id, o.name, o.type, p.name parent_name, a.named_participant_access, a.welfare_flag_visibility, a.released_report_types,
                     (select count(*)::int from cohorts c where c.organisation_id=o.id) cohorts
                   from organisations o left join agreements a on a.organisation_id=o.id left join organisations p on p.id=o.parent_id
                   where not o.is_internal and o.status <> 'rejected' order by coalesce(p.name,o.name), o.parent_id nulls first, o.name`).catch(() => []),
    chain: await q(`select p.id, p.display_name, max(r.tier)::int tier, (select s.display_name from supervision v join people s on s.id=v.supervisor_id where v.person_id=p.id and v.status='active' limit 1) supervisor
                    from people p join role_assignments r on r.person_id=p.id and r.role='facilitator' and r.status='active'
                    group by p.id, p.display_name order by max(r.tier) desc, p.display_name`),
    roleRows: await q('select role, feature, allowed from role_features'),
    personRows: await q('select pf.person_id, pf.feature, pf.allowed, p.display_name from person_features pf join people p on p.id=pf.person_id order by p.display_name'),
    people: await q(`select p.id, p.display_name, string_agg(distinct r.role || coalesce(r.tier::text,''), ', ') roles
                     from people p join role_assignments r on r.person_id=p.id and r.status='active'
                     where r.role in ('facilitator','founder','staff') group by p.id, p.display_name order by p.display_name`),
  }));
  const delegable = FEATURES.filter((f) => f.delegable);
  const fixed = FEATURES.filter((f) => !f.delegable);
  const cell = (role: string, f: (typeof FEATURES)[number]) => {
    const r = roleRows.find((x: any) => x.role === role && x.feature === f.key);
    if (!r) return f.roles.includes(role as any) ? (f.levelDefault?.[role as 'facilitator' | 'master'] ?? 'edit') : 'none';
    return !r.allowed ? 'none' : r.level === 'view' ? 'view' : 'edit';
  };
  const REPORT_TYPES: [string, string][] = [['session', 'Session reports'], ['followup_30', '30-day follow-up'], ['followup_60', '60-day follow-up'], ['followup_90', '90-day follow-up'], ['completion', 'Completion report'], ['impact', 'Impact report']];
  return (
    <>
      <PageHeader title="Permissions" subtitle="Decide who sees which section, and whether they can change it. Founders always see and edit everything. Sections that hold money, welfare or personal records stay fixed." />
      <Card title="By role" subtitle="None hides the section. View lets people read it but switches every form off. Edit lets them change things. What they read is still limited by the database to their own cohorts and people." className="mb-6">
        <form action={saveRoleGrid}>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-4">Section</th>{DELEGABLE_ROLES.map((r) => <th key={r} className="px-3 py-2 text-center">{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody>{delegable.map((f) => (
              <tr key={f.key} className="border-t border-teal-50">
                <td className="py-2 pr-4 font-semibold text-teal">{f.label}<div className="text-xs font-normal text-slate-500">{f.section}</div></td>
                {DELEGABLE_ROLES.map((r) => (
                  <td key={r} className="px-3 py-2 text-center">
                    <input type="hidden" name={`seen:${r}:${f.key}`} value="1" />
                    <select name={`cell:${r}:${f.key}`} defaultValue={cell(r, f)} className="rounded-md border border-teal-100 bg-white px-2 py-1 text-xs">
                      <option value="none">None</option><option value="view">View</option>{f.maxLevel !== 'view' && <option value="edit">Edit</option>}
                    </select>
                  </td>
                ))}
              </tr>
            ))}</tbody>
          </table></div>
          <button className={`${submitCls} mt-3`}>Save role permissions</button>
        </form>
      </Card>

      <Card title="For one person" subtitle="Give or remove a section for a single person. This overrides their role." className="mb-6">
        <form action={setPersonFeature} className="grid gap-3 sm:grid-cols-4">
          <select name="person" required className={inputCls}><option value="">Choose a person</option>{people.map((p: any) => <option key={p.id} value={p.id}>{p.display_name} ({p.roles})</option>)}</select>
          <select name="feature" required className={inputCls}>{delegable.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
          <select name="mode" className={inputCls}><option value="view">Give view access</option><option value="allow">Give edit access</option><option value="deny">Remove access</option><option value="default">Back to role default</option></select>
          <button className={submitCls}>Apply</button>
        </form>
        {personRows.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {personRows.map((r: any) => <li key={r.person_id + r.feature}><b className="text-teal">{r.display_name}</b>: {FEATURES.find((f) => f.key === r.feature)?.label} <Badge tone={r.allowed ? 'green' : 'red'}>{r.allowed ? (r.level === 'view' ? 'view' : 'edit') : 'removed'}</Badge></li>)}
          </ul>
        )}
      </Card>

      <Card title="Partner organisations" subtitle="Partners sign in and see only their own organisation (and any branches under it): its cohorts, how participants are doing at 30, 60 and 90 days, and the reports you release to them. Set exactly how much here." className="mb-6">
        {orgs.length === 0 && <p className="text-sm text-slate-600">No partner organisations yet.</p>}
        <div className="space-y-3">
          {orgs.map((o: any) => (
            <details key={o.id} className="rounded-lg border border-teal-50 p-3">
              <summary className="cursor-pointer text-sm font-bold text-teal">{o.parent_name ? `${o.parent_name} › ` : ''}{o.name} <span className="font-normal text-slate-500">· {o.cohorts} cohort{o.cohorts === 1 ? '' : 's'} · {o.named_participant_access ?? 'aggregates'}{(o.released_report_types ?? []).length ? ` · ${(o.released_report_types ?? []).length} report types released` : ' · no reports released'}</span></summary>
              <form action={saveAgreement} className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <input type="hidden" name="org" value={o.id} />
                <label className="block"><span className="text-xs font-bold text-slate-500">Participant detail</span>
                  <select name="named" defaultValue={o.named_participant_access ?? 'aggregates'} className={inputCls}>
                    <option value="none">Nothing about participants</option>
                    <option value="aggregates">Totals and percentages only</option>
                    <option value="named">Named participants of their own cohorts</option>
                  </select></label>
                <label className="flex items-center gap-2 pt-5"><input type="checkbox" name="welfare" defaultChecked={!!o.welfare_flag_visibility} className="h-4 w-4" /> Can see welfare concerns about their participants</label>
                <fieldset className="sm:col-span-2"><legend className="text-xs font-bold text-slate-500">Reports we generate that they may open (only once a report is released)</legend>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{REPORT_TYPES.map(([k, l]) => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" name={`type:${k}`} defaultChecked={(o.released_report_types ?? []).includes(k)} className="h-4 w-4" />{l}</label>)}</div></fieldset>
                <div className="sm:col-span-2"><button className={submitCls}>Save for {o.name}</button></div>
              </form>
            </details>
          ))}
        </div>
      </Card>

      <Card title="Who reviews whom" subtitle="Day reports and forms are read by someone one step above the author. Founders can read and review everything." className="mb-6">
        <ul className="mb-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
          <li>A report goes to the author's supervisor if they have one, otherwise to a master trainer and the founders.</li>
          <li>Nobody can mark their own report as read. The database refuses it.</li>
          <li>A trainer can review another trainer's report only if it was sent to them, they supervise the author, or they are on a higher tier.</li>
          <li>Set or change a supervisor on the Team page.</li>
        </ul>
        <Table head={['Trainer', 'Level', 'Their reports go to']} rows={chain.map((c: any) => [
          <b key="n" className="text-teal">{c.display_name}</b>, levelName(c.tier),
          c.supervisor ?? <span key="s" className="text-slate-500">{c.tier >= 2 ? 'A master trainer and the founders' : 'Nobody assigned yet'}</span>,
        ])} />
      </Card>

      <Card title="Planned: applicants" subtitle="Not switched on. Noted here so the design leaves room for it." className="mb-6">
        <p className="text-sm text-slate-700">An <b>applicant</b> role would let an individual who wants to join sign in, build their own SEE Canvas and apply to a cohort, without seeing anything about other people. It needs its own sign-up route, consent wording and limits on what the canvas can store, so it would be a deliberate release rather than a setting. The permission layer above already separates “can see” from “can change”, which is what it will need.</p>
      </Card>

      <Card title="Fixed sections" subtitle="These follow the person's role and cannot be shared here, because they contain money, welfare or personal records.">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {fixed.map((f) => (
            <li key={f.key} className="rounded-lg border border-teal-50 p-3"><b className="text-teal">{f.label}</b>
              <div className="text-xs text-slate-600">{f.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ')}{f.note ? ` · ${f.note}` : ''}</div></li>
          ))}
        </ul>
      </Card>
    </>
  );
}
