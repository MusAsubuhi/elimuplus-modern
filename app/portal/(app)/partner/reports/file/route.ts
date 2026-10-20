import { NextRequest } from 'next/server';
import { requirePartner } from '@/lib/session';
import { asUser } from '@/lib/db';
import { audit } from '@/lib/audit';
import { fileName, makePdf, prepareReport, readParams } from '@/lib/org-report-run';
import { toCsv } from '@/lib/org-report';

export const dynamic = 'force-dynamic';

/** Downloads the report as a PDF, or the same figures as a CSV. Each download is recorded against the organisation. */
export async function GET(req: NextRequest) {
  const me = await requirePartner();
  const sp = req.nextUrl.searchParams;
  const p = readParams((k) => sp.get(k));
  const format = sp.get('f') === 'csv' ? 'csv' : 'pdf';
  let body: BodyInit, title: string, org: string | undefined, ids: string[];
  if (format === 'csv') {
    const r = await prepareReport(me, p);
    body = toCsv(r.model); title = r.title; ids = r.chosen.map((c) => c.id);
  } else {
    const r = await makePdf(me, p);
    body = Buffer.from(r.bytes); title = r.title; ids = r.chosen.map((c) => c.id);
  }
  if (!ids.length) return new Response('No cohorts to report on.', { status: 404 });
  const orgId = me.orgIds?.[0];
  if (orgId && !me.preview) {
    await asUser(me.id, (q) => q(
      `insert into report_exports(organisation_id,created_by,title,cohort_ids,sections,format,action,status) values($1,$2,$3,$4,$5,$6,'download','downloaded')`,
      [orgId, me.id, title, ids, p.sections, format])).catch((e) => console.error('[report_exports]', e));
  }
  await audit(me.id, `downloaded ${format} report`, 'report_exports');
  return new Response(body, { headers: {
    'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/pdf',
    'Content-Disposition': `attachment; filename="${fileName(title, format)}"`, 'Cache-Control': 'private, no-store',
  } });
}
