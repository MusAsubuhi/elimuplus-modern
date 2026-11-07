import 'server-only';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { dbMode } from './db';
import { supabaseAdmin } from './supabase-admin';

export const LEARN_BUCKET = 'learning';
export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export const TOPICS: Record<string, string> = {
  general: 'General', start: 'Getting started', portal: 'Using the portal', facilitation: 'Facilitation', follow_up: 'Follow-up visits',
  business: 'Business skills', finance: 'Money and finance', communication: 'Communication', leadership: 'Leadership',
  safeguarding: 'Safeguarding and consent', partners: 'Working with partners',
};
export const AUDIENCES: Record<string, string> = {
  master: 'Master trainers', facilitator: 'Facilitators', participant: 'Participants', org_admin: 'Partner organisation admins and viewers',
};
export const KIND_LABEL: Record<string, string> = { pdf: 'PDF', link: 'Link', video: 'Video' };

/** Founders see the lot. The row rules in the database decide everyone else; this only keeps the sort order sensible. */
export type Resource = {
  id: string; title: string; description: string | null; kind: 'pdf' | 'link' | 'video'; topic: string; url: string | null;
  storage_path: string | null; file_name: string | null; size_bytes: number | null; audience: string[]; required: boolean;
  due_on: string | null; status: string; sort_order: number; created_at: string;
};

/** The demo has no Supabase Storage, so files live in a temporary folder on the server. The live portal uses a private bucket. */
const demoDir = () => path.join(tmpdir(), 'elimu-learning-demo');

export async function prepareUpload(fileName: string): Promise<{ mode: 'supabase' | 'local'; path: string; token?: string }> {
  const clean = fileName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file.pdf';
  const p = `resources/${randomUUID()}/${clean}`;
  if ((await dbMode()) === 'demo') return { mode: 'local', path: p };
  const sb = supabaseAdmin();
  await sb.storage.createBucket(LEARN_BUCKET, { public: false }).catch(() => {}); // already there is fine
  const { data, error } = await sb.storage.from(LEARN_BUCKET).createSignedUploadUrl(p);
  if (error || !data) throw new Error(error?.message ?? 'Could not prepare the upload.');
  return { mode: 'supabase', path: data.path, token: data.token };
}

const safeLocal = (p: string) => path.join(demoDir(), p.replace(/\.\./g, ''));
export async function saveLocal(p: string, bytes: Uint8Array) { const f = safeLocal(p); await mkdir(path.dirname(f), { recursive: true }); await writeFile(f, bytes); }

export async function fileExists(p: string): Promise<boolean> {
  if ((await dbMode()) === 'demo') return readFile(safeLocal(p)).then(() => true, () => false);
  const dir = p.slice(0, p.lastIndexOf('/')), name = p.slice(p.lastIndexOf('/') + 1);
  const { data } = await supabaseAdmin().storage.from(LEARN_BUCKET).list(dir, { search: name, limit: 5 });
  return !!data?.some((f) => f.name === name);
}

/** Callers must already have read the resource row as the signed-in person, so the database has decided they may see it. */
export async function loadBytes(p: string): Promise<Uint8Array | null> {
  if ((await dbMode()) === 'demo') return readFile(safeLocal(p)).then((b) => new Uint8Array(b), () => null);
  const { data } = await supabaseAdmin().storage.from(LEARN_BUCKET).download(p);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

export async function removeFile(p: string) {
  if ((await dbMode()) === 'demo') { await rm(safeLocal(p), { force: true }); return; }
  await supabaseAdmin().storage.from(LEARN_BUCKET).remove([p]).catch(() => {});
}

/** Only web links, so a pasted link cannot run code. */
export function cleanUrl(raw: string): string | null {
  try { const u = new URL(raw.trim()); return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null; } catch { return null; }
}

/** YouTube and Vimeo links open inside the portal; everything else opens in a new tab. */
export function embedUrl(url: string): string | null {
  try {
    const u = new URL(url); const h = u.hostname.replace(/^www\./, '');
    if (h === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (h === 'youtube.com' || h === 'm.youtube.com') { const id = u.searchParams.get('v') ?? (u.pathname.startsWith('/embed/') ? u.pathname.split('/')[2] : u.pathname.startsWith('/shorts/') ? u.pathname.split('/')[2] : null); return id ? `https://www.youtube-nocookie.com/embed/${id}` : null; }
    if (h === 'vimeo.com') { const id = u.pathname.split('/').filter(Boolean)[0]; return /^\d+$/.test(id ?? '') ? `https://player.vimeo.com/video/${id}` : null; }
  } catch { /* not a link we can embed */ }
  return null;
}
