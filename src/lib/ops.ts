// Small pure helpers and the "needs attention" counts shown on the Command view.
type Q = (sql: string, params?: any[]) => Promise<any[]>;
export type Recurrence = 'none' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export const todayEAT = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
/** The next due date after completing something that repeats. Month steps keep the day of month, clamped to the month end. */
export function nextDue(iso: string, rec: Recurrence): string | null {
  if (rec === 'none') return null;
  if (rec === 'weekly') return addDays(iso, 7);
  const [y, m, d] = iso.split('-').map(Number);
  const add = rec === 'monthly' ? 1 : rec === 'quarterly' ? 3 : 12;
  const t = m - 1 + add, ny = y + Math.floor(t / 12), nm = t % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
/** Chance a lead at each stage becomes a signed partner, used only to weight the pipeline. Edit to match what you see. */
export const STAGE_PROB: Record<string, number> = { new: 0.1, contacted: 0.2, meeting: 0.4, proposal: 0.6, negotiation: 0.8, won: 1, lost: 0 };
/** Straight-line book value of an asset today. */
export function bookValue(cost: number, purchased: string, lifeYears: number, on: string): number {
  if (!cost || !purchased || !lifeYears) return cost || 0;
  const months = Math.max(0, (Date.parse(on) - Date.parse(purchased)) / (86400000 * 30.4375));
  return Math.max(0, Math.round(cost - (cost / (lifeYears * 12)) * months));
}

export async function watch(q: Q) {
  const today = todayEAT(), soon = addDays(today, 14);
  const one = async (sql: string, p: any[] = []) => Number((await q(sql, p))[0]?.n ?? 0);
  return {
    complianceOverdue: await one(`select count(*)::int n from compliance_items where status='open' and due_on < $1`, [today]),
    complianceSoon: await one(`select count(*)::int n from compliance_items where status='open' and due_on between $1 and $2`, [today, soon]),
    complianceNoDate: await one(`select count(*)::int n from compliance_items where status='open' and due_on is null`),
    lowStock: await one(`select count(*)::int n from (select i.id from inventory_items i left join stock_movements m on m.item_id=i.id where i.kind='stock' and i.active and i.reorder_level > 0 group by i.id, i.reorder_level having coalesce(sum(m.delta),0) <= i.reorder_level) x`),
    followUps: await one(`select count(*)::int n from leads where stage not in ('won','lost') and next_on <= $1`, [today]),
    poApproval: await one(`select count(*)::int n from purchase_orders where status='draft'`),
    poLate: await one(`select count(*)::int n from purchase_orders where status in ('approved','sent','partly_received') and expected_on < $1`, [today]),
    incidents: await one(`select count(*)::int n from incidents where status='open'`),
    tasksDue: await one(`select count(*)::int n from ops_tasks where status='open' and due_on <= $1`, [today]),
    dataDue: await one(`select count(*)::int n from data_requests where status='open' and due_on <= $1`, [soon]),
  };
}
