import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Table } from '@/components/ui';
import { d } from '@/lib/format';

const ICON: Record<string, string> = { certificate: '🎓', attendance_list: '📋', report: '📊', invoice: '🧾', agreement: '📑', other: '📄' };

export default async function Library() {
  const me = await requireMe('org_admin');
  const { reports, docs } = await asUser(me.id, async (q) => ({
    reports: await q(`select r.*, o.name org_name from reports r join organisations o on o.id=r.organisation_id order by released_on desc nulls last`),
    docs: await q(`select dc.*, o.name org_name from documents dc left join organisations o on o.id=dc.organisation_id order by created_at desc`),
  }));
  return (
    <>
      <PageHeader image="/images/partner-process-meeting.jpg" title="Reports and documents" subtitle="Only reports we have reviewed and released to you appear here, marked with the confidentiality label from your agreement." />
      <div className="space-y-4">
        {reports.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><div className="text-xs font-bold uppercase text-slate-500">{r.type.replace('_', ' ')} · {r.period}</div>
                <h3 className="text-lg font-bold text-teal">{r.title}</h3><p className="mt-1 text-sm text-slate-600">{r.summary}</p></div>
              <div className="text-right text-xs"><Badge tone="green">released {d(r.released_on)}</Badge>{r.confidentiality_label && <div className="mt-1 font-bold text-[#C8553D]">{r.confidentiality_label}</div>}</div>
            </div>
          </Card>
        ))}
        {!reports.length && <Card>No released reports yet.</Card>}
      </div>
      <Card title="Documents" className="mt-4">
        <Table head={['', 'Document', 'Organisation', 'Added']} rows={docs.map((x) => [ICON[x.kind] ?? '📄', <b key="t">{x.title}</b>, x.org_name ?? '', d(x.created_at)])} empty="No documents shared yet." />
      </Card>
    </>
  );
}
