// Unit tests for provisionWithAdminApi using fakes. Run: npm run test:auth
import { provisionWithAdminApi } from '../src/lib/auth-admin.ts';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + m); };
const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

function rig({ existing = null, createErr = null, updateErr = null, linkFails = false } = {}) {
  const calls = [];
  const admin = {
    async createUser(a) { calls.push(['create', a]); return createErr ? { data: { user: null }, error: createErr } : { data: { user: { id: 'new-auth-id' } }, error: null }; },
    async updateUserById(id, a) { calls.push(['update', id, a]); return updateErr ? { data: { user: null }, error: updateErr } : { data: { user: { id } }, error: null }; },
    async deleteUser(id) { calls.push(['delete', id]); return { data: null, error: null }; },
  };
  const store = {
    async getAuthUserId() { return existing; },
    async linkAuthUser(p, a) { if (linkFails) throw new Error('db down'); calls.push(['link', p, a]); },
    async requirePinChange(p) { calls.push(['pinreset', p]); },
  };
  return { admin, store, calls };
}
const names = (c) => c.map((x) => x[0]).join(',');

{ const r = rig();
  await provisionWithAdminApi(r.admin, r.store, 'p1', '0712345678@phone.elimuplus.app', '123456');
  ok(names(r.calls) === 'create,link,pinreset', 'new person: create, link to profile, force PIN change');
  ok(r.calls[0][1].email_confirm === true && r.calls[0][1].password === '123456', 'new login is confirmed so a phone-only person can sign in at once');
  ok(r.calls[1][2] === 'new-auth-id', 'profile linked to the id Supabase returned'); }

{ const r = rig({ existing: 'old-id' });
  await provisionWithAdminApi(r.admin, r.store, 'p1', 'a@b.c', '654321');
  ok(names(r.calls) === 'update,pinreset', 'existing login: reset password, force PIN change, no second user');
  ok(r.calls[0][1] === 'old-id' && r.calls[0][2].password === '654321', 'reset targets the existing auth user'); }

{ const r = rig({ createErr: { message: 'A user with this email address has already been registered', code: 'email_exists', status: 422 } });
  const m = await rejects(() => provisionWithAdminApi(r.admin, r.store, 'p1', 'a@b.c', '123456'));
  ok(m === 'That phone number already has a sign-in.', 'duplicate phone gives the friendly message');
  ok(!names(r.calls).includes('link'), 'nothing linked when creation fails'); }

{ const r = rig({ createErr: { message: 'boom', status: 500 } });
  const m = await rejects(() => provisionWithAdminApi(r.admin, r.store, 'p1', 'a@b.c', '123456'));
  ok(/Could not create the sign-in: boom/.test(m), 'other creation errors surface with their reason'); }

{ const r = rig({ createErr: { message: 'Password should be at least 6 characters', code: 'weak_password', status: 422 } });
  const m = await rejects(() => provisionWithAdminApi(r.admin, r.store, 'p1', 'a@b.c', '123'));
  ok(/Could not create the sign-in: Password/.test(m), 'a weak PIN (also HTTP 422) is not mistaken for a duplicate phone'); }

{ const r = rig({ linkFails: true });
  const m = await rejects(() => provisionWithAdminApi(r.admin, r.store, 'p1', 'a@b.c', '123456'));
  ok(m === 'db down', 'database failure is reported');
  ok(r.calls.some((c) => c[0] === 'delete' && c[1] === 'new-auth-id'), 'orphan login is deleted so the action can be retried'); }

{ const r = rig({ existing: 'old-id', updateErr: { message: 'nope', status: 500 } });
  const m = await rejects(() => provisionWithAdminApi(r.admin, r.store, 'p1', 'a@b.c', '123456'));
  ok(/Could not reset the sign-in: nope/.test(m), 'reset errors surface');
  ok(!names(r.calls).includes('pinreset'), 'PIN-change flag not set when the reset failed'); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
