import 'server-only';
import { supabaseAdmin } from './supabase-admin';
import { photosEnabled } from './stories';

export const RECEIPT_BUCKET = 'expense-receipts';
export const MAX_RECEIPTS = 4;

export async function signReceipts(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length || !(await photosEnabled())) return {};
  const { data } = await supabaseAdmin().storage.from(RECEIPT_BUCKET).createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
  return out;
}
