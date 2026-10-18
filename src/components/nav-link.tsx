'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Sidebar link that lights up softly when you are on that section, so you can always tell where you are. */
export default function NavLink({ href, icon, label, badge }: { href: string; icon: string; label: string; badge?: number }) {
  const path = usePathname() ?? '';
  const on = path === href || (href !== '/portal' && path.startsWith(href + '/'));
  return (
    <Link href={href} aria-current={on ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2 text-sm font-semibold transition-colors ${on ? 'border-gold bg-white/15 text-white' : 'border-transparent text-teal-50 hover:bg-white/10'}`}>
      <span className="w-4 text-center text-gold">{icon}</span>{label}
      {badge ? <span className="ml-auto rounded-full bg-gold px-2 text-[11px] font-bold text-teal">{badge}</span> : null}
    </Link>
  );
}
