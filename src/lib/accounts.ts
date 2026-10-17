import 'server-only';
import { randomInt } from 'node:crypto';
import { asAdmin, dbMode, type Q } from './db';

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
 * Production writes the same rows Supabase Auth itself writes for an email + password user.
 */
export async function provisionLogin(personId: string, phone: string, pin: string): Promise<void> {
  const email = loginEmail(phone);
  if ((await dbMode()) === 'demo') {
    await asAdmin(async (q) => {
      await q('insert into auth.users(id) values ($1) on conflict do nothing', [personId]);
      await q('update people set auth_user_id=id, pin_reset_required=true where id=$1', [personId]);
    });
    return;
  }
  await asAdmin(async (q: Q) => {
    const person = (await q('select auth_user_id from people where id=$1', [personId]))[0];
    if (person?.auth_user_id) {
      await q("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')), email=$3, updated_at=now() where id=$1", [person.auth_user_id, pin, email]);
      await q("update auth.identities set email=$2, identity_data = identity_data || jsonb_build_object('email', $2::text) where user_id=$1 and provider='email'", [person.auth_user_id, email]);
    } else {
      const taken = await q('select 1 from auth.users where email=$1', [email]);
      if (taken.length) throw new Error('That phone number already has a sign-in.');
      const u = (await q(
        `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,
           created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,is_sso_user,is_anonymous)
         values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated', $1,
           extensions.crypt($2, extensions.gen_salt('bf')), now(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{"email_verified":true}'::jsonb, now(), now(), '', '', '', '', false, false)
         returning id`, [email, pin]))[0];
      await q(
        `insert into auth.identities(id,user_id,identity_data,provider,provider_id,last_sign_in_at,created_at,updated_at)
         values (gen_random_uuid(), $1, jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', false, 'phone_verified', false), 'email', $1::text, now(), now(), now())`,
        [u.id, email]);
      await q('update people set auth_user_id=$2 where id=$1', [personId, u.id]);
    }
    await q('update people set pin_reset_required=true where id=$1', [personId]);
  });
}
