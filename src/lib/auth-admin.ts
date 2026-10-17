/**
 * Creating and resetting sign-ins through Supabase's official Auth admin API.
 *
 * This file is deliberately free of server-only and database imports so the logic can be tested
 * with fakes (scripts/test-auth-admin.mjs). accounts.ts wires in the real Supabase client and database.
 *
 * Why not write to auth.users directly? Supabase owns that schema and changes it between releases
 * (new columns, new identity rules, hashing changes). The admin API is the supported contract and
 * is covered by their compatibility promises.
 */

export interface AdminUser { id: string }
export interface AdminError { message: string; code?: string; status?: number }

/** The small slice of supabase.auth.admin that we use. */
export interface AuthAdmin {
  createUser(attrs: {
    email: string; password: string; email_confirm: boolean; user_metadata?: Record<string, unknown>;
  }): Promise<{ data: { user: AdminUser | null }; error: AdminError | null }>;
  updateUserById(id: string, attrs: {
    email?: string; password?: string; email_confirm?: boolean;
  }): Promise<{ data: { user: AdminUser | null }; error: AdminError | null }>;
  deleteUser(id: string): Promise<{ data: unknown; error: AdminError | null }>;
}

/** The small slice of our own database that provisioning needs. */
export interface PeopleStore {
  getAuthUserId(personId: string): Promise<string | null>;
  linkAuthUser(personId: string, authUserId: string): Promise<void>;
  requirePinChange(personId: string): Promise<void>;
}

const ALREADY_EXISTS = 'That phone number already has a sign-in.';

const isDuplicate = (e: AdminError) =>
  e.code === 'email_exists' || e.code === 'user_already_exists' || /already (been )?registered|already exists/i.test(e.message);

/**
 * Create (or reset) the sign-in for a person with a one-time PIN.
 * The caller decides who is allowed to do this; this function only does it.
 */
export async function provisionWithAdminApi(
  admin: AuthAdmin, store: PeopleStore, personId: string, email: string, pin: string,
): Promise<void> {
  const existing = await store.getAuthUserId(personId);

  if (existing) {
    // Reset: new PIN, and keep the synthetic email in step with the phone number.
    const { error } = await admin.updateUserById(existing, { email, password: pin, email_confirm: true });
    if (error) throw new Error(isDuplicate(error) ? ALREADY_EXISTS : `Could not reset the sign-in: ${error.message}`);
    await store.requirePinChange(personId);
    return;
  }

  const { data, error } = await admin.createUser({ email, password: pin, email_confirm: true });
  if (error || !data.user) {
    throw new Error(error && isDuplicate(error) ? ALREADY_EXISTS : `Could not create the sign-in: ${error?.message ?? 'no user returned'}`);
  }
  try {
    await store.linkAuthUser(personId, data.user.id);
    await store.requirePinChange(personId);
  } catch (e) {
    // Do not leave a login that points at nobody: remove it so the action can be retried cleanly.
    await admin.deleteUser(data.user.id).catch(() => {});
    throw e;
  }
}
