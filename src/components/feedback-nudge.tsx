'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function FeedbackNudge({ snooze }: { snooze: () => void | Promise<void> }) {
  const path = usePathname();
  if (path.startsWith('/portal/feedback')) return null;
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-gold/40 bg-gold/15 px-5 py-2 text-sm text-teal">
      <span><b>Two minutes, five taps.</b> Tell us how the portal is working for you. Your answers are only ever shown to us as totals.</span>
      <span className="flex items-center gap-3">
        <Link href="/portal/feedback" className="rounded-md bg-teal px-3 py-1.5 text-xs font-black text-white">Give feedback</Link>
        <form action={snooze}><button className="text-xs font-bold underline">Not now</button></form>
      </span>
    </div>
  );
}
