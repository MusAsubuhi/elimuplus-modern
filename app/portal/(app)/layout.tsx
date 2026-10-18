import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLang, requireMe, type Role } from '@/lib/session';
import { asAdmin, asUser } from '@/lib/db';
import { logout, setLang, demoLogin } from '../actions';
import Flash from '@/components/flash';
import { t } from '@/lib/i18n';
import { levelName } from '@/lib/levels';
import { allowedFeatures } from '@/lib/access';
import { FEATURES, SECTIONS } from '@/lib/features';

type Item = { href: string; label: string; icon: string };
const NAV: Record<Role, { title: string; items: Item[] }> = {
  participant: { title: 'Participant', items: [
    { href: '/portal/me', label: 'My journey', icon: '◎' },
    { href: '/portal/canvas', label: 'My canvas', icon: '▦' },
    { href: '/portal/directory', label: 'Biashara za Elimu+', icon: '❖' }] },
  facilitator: { title: 'Facilitator', items: [
    { href: '/portal/cohorts', label: 'My cohorts', icon: '◧' },
    { href: '/portal/reports', label: 'Day reports', icon: '✎' },
    { href: '/portal/requests', label: 'My requests', icon: '₭' },
    { href: '/portal/pathway', label: 'My pathway', icon: '△' },
    { href: '/portal/invite', label: 'Suggest people and partners', icon: '+' }] },
  master: { title: 'Master trainer', items: [
    { href: '/portal/qa', label: 'Quality and reports', icon: '✓' },
    { href: '/portal/crm', label: 'Partners: call, visit, check', icon: '☎' },
    { href: '/portal/invite', label: 'Suggest people and partners', icon: '+' }] },
  org_admin: { title: 'Partner', items: [
    { href: '/portal/partner', label: 'Overview', icon: '◉' },
    { href: '/portal/partner/request', label: 'Request training', icon: '✎' },
    { href: '/portal/partner/billing', label: 'Invoices and payments', icon: '₭' },
    { href: '/portal/partner/library', label: 'Reports and documents', icon: '▤' }] },
  founder: { title: 'Founders', items: [] },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  if (me.mustChangePin) redirect('/portal/set-pin');
  const lang = await getLang(me);
  const personas = me.demo ? await asAdmin((q) => q(`select p.id, p.display_name, (select string_agg(distinct role || coalesce(tier::text,''),'/') from role_assignments where person_id=p.id) r from people p order by p.full_name`)) : [];
  // founders and master trainers also see the facilitator and QA areas
  const groups: Role[] = me.roles.includes('founder') ? ['founder', 'master', 'facilitator', ...(me.roles.includes('participant') ? (['participant'] as Role[]) : [])] : me.roles;
  const unread = me.roles.includes('founder') ? Number((await asUser(me.id, (q) => q('select count(*)::int n from founder_alerts a where not exists (select 1 from alert_reads r where r.alert_id=a.id and r.person_id=$1)', [me.id])).catch(() => [{ n: 0 }]))[0].n) : 0;
  const allowed = await allowedFeatures(me);
  const isFounder = me.roles.includes('founder');
  const seen = new Set<string>();
  const shared = FEATURES.filter((f) => f.delegable && allowed.has(f.key) && !isFounder);
  return (
    <div className="min-h-screen md:flex">
      <aside className="no-print bg-teal text-white md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto">
        <div className="flex items-center gap-3 px-5 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-elimu-white.png" alt="Elimu+" className="h-9 w-auto" />
          <span className="text-xs font-bold uppercase tracking-widest text-gold">Portal</span>
        </div>
        <nav className="px-3 pb-6">
          {isFounder && SECTIONS.map((s) => {
            const items = FEATURES.filter((f) => f.section === s);
            items.forEach((f) => seen.add(f.href));
            return (
              <div key={s} className="mb-4">
                <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-teal-100/70">{s}</div>
                {items.map((i) => (
                  <Link key={i.href} href={i.href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-teal-50 hover:bg-white/10">
                    <span className="w-4 text-center text-gold">{i.icon}</span>{i.label}{i.href === '/portal/alerts' && unread > 0 && <span className="ml-auto rounded-full bg-gold px-2 text-[11px] font-bold text-teal">{unread}</span>}
                  </Link>
                ))}
              </div>
            );
          })}
          {groups.filter((g) => g !== 'founder').map((g) => (
            <div key={g} className="mb-4">
              <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-teal-100/70">{NAV[g].title}</div>
              {NAV[g].items.filter((i) => !seen.has(i.href) && seen.add(i.href)).map((i) => (
                <Link key={i.href} href={i.href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-teal-50 hover:bg-white/10">
                  <span className="w-4 text-center text-gold">{i.icon}</span>{i.label}
                </Link>
              ))}
            </div>
          ))}
          {shared.length > 0 && (
            <div className="mb-4">
              <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-teal-100/70">Shared with you</div>
              {shared.map((i) => (
                <Link key={i.href} href={i.href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-teal-50 hover:bg-white/10">
                  <span className="w-4 text-center text-gold">{i.icon}</span>{i.label}
                </Link>
              ))}
            </div>
          )}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-teal-100 bg-white px-5 py-3">
          <div className="text-sm"><span className="font-bold text-teal">{me.displayName}</span>
            <span className="ml-2 text-slate-500">{me.primary === 'master' || me.primary === 'facilitator' ? levelName(me.tier) : NAV[me.primary].title}</span></div>
          <div className="flex items-center gap-3">
            {me.demo && (
              <form action={demoLogin} className="flex items-center gap-1">
                <label className="text-xs text-slate-500" htmlFor="persona">View as</label>
                <select id="persona" name="person" defaultValue={me.id} className="rounded-md border border-teal-100 bg-white px-2 py-1 text-xs">
                  {personas.map((p) => <option key={p.id} value={p.id}>{p.display_name} ({p.r?.replace(/null/g, '')})</option>)}
                </select>
                <button className="rounded-md bg-gold px-2 py-1 text-xs font-bold text-teal">Go</button>
              </form>
            )}
            <form action={setLang} className="flex overflow-hidden rounded-md border border-teal-100 text-xs font-bold">
              <input type="hidden" name="back" value="/portal" />
              <button name="lang" value="sw" className={`px-2 py-1 ${lang === 'sw' ? 'bg-teal text-white' : 'bg-white text-teal'}`}>SW</button>
              <button name="lang" value="en" className={`px-2 py-1 ${lang === 'en' ? 'bg-teal text-white' : 'bg-white text-teal'}`}>EN</button>
            </form>
            <form action={logout}><button className="text-xs font-bold text-teal underline">{t(lang, 'signOut')}</button></form>
          </div>
        </header>
        {me.demo && <div className="no-print bg-gold-100 px-5 py-1.5 text-center text-xs font-semibold text-gold-600">Demo data: synthetic people and figures. Nothing here is real or saved permanently.</div>}
        <main className="mx-auto max-w-6xl p-5 md:p-8"><Flash />{children}</main>
      </div>
    </div>
  );
}
