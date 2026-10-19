import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import PrintButton from '@/components/print-button';
import { CertificateSheet, certPrintCss } from '@/components/certificate';
import { SIGNERS } from '@/lib/certs';
import { d } from '@/lib/format';

export default async function CohortCertificates({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe('facilitator', 'founder');
  const { id } = await params;
  const site = (process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.elimuplus.com').replace(/\/$/, '');
  const data = await asUser(me.id, async (q) => {
    const c = (await q('select c.*, o.name org_name from cohorts c join organisations o on o.id=c.organisation_id where c.id=$1', [id]))[0];
    if (!c) return null;
    const rows = await q('select pc.number, pc.issued_on, p.full_name from participant_certificates pc join people p on p.id=pc.person_id where pc.cohort_id=$1 order by p.full_name', [id]);
    return { c, rows };
  });
  if (!data) notFound();
  const { c, rows } = data;
  return (
    <div className="bg-slate-100 print:bg-white">
      <style>{certPrintCss}</style>
      <div className="mx-auto flex max-w-[1123px] items-center justify-between px-4 pt-4 print:hidden">
        <p className="text-sm font-bold">{c.name}: {rows.length} certificates, one per page. Choose A4 landscape and turn off headers and footers.</p>
        <PrintButton label="Print all" />
      </div>
      {rows.map((r) => (
        <CertificateSheet key={r.number} heading="Certificate of Completion" name={r.full_name} number={r.number} issued={r.issued_on} signers={SIGNERS} verifyUrl={`${site}/verify/${r.number}`}
          lines={[`has successfully completed the Elimu+ ${c.format === '12-day' ? '12-Day' : '5-Day'} Entrepreneurship and Employability Programme`, `with ${c.org_name}${c.start_date ? `, ${d(c.start_date)}${c.end_date ? ` to ${d(c.end_date)}` : ''}` : ''}, building a SEE Canvas for a business or income idea and learning to turn skills and effort into real value.`]} />
      ))}
      {!rows.length && <p className="p-8 text-center text-sm text-slate-600">No certificates have been issued for this cohort yet.</p>}
    </div>
  );
}
