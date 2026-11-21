'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin } from '@/lib/db';
import { requireFeature } from '@/lib/access';
import { audit } from '@/lib/audit';

const P = '/portal/website';
const s = (f: FormData, k: string, n = 500) => String(f.get(k) ?? '').trim().replace(/[ \t]+/g, ' ').slice(0, n);
const go = (msg: string, kind: 'ok' | 'err'): never => redirect(`${P}?${kind}=${encodeURIComponent(msg)}`);

function fields(f: FormData) {
  const badge = s(f, 'badge', 80), heading = s(f, 'heading', 80), blurb = s(f, 'blurb', 500), date_note = s(f, 'date_note', 120);
  if (!badge || !heading || !blurb || !date_note) go('Fill in all four lines of the card: label, heading, description and dates.', 'err');
  if (/<|>/.test(badge + heading + blurb + date_note)) go('Please write plain text only, without angle brackets.', 'err');
  return { badge, heading, blurb, date_note };
}

/** Saves the wording. A published card changes on the website as soon as this is saved. */
export async function saveListing(f: FormData) {
  const me = await requireFeature('website', 'edit');
  const id = s(f, 'id', 40), v = fields(f);
  await asAdmin((q) => q('update website_listings set badge=$2, heading=$3, blurb=$4, date_note=$5, updated_at=now() where id=$1', [id, v.badge, v.heading, v.blurb, v.date_note]));
  await audit(me.id, 'website listing edited', 'website_listings');
  revalidatePath(P);
  go('Saved.', 'ok');
}

export async function publishListing(f: FormData) {
  const me = await requireFeature('website', 'edit');
  const id = s(f, 'id', 40), v = fields(f);
  await asAdmin((q) => q(`update website_listings set badge=$2, heading=$3, blurb=$4, date_note=$5, status='published', published_at=now(), updated_at=now() where id=$1`, [id, v.badge, v.heading, v.blurb, v.date_note]));
  await audit(me.id, 'website listing published', 'website_listings');
  revalidatePath(P);
  go('Published. It shows on the Join page within a minute.', 'ok');
}

export async function hideListing(f: FormData) {
  const me = await requireFeature('website', 'edit');
  await asAdmin((q) => q(`update website_listings set status='hidden', updated_at=now() where id=$1`, [s(f, 'id', 40)]));
  await audit(me.id, 'website listing hidden', 'website_listings');
  revalidatePath(P);
  go('Hidden. It is off the website; you can publish it again any time.', 'ok');
}

/** Rewrites the four lines from the cohort as it is now (dates, audience, venue). The listing stays in its current state. */
export async function refreshListing(f: FormData) {
  const me = await requireFeature('website', 'edit');
  const id = s(f, 'id', 40);
  const n = await asAdmin(async (q) => {
    const r = await q(`update website_listings l set badge=t.badge, heading=t.heading, blurb=t.blurb, date_note=t.date_note, starts_on=c.start_date, updated_at=now()
      from public.cohorts c, lateral app.listing_text(c) t where l.id=$1 and c.id=l.cohort_id returning l.id`, [id]);
    return r.length;
  });
  if (!n) go('This listing is not tied to a cohort, so there is nothing to refresh from.', 'err');
  await audit(me.id, 'website listing refreshed from cohort', 'website_listings');
  revalidatePath(P);
  go('Wording refreshed from the cohort. Check it, then save or publish.', 'ok');
}

/** A planned cohort that is not in the portal yet. It starts as a draft like any other. */
export async function addListing(f: FormData) {
  const me = await requireFeature('website', 'edit');
  const v = fields(f), starts = s(f, 'starts_on', 10);
  if (starts && !/^\d{4}-\d{2}-\d{2}$/.test(starts)) go('Choose the month as a date.', 'err');
  await asAdmin((q) => q(`insert into website_listings (badge, heading, blurb, date_note, starts_on) values ($1,$2,$3,$4,$5)`, [v.badge, v.heading, v.blurb, v.date_note, starts || null]));
  await audit(me.id, 'website listing added', 'website_listings');
  revalidatePath(P);
  go('Added as a draft. Publish it when you are ready.', 'ok');
}

/** Only listings that are not tied to a cohort can be deleted; a cohort's listing is hidden instead so it is not recreated by mistake. */
export async function deleteListing(f: FormData) {
  const me = await requireFeature('website', 'edit');
  const n = await asAdmin(async (q) => (await q('delete from website_listings where id=$1 and cohort_id is null returning id', [s(f, 'id', 40)])).length);
  if (!n) go('A cohort listing cannot be deleted; hide it instead.', 'err');
  await audit(me.id, 'website listing deleted', 'website_listings');
  revalidatePath(P);
  go('Deleted.', 'ok');
}
