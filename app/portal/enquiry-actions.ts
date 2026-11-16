'use server';
import { revalidatePath } from 'next/cache';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { sendEnquiryAck } from '@/lib/enquiry';

/** Set an enquiry aside (spam, duplicate or not a fit) without creating an account. */
export async function dismissEnquiry(f: FormData) {
  const me = await requireMe('founder');
  const id = String(f.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await asUser(me.id, (q) => q("update web_enquiries set status='dismissed', handled_by=$2, handled_at=now() where id=$1 and status='new'", [id, me.id]));
  await audit(me.id, 'set aside a website enquiry', 'web_enquiries');
  revalidatePath('/portal', 'layout');
}

/** Try the acknowledgement email again for one enquiry. */
export async function resendAck(f: FormData) {
  const me = await requireMe('founder');
  const id = String(f.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await sendEnquiryAck(id);
  await audit(me.id, 'resent a website enquiry acknowledgement', 'web_enquiries');
  revalidatePath('/portal/enquiries');
}
