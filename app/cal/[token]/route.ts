import { asAdmin, asUser } from '@/lib/db';
import { FEED_TOKEN, loadCalendar } from '@/lib/calendar';
import { addDays, icsCalendar, isActive, trainingEvents } from '@/lib/calendar-core';
import { todayEAT } from '@/lib/format';

export const dynamic = 'force-dynamic';

const notFound = () => new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' } });

/**
 * A person's private phone calendar. Google Calendar and phone calendars cannot sign in, so the address itself is the key:
 * a long random token that only its owner can see and that they can replace at any time.
 * What the feed shows is exactly what that person sees in the portal, because it is read through the same access rules.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const raw = (await params).token;
  const token = raw.replace(/\.ics$/i, '');
  if (!FEED_TOKEN.test(token)) return notFound();

  const who = await asAdmin(async (q) => {
    const f = (await q('select person_id from calendar_feeds where token=$1', [token]))[0];
    if (!f) return null;
    // the address stops working when the person no longer has a training role
    const roles = await q(`select role from role_assignments where person_id=$1 and status='active' and (end_date is null or end_date >= current_date) and role in ('founder','facilitator')`, [f.person_id]);
    if (!roles.length) return null;
    await q('update calendar_feeds set last_read_at=now() where person_id=$1', [f.person_id]);
    return { id: f.person_id as string, founder: roles.some((r) => r.role === 'founder') };
  });
  if (!who) return notFound();

  const { trainings, clashes } = await asUser(who.id, (q) => loadCalendar(q, { founder: who.founder, meId: who.id }));
  const today = todayEAT();
  const from = addDays(today, -60), to = addDays(today, 550);
  const shown = trainings.filter((t) => isActive(t.status) || t.status === 'followup' || (t.end ?? '') >= from);
  const base = (process.env.PORTAL_URL || 'https://portal.elimuplus.com').replace(/\/$/, '');
  const body = icsCalendar(who.founder ? 'Elimu+ trainings' : 'My Elimu+ trainings', trainingEvents(shown, clashes, base).filter((e) => e.date >= from && e.date <= to));
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="elimu-trainings.ics"',
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
