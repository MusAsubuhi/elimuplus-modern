import Link from 'next/link';
import { requirePartner } from '@/lib/session';
import { stopPartnerPreview } from '../../preview-actions';

const LINKS = [['/portal/partner', 'Overview'], ['/portal/partner/request', 'Request training'], ['/portal/partner/roster', 'Add participants'], ['/portal/partner/timeline', 'Our deliverables'], ['/portal/partner/billing', 'Invoices and payments'], ['/portal/partner/library', 'Reports and documents'], ['/portal/partner/reports', 'Build a report']];

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const me = await requirePartner();
  if (!me.preview) return <>{children}</>;
  return (
    <>
      <div className="mb-4 rounded-lg border border-teal bg-teal-50 p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p><b>Preview:</b> this is what <b>{me.preview.orgName}</b> sees. It is read-only.</p>
          <form action={stopPartnerPreview}><button className="rounded border border-teal bg-white px-3 py-1 text-xs font-bold text-teal">Exit preview</button></form>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">{LINKS.map(([h, l]) => <Link key={h} href={h} className="rounded-full border border-teal-100 bg-white px-3 py-1 text-xs font-bold text-teal">{l}</Link>)}</div>
      </div>
      <fieldset disabled className="m-0 min-w-0 border-0 p-0 opacity-95">{children}</fieldset>
    </>
  );
}
