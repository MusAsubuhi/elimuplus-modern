import 'server-only';
import { supabaseAdmin } from './supabase-admin';
import { photosEnabled } from './stories';
import { SESSION_BUCKET } from './session-photos';

export async function removeSessionFiles(paths: string[]) {
  if (!paths.length || !(await photosEnabled())) return;
  await supabaseAdmin().storage.from(SESSION_BUCKET).remove(paths);
}
