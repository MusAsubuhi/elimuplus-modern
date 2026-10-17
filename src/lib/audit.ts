import 'server-only';
import { asUser } from './db';

/** Founders reading money, welfare or support data leaves a trace. */
export async function audit(personId: string, action: string, table?: string) {
  try { await asUser(personId, (q) => q('insert into audit_log(actor_id, action, table_name) values ($1,$2,$3)', [personId, action, table ?? null])); } catch { /* never block a page on audit */ }
}
