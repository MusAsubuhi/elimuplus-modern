import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Supabase client with the service role key. It bypasses row level security and can manage logins,
 * so it is only ever used on the server, for the narrow job of creating and resetting sign-ins.
 * Set SUPABASE_SERVICE_ROLE_KEY in Vercel's environment settings (never NEXT_PUBLIC_, never in the repo).
 */
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Sign-in management is not configured: SUPABASE_SERVICE_ROLE_KEY is missing.');
  client ??= createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return client;
}
