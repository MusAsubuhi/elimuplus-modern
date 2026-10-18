'use server';
import { redirect } from 'next/navigation';
import { tokenOk, unsubscribe } from '@/lib/newsletter';

export async function confirmUnsubscribe(fd: FormData) {
  const email = String(fd.get('e') ?? '').trim().toLowerCase();
  const token = String(fd.get('t') ?? '');
  if (!email || !tokenOk(email, token)) redirect('/unsubscribe?bad=1');
  await unsubscribe(email, 'page');
  redirect('/unsubscribe?done=1');
}
