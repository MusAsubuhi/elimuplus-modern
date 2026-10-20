import 'server-only';
import { createSign } from 'node:crypto';
import { asAdmin, dbMode } from './db';
import { supabaseAdmin } from './supabase-admin';

export const BACKUP_BUCKET = 'backups';
/** Other ventures share this database. Their tables are never read or copied here. */
const SKIP = /^(angaza_|contacts$|user_roles$)/;

/** Every Elimu+ table, found at run time so new tables are included without changing this file. Login credentials live in Supabase Auth and are not part of it. */
export async function exportAll(): Promise<{ json: string; tables: number; rows: number }> {
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), note: 'Elimu+ public tables. Excludes login credentials and other ventures’ tables.' };
  let rows = 0;
  const names = (await asAdmin((q) => q(`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`)))
    .map((r: any) => String(r.table_name)).filter((n) => /^[a-z0-9_]+$/.test(n) && !SKIP.test(n));
  for (const n of names) {
    const r = (await asAdmin((q) => q(`select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as j from public."${n}" t`)))[0].j as unknown[];
    out[n] = r; rows += r.length;
  }
  return { json: JSON.stringify(out), tables: names.length, rows };
}

/** Private bucket in Supabase Storage: "latest" is replaced each run, and the one before it is kept as "previous". */
export async function saveToStorage(json: string) {
  const sb = supabaseAdmin();
  await sb.storage.createBucket(BACKUP_BUCKET, { public: false }).catch(() => {}); // already exists is fine
  const bucket = sb.storage.from(BACKUP_BUCKET);
  const old = await bucket.download('latest.json');
  if (old.data) {
    const prev = await bucket.upload('previous.json', old.data, { upsert: true, contentType: 'application/json' });
    if (prev.error) throw new Error('could not keep the previous copy: ' + prev.error.message);
  }
  const up = await bucket.upload('latest.json', new Blob([json], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
  if (up.error) throw new Error('could not save the backup: ' + up.error.message);
  const check = await bucket.download('latest.json'); // read it back so a half-written file is noticed
  if (!check.data || check.data.size !== Buffer.byteLength(json)) throw new Error('the saved backup does not match what was exported');
}

export async function lastStorageBackup(): Promise<string | null> {
  try {
    if ((await dbMode()) !== 'pg') return null;
    const { data } = await supabaseAdmin().storage.from(BACKUP_BUCKET).list('', { search: 'latest.json', limit: 1 });
    return (data?.[0] as any)?.updated_at ?? (data?.[0] as any)?.created_at ?? null;
  } catch { return null; }
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/**
 * Optional copy in the founders' Google Drive. It replaces the contents of ONE existing file, so nothing piles up.
 * Needs GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_BACKUP_FILE_ID. Returns false when not set up yet.
 */
/** Accepts the key file pasted as JSON (optionally wrapped in quotes) or as base64. Errors describe the shape only, never the value. */
function readServiceAccount(raw: string): { client_email: string; private_key: string } {
  let t = raw.trim();
  if (!t.startsWith('{')) { try { const d = Buffer.from(t, 'base64').toString('utf8').trim(); if (d.startsWith('{')) t = d; } catch { /* fall through */ } }
  if (t.startsWith('"') && t.endsWith('"')) { try { t = JSON.parse(t); } catch { /* fall through */ } }
  let key: any;
  try { key = JSON.parse(t); } catch {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON is not the key file (${raw.trim().length} characters, starts with "${raw.trim().slice(0, 1)}"; the key file starts with "{" and is about 2,300 characters). Paste the whole downloaded .json file.`);
  }
  if (!key?.client_email || !key?.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is JSON but has no client_email or private_key; use the key file downloaded for the service account.');
  return key;
}

export async function saveToDrive(json: string): Promise<boolean> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON, fileId = process.env.GOOGLE_DRIVE_BACKUP_FILE_ID;
  if (!raw || !fileId) return false;
  const key = readServiceAccount(raw);
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3300 }));
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(key.private_key).toString('base64url');
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
  }).then((r) => r.json());
  if (!tok.access_token) throw new Error('Google sign-in failed: ' + (tok.error_description ?? tok.error ?? 'unknown'));
  const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true`, {
    method: 'PATCH', headers: { authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json' }, body: json,
  });
  if (!r.ok) throw new Error(`Google Drive refused the upload (${r.status}). Check the file is shared with the service account as Editor.`);
  return true;
}
