import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { asAdmin, asUser } from '@/lib/db';
import { getMe } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { photosEnabled } from '@/lib/stories';
import { RECEIPT_BUCKET, MAX_RECEIPTS } from '@/lib/receipts';

export const runtime = 'nodejs';
export const maxDuration = 30;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Attach a receipt (photo or PDF) to an expense record. The person who made the record, or a founder. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return bad('Please sign in again.', 401);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return bad('Record not found.', 404);
  if (!(await photosEnabled())) return bad('Receipt upload works on the live portal only.', 501);
  const row = (await asUser(me.id, (q) => q('select requester_id, status from expense_requests where id=$1', [id])))[0];
  if (!row) return bad('Record not found.', 404);
  if (row.requester_id !== me.id && !me.roles.includes('founder')) return bad('Only the person who made this record, or a founder, can add a receipt.', 403);
  if (row.status === 'reconciled') return bad('This record is already reconciled.', 409);

  let file: File | null = null;
  try { const f = (await req.formData()).get('file'); if (f && typeof f !== 'string') file = f as File; } catch { return bad('We could not read that file.'); }
  if (!file || file.size === 0) return bad('Choose a photo or PDF of the receipt first.');
  if (file.size > 3_000_000) return bad('That file is too large (limit 3 MB). Take the photo again at a lower size.');
  const have = Number((await asAdmin((q) => q('select count(*)::int n from expense_receipts where request_id=$1', [id])))[0].n);
  if (have >= MAX_RECEIPTS) return bad(`Up to ${MAX_RECEIPTS} receipts per record.`);

  const buf = Buffer.from(await file.arrayBuffer());
  let data: Buffer, kind: 'image' | 'pdf', ext: string, type: string;
  if (buf.subarray(0, 4).toString() === '%PDF') { data = buf; kind = 'pdf'; ext = 'pdf'; type = 'application/pdf'; }
  else {
    try {
      const sharp = (await import('sharp')).default;
      data = await sharp(buf, { limitInputPixels: 60_000_000 }).rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    } catch { return bad('That file does not look like a photo or PDF.'); }
    kind = 'image'; ext = 'jpg'; type = 'image/jpeg';
  }
  const path = `${id}/${randomUUID()}.${ext}`;
  const up = await supabaseAdmin().storage.from(RECEIPT_BUCKET).upload(path, data, { contentType: type, upsert: false });
  if (up.error) { console.error('[receipt upload]', up.error.message); return bad('We could not store the receipt. Please try again.', 502); }
  try { await asAdmin((q) => q('insert into expense_receipts(request_id, storage_path, kind, uploaded_by) values ($1,$2,$3,$4)', [id, path, kind, me.id])); }
  catch (e) { console.error('[receipt row]', e); await supabaseAdmin().storage.from(RECEIPT_BUCKET).remove([path]).catch(() => {}); return bad('That receipt could not be saved.', 409); }
  return NextResponse.json({ ok: true });
}
