'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export type NavItem = { href: string; label: string; icon: string; badge?: number };
export type NavGroup = { title: string; items: NavItem[] };

const isOn = (path: string, href: string) => path === href || (href !== '/portal' && path.startsWith(href + '/'));

/** Phones: a menu button that slides the sections in from the left. Tablets and computers do not show it. */
export function MobileMenu({ groups, label }: { groups: NavGroup[]; label: string }) {
  const path = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', esc);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [open]);
  return (
    <div className="md:hidden">
      <button type="button" aria-label={label} aria-expanded={open} aria-controls="portal-drawer" onClick={() => setOpen(true)}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-2xl text-white hover:bg-white/10">☰</button>
      <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
        <div onClick={() => setOpen(false)} className={`absolute inset-0 bg-black/50 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} />
        <aside id="portal-drawer" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false); }}
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-teal px-3 pb-8 pt-4 text-white shadow-xl transition-transform ${open ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="mb-3 flex justify-end"><button type="button" aria-label="Close" onClick={() => setOpen(false)} className="h-10 w-10 rounded-lg text-xl hover:bg-white/10">✕</button></div>
          {groups.map((g) => (
            <div key={g.title} className="mb-4">
              <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-teal-100/70">{g.title}</div>
              {g.items.map((i) => (
                <Link key={i.href} href={i.href} aria-current={isOn(path, i.href) ? 'page' : undefined} tabIndex={open ? 0 : -1}
                  className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-3 text-sm font-semibold ${isOn(path, i.href) ? 'border-gold bg-white/15' : 'border-transparent text-teal-50 hover:bg-white/10'}`}>
                  <span className="w-4 text-center text-gold">{i.icon}</span>{i.label}
                  {i.badge ? <span className="ml-auto rounded-full bg-gold px-2 text-[11px] font-bold text-teal">{i.badge}</span> : null}
                </Link>
              ))}
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

/** Tablets and computers: the sections sit along the top. One group shows its links directly; several groups become drop-down menus. */
export function TopNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname() ?? '';
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setOpenIdx(null), [path]);
  useEffect(() => {
    const click = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpenIdx(null); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpenIdx(null);
    document.addEventListener('mousedown', click); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', esc); };
  }, []);
  const link = (i: NavItem) => (
    <Link key={i.href} href={i.href} aria-current={isOn(path, i.href) ? 'page' : undefined}
      className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${isOn(path, i.href) ? 'bg-white/15 text-white' : 'text-teal-50 hover:bg-white/10'}`}>
      <span className="text-gold">{i.icon}</span>{i.label}
      {i.badge ? <span className="rounded-full bg-gold px-2 text-[11px] font-bold text-teal">{i.badge}</span> : null}
    </Link>
  );
  if (groups.length === 1) return <nav className="hidden flex-wrap gap-1 md:flex">{groups[0].items.map(link)}</nav>;
  return (
    <nav ref={box} className="hidden flex-wrap gap-1 md:flex">
      {groups.map((g, n) => {
        const active = g.items.some((i) => isOn(path, i.href));
        const badge = g.items.reduce((a, i) => a + (i.badge ?? 0), 0);
        return (
          <div key={g.title} className="relative">
            <button type="button" aria-haspopup="true" aria-expanded={openIdx === n} onClick={() => setOpenIdx(openIdx === n ? null : n)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold ${active || openIdx === n ? 'bg-white/15 text-white' : 'text-teal-50 hover:bg-white/10'}`}>
              {g.title}{badge ? <span className="rounded-full bg-gold px-2 text-[11px] text-teal">{badge}</span> : null}<span className="text-[10px] text-gold">▾</span>
            </button>
            {openIdx === n && (
              <div className="absolute left-0 top-full z-40 mt-1 min-w-60 rounded-xl border border-teal-100 bg-teal p-2 shadow-xl">
                {g.items.map(link)}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
