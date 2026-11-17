'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UI } from '@/lib/feedback-options';

export default function FeedbackNudge({ snooze, lang = 'en' }: { snooze: () => void | Promise<void>; lang?: 'en' | 'sw' }) {
  const u = UI[lang];
  const path = usePathname();
  if (path.startsWith('/portal/feedback')) return null;
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-gold/40 bg-gold/15 px-5 py-2 text-sm text-teal">
      <span><b>{u.nudge}</b> {u.nudge2}</span>
      <span className="flex items-center gap-3">
        <Link href="/portal/feedback" className="rounded-md bg-teal px-3 py-1.5 text-xs font-black text-white">{u.give}</Link>
        <form action={snooze}><button className="text-xs font-bold underline">{u.later}</button></form>
      </span>
    </div>
  );
}
