import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { PAID_FROM } from '@/lib/expense-labels';

export const dynamic = 'force-dynamic';
const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function GET() {
  const me = await requireMe('founder');
  await audit(me.id, 'download expenses csv', 'expense_requests');
  const rows = await asUser(me.id, (q) => q(`select r.*, p.display_name who, c.name cohort, k.name category,
      (select count(*)::int from expense_receipts x where x.request_id=r.id) receipts
      from expense_requests r join people p on p.id=r.requester_id left join cohorts c on c.id=r.cohort_id left join expense_categories k on k.id=r.category_id
      order by coalesce(r.spent_on, r.created_at::date) desc`));
  const head = ['Date spent', 'Recorded on', 'Who', 'What for', 'Category', 'Cohort', 'Paid from', 'Reference', 'Amount (KES)', 'Paid amount (KES)', 'Status', 'Late', 'Receipts', 'Reconciled on'];
  const body = rows.map((r: any) => [r.spent_on ? String(r.spent_on).slice(0, 10) : '', String(r.created_at).slice(0, 10), r.who, r.reason, r.category ?? 'Other', r.cohort ?? 'Running costs', PAID_FROM[r.paid_from] ?? r.paid_from, r.reference, r.amount_kes, r.paid_amount_kes, r.status, r.late ? 'yes' : '', r.receipts, r.reconciled_on ? String(r.reconciled_on).slice(0, 10) : ''].map(cell).join(','));
  return new Response([head.join(','), ...body].join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="elimu-expenses.csv"' } });
}
