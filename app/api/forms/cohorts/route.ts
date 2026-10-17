import { NextResponse } from 'next/server';
import { asAdmin } from '@/lib/db';
import { validSecret } from '@/lib/forms-auth';

export const dynamic = 'force-dynamic';

/** Lets the Google Forms script refresh its dropdowns: active cohorts and the leaders a report can be sent to. */
export async function GET(req: Request) {
  if (!validSecret(req.headers.get('x-forms-secret'))) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const cohorts = await asAdmin((q) => q(
    `select c.id, c.name, o.name org, c.status from cohorts c join organisations o on o.id=c.organisation_id
     where c.status in ('confirmed','delivering','followup') order by c.start_date desc nulls last limit 60`));
  const leaders = await asAdmin((q) => q(
    `select distinct p.display_name name, p.email,
       case when exists (select 1 from role_assignments r where r.person_id=p.id and r.role='founder' and r.status='active') then 'Founder' else 'Master trainer' end kind
     from people p join role_assignments r on r.person_id=p.id and r.status='active'
     where (r.role='founder' or (r.role='facilitator' and r.tier>=3)) and p.email like '%@%' order by 1`));
  const supervisors = await asAdmin((q) => q(
    `select distinct p.display_name name, p.email from supervision s join people p on p.id=s.supervisor_id
     where s.status='active' and p.email like '%@%' order by 1`));
  return NextResponse.json({
    cohorts: cohorts.map((c) => ({ label: `${c.name} [${String(c.id).slice(0, 8)}]`, id: c.id })),
    leaders: [...leaders.map((l) => ({ label: `${l.name} (${l.kind})`, email: l.email })), ...supervisors.map((l) => ({ label: `${l.name} (Supervisor)`, email: l.email }))],
  });
}
