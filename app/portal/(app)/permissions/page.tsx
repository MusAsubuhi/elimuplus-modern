import { asAdmin } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, inputCls, submitCls } from '@/components/ui';
import { DELEGABLE_ROLES, FEATURES } from '@/lib/features';
import { saveRoleGrid, setPersonFeature } from '../../permissions-actions';

export const dynamic = 'force-dynamic';
const ghost = 'rounded-lg border border-teal px-3 py-1.5 text-xs font-bold text-teal';
const ROLE_LABEL: Record<string, string> = { facilitator: 'Facilitators', master: 'Master trainers', founder: 'Founders', org_admin: 'Partners', participant: 'Participants' };

export default async function Permissions() {
  await requireMe('founder');
  const { roleRows, personRows, people } = await asAdmin(async (q) => ({
    roleRows: await q('select role, feature, allowed from role_features'),
    personRows: await q('select pf.person_id, pf.feature, pf.allowed, p.display_name from person_features pf join people p on p.id=pf.person_id order by p.display_name'),
    people: await q(`select p.id, p.display_name, string_agg(distinct r.role || coalesce(r.tier::text,''), ', ') roles
                     from people p join role_assignments r on r.person_id=p.id and r.status='active'
                     where r.role in ('facilitator','founder','staff') group by p.id, p.display_name order by p.display_name`),
  }));
  const delegable = FEATURES.filter((f) => f.delegable);
  const fixed = FEATURES.filter((f) => !f.delegable);
  const cell = (role: string, f: (typeof FEATURES)[number]) => { const r = roleRows.find((x: any) => x.role === role && x.feature === f.key); return r ? !!r.allowed : f.roles.includes(role as any); };
  return (
    <>
      <PageHeader title="Permissions" subtitle="Decide who sees which section of the portal. Founders always see everything. Sections that hold money, welfare or personal records stay fixed." />
      <Card title="By role" subtitle="What each kind of user can open. A tick means they see that section in their menu and can use it." className="mb-6">
        <form action={saveRoleGrid}>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-4">Section</th>{DELEGABLE_ROLES.map((r) => <th key={r} className="px-3 py-2 text-center">{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody>{delegable.map((f) => (
              <tr key={f.key} className="border-t border-teal-50">
                <td className="py-2 pr-4 font-semibold text-teal">{f.label}<div className="text-xs font-normal text-slate-500">{f.section}</div></td>
                {DELEGABLE_ROLES.map((r) => (
                  <td key={r} className="px-3 py-2 text-center">
                    <input type="hidden" name={`seen:${r}:${f.key}`} value="1" />
                    <input type="checkbox" name={`cell:${r}:${f.key}`} defaultChecked={cell(r, f)} className="h-4 w-4" />
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
          <select name="mode" className={inputCls}><option value="allow">Give access</option><option value="deny">Remove access</option><option value="default">Back to role default</option></select>
          <button className={submitCls}>Apply</button>
        </form>
        {personRows.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {personRows.map((r: any) => <li key={r.person_id + r.feature}><b className="text-teal">{r.display_name}</b>: {FEATURES.find((f) => f.key === r.feature)?.label} <Badge tone={r.allowed ? 'green' : 'red'}>{r.allowed ? 'given' : 'removed'}</Badge></li>)}
          </ul>
        )}
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
