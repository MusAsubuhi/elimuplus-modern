import { getMe } from '@/lib/session';
import { dbMode } from '@/lib/db';
import { MAX_PDF_BYTES, saveLocal } from '@/lib/learning';

export const dynamic = 'force-dynamic';

/** Demo only: the live portal sends files straight to private storage instead. Founders only. */
export async function POST(req: Request) {
  const me = await getMe();
  if (!me || !me.roles.includes('founder')) return new Response('Founders only.', { status: 403 });
  if ((await dbMode()) !== 'demo') return new Response('Not available.', { status: 404 });
  const form = await req.formData();
  const file = form.get('file'), p = String(form.get('path') ?? '');
  if (!(file instanceof File) || !p.startsWith('resources/')) return new Response('Bad request.', { status: 400 });
  if (file.size > MAX_PDF_BYTES) return new Response('Too large.', { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') return new Response('That is not a PDF.', { status: 400 });
  await saveLocal(p, bytes);
  return Response.json({ ok: true });
}
