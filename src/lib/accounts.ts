import 'server-only';
import { randomInt } from 'node:crypto';
import { asAdmin, dbMode } from './db';
import { provisionWithAdminApi } from './auth-admin';
import { supabaseAdmin } from './supabase-admin';

/** Kenyan phone numbers in any common spelling -> local form 07XXXXXXXX / 01XXXXXXXX. Returns '' if it does not look like one. */
export function normPhone(raw: string): string {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('254') && d.length === 12) d = '0' + d.slice(3);
  else if (d.length === 9 && /^[71]/.test(d)) d = '0' + d;
  return /^0[17]\d{8}$/.test(d) ? d : '';
}
export const loginEmail = (phone: string) => `${normPhone(phone) || phone.replace(/\D/g, '')}@phone.elimuplus.app`;

/** Six digits: Supabase Auth needs at least six characters. */
export const tempPin = () => String(randomInt(100000, 1000000));

/**
 * Create (or reset) the sign-in for a person. Accounts are never created by the person themselves:
 * a founder does it, hands over a one-time PIN, and the person must choose their own at first sign-in.
 * Production goes through Supabase's official Auth admin API (see auth-admin.ts); it never writes to
 * the auth schema directly. Demo mode keeps its in-memory stand-in for auth.users.
 */
export async function provisionLogin(personId: string, phone: string, pin: string): Promise<void> {
  const email = loginEmail(phone);
  if ((await dbMode()) === 'demo') {
    await asAdmin(async (q) => {
      const existing = (await q('select auth_user_id from people where id=$1', [personId]))[0]?.auth_user_id;
      const aid = existing ?? (await q('insert into auth.users(id) values (gen_random_uuid()) returning id'))[0].id;
      await q('update people set auth_user_id=$2, pin_reset_required=true where id=$1', [personId, aid]);
    });
    return;
  }
  await provisionWithAdminApi(supabaseAdmin().auth.admin, {
    getAuthUserId: (id) => asAdmin(async (q) => (await q('select auth_user_id from people where id=$1', [id]))[0]?.auth_user_id ?? null),
    linkAuthUser: (id, authId) => asAdmin(async (q) => { await q('update people set auth_user_id=$2 where id=$1', [id, authId]); }),
    requirePinChange: (id) => asAdmin(async (q) => { await q('update people set pin_reset_required=true where id=$1', [id]); }),
  }, personId, email, pin);
}
