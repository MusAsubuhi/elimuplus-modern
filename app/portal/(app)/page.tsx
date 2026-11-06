import { redirect } from 'next/navigation';
import { requireMe } from '@/lib/session';

export default async function Dispatch() {
  const me = await requireMe();
  const home = { founder: '/portal/command', master: '/portal/qa', facilitator: '/portal/cohorts', org_admin: '/portal/partner', participant: '/portal/me' }[me.primary];
  redirect(home);
}
