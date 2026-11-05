import 'server-only';
import { supabaseAdmin } from './supabase-admin';
import { photosEnabled } from './stories';

export const SESSION_BUCKET = 'session-photos';
export const MAX_SESSION_PHOTOS = 5;

export interface SessionPhoto { id: string; cohort_id: string; day_number: number; storage_path: string; caption: string | null; status: string; uploaded_by: string | null }

/** Short-lived links. Callers must already have read the rows through the database, which applies who may see what. */
export async function signSessionPhotos(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length || !(await photosEnabled())) return {};
  const { data } = await supabaseAdmin().storage.from(SESSION_BUCKET).createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
  return out;
}

export async function loadPhotoBytes(path: string): Promise<Uint8Array | null> {
  if (!(await photosEnabled())) return null;
  const { data } = await supabaseAdmin().storage.from(SESSION_BUCKET).download(path);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}
