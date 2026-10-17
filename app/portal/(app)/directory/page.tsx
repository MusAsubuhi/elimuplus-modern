import { asUser } from '@/lib/db';
import { getLang, requireMe } from '@/lib/session';
import { t } from '@/lib/i18n';
import { Card, PageHeader } from '@/components/ui';

export default async function Directory() {
  const me = await requireMe();
  const lang = await getLang(me);
  const rows = await asUser(me.id, (q) => q(`select display_name, business_sw, business_en, wish_list from directory_listings where status='listed' and consent_given and host_approved order by display_name`));
  return (
    <>
      <PageHeader image="/images/home-community.jpg" title={t(lang, 'directory')}
        subtitle={lang === 'sw' ? 'Biashara za wahitimu waliodumu zaidi ya siku 90. Zinaonekana kwa idhini yao.' : 'Businesses of graduates still trading after 90 days, listed with their consent.'} />
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.display_name} title={lang === 'sw' ? r.business_sw : r.business_en ?? r.business_sw} subtitle={r.display_name}>
            {r.wish_list && <p className="text-sm"><b>{lang === 'sw' ? 'Natafuta: ' : 'Looking for: '}</b>{r.wish_list}</p>}
          </Card>
        ))}
        {!rows.length && <p className="text-sm text-slate-500">—</p>}
      </div>
    </>
  );
}
