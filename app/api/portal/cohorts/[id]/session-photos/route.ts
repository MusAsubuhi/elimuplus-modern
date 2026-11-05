import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { asAdmin, asUser } from '@/lib/db';
import { getMe } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { photosEnabled } from '@/lib/stories';
import { SESSION_BUCKET, MAX_SESSION_PHOTOS_PER_DAY } from '@/lib/session-photos';

export const runtime = 'nodejs';
export const maxDuration = 30;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Adds one session photo to a cohort. Trainers of the cohort and founders only; it waits for a founder to approve it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return bad('Please sign in again.', 401);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return bad('Cohort not found.', 404);
  if (!(await photosEnabled())) return bad('Photo upload works on the live portal only.', 501);
  const isFounder = me.roles.includes('founder');
  const mine = (await asUser(me.id, (q) => q('select 1 from cohort_facilitators where cohort_id=$1 and person_id=$2', [id, me.id])))[0];
  if (!isFounder && !mine) return bad('You are not a trainer on this cohort.', 403);

  let file: File | null = null, day = 0, caption: string | null = null, behind = false;
  try {
    const fd = await req.formData();
    const f = fd.get('file'); if (f && typeof f !== 'string') file = f as File;
    day = Number(fd.get('day')); caption = String(fd.get('caption') ?? '').trim().slice(0, 140) || null;
    behind = fd.get('behind') === 'on';
  } catch { return bad('We could not read that photo. Please try again.'); }
  if (!behind) return bad('Please confirm the photo was taken from behind or at a distance, with no faces identifiable.');
  if (!Number.isInteger(day) || day < 1 || day > 12) return bad('Choose which training day this is.');
  if (!file || file.size === 0) return bad('Choose a photo first.');
  if (file.size > 3_500_000) return bad('That photo is too large. Try a smaller one or take it again.');

  const have = Number((await asAdmin((q) => q('select count(*)::int n from session_photos where cohort_id=$1 and day_number=$2', [id, day])))[0].n);
  if (have >= MAX_SESSION_PHOTOS_PER_DAY) return bad(`Day ${day} already has ${MAX_SESSION_PHOTOS_PER_DAY} photos. Remove one first to add another.`);

  let out: { data: Buffer; info: { width: number; height: number; size: number } };
  try {
    const sharp = (await import('sharp')).default;
    out = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 60_000_000 })
      .rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true }).toBuffer({ resolveWithObject: true }) as any;
  } catch { return bad('That file does not look like a photo. Please choose a JPEG or PNG picture.'); }

  const path = `${id}/${randomUUID()}.jpg`;
  const up = await supabaseAdmin().storage.from(SESSION_BUCKET).upload(path, out.data, { contentType: 'image/jpeg', upsert: false });
  if (up.error) { console.error('[session photo upload]', up.error.message); return bad('We could not store the photo. Please try again.', 502); }
  try {
    await asAdmin((q) => q(
      `insert into session_photos(cohort_id, day_number, storage_path, caption, status, behind_confirmed, width, height, bytes, uploaded_by)
       values ($1,$2,$3,$4,$5,true,$6,$7,$8,$9)`,
      [id, day, path, caption, isFounder ? 'approved' : 'pending', out.info.width, out.info.height, out.info.size, me.id]));
  } catch (e) {
    console.error('[session photo row]', e);
    await supabaseAdmin().storage.from(SESSION_BUCKET).remove([path]).catch(() => {});
    return bad('That photo could not be added.', 409);
  }
  return NextResponse.json({ ok: true, pending: !isFounder });
}
