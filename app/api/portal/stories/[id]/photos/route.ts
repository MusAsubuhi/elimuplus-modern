import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { asAdmin, asUser } from '@/lib/db';
import { getMe } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { BUCKET, MAX_PHOTOS, photosEnabled } from '@/lib/stories';

export const runtime = 'nodejs';
export const maxDuration = 30;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Add one photo to a story. The browser has already shrunk it; here it is re-encoded again with the camera's location and other
 * hidden data removed, then stored in a private bucket. One photo per request keeps uploads working on slow connections.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return bad('Please sign in again.', 401);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return bad('Story not found.', 404);
  if (!(await photosEnabled())) return bad('Photo upload works on the live portal. In this demo only the written story is kept.', 501);

  // anyone who may edit this story may add photos: the person, the trainer of the cohort, or a founder
  const story = (await asUser(me.id, (q) => q(
    `update participant_stories set updated_at = updated_at where id = $1 and status in ('submitted','declined')
       returning id, cohort_id, consent_photo`, [id]).catch(() => [])))[0];
  if (!story) return bad('This story is not open for changes, or it is not yours.', 403);
  if (!story.consent_photo) return bad('Photos were not agreed for this story.', 403);

  let file: File | null = null;
  let caption: string | null = null;
  try {
    const fd = await req.formData();
    const f = fd.get('file');
    if (f && typeof f !== 'string') file = f as File;
    caption = String(fd.get('caption') ?? '').trim().slice(0, 160) || null;
  } catch { return bad('We could not read that photo. Please try again.'); }
  if (!file || file.size === 0) return bad('Choose a photo first.');
  if (file.size > 3_500_000) return bad('That photo is too large. Try a smaller one or take it again.');

  const have = Number((await asAdmin((q) => q('select count(*)::int n from story_photos where story_id=$1', [id])))[0].n);
  if (have >= MAX_PHOTOS) return bad(`A story can have up to ${MAX_PHOTOS} photos.`);

  let out: { data: Buffer; info: { width: number; height: number; size: number } };
  try {
    const sharp = (await import('sharp')).default;
    out = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer({ resolveWithObject: true }) as any;
  } catch { return bad('That file does not look like a photo. Please choose a JPEG or PNG picture.'); }

  const path = `${story.cohort_id}/${id}/${randomUUID()}.jpg`;
  const up = await supabaseAdmin().storage.from(BUCKET).upload(path, out.data, { contentType: 'image/jpeg', upsert: false });
  if (up.error) { console.error('[story photo upload]', up.error.message); return bad('We could not store the photo. Please try again.', 502); }
  try {
    await asAdmin((q) => q(
      `insert into story_photos(story_id, storage_path, caption, cover, width, height, bytes, uploaded_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, path, caption, have === 0, out.info.width, out.info.height, out.info.size, me.id]));
  } catch (e) {
    console.error('[story photo row]', e);
    await supabaseAdmin().storage.from(BUCKET).remove([path]).catch(() => {});
    return bad('That photo could not be added to the story.', 409);
  }
  return NextResponse.json({ ok: true, count: have + 1 });
}
