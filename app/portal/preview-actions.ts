'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireMe, previewCookie } from '@/lib/session';

export async function startPartnerPreview(f: FormData) {
  await requireMe('founder');
  const org = String(f.get('org') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(org)) redirect('/portal/preview');
  (await cookies()).set(previewCookie, org, { httpOnly: true, sameSite: 'lax', secure: true, path: '/portal', maxAge: 60 * 60 * 4 });
  redirect(String(f.get('to') ?? '') || '/portal/partner');
}
export async function stopPartnerPreview() {
  await requireMe('founder');
  (await cookies()).delete(previewCookie);
  redirect('/portal/preview');
}
