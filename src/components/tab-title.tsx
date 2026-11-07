'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { cardTitle, shareFor } from '@/lib/share-meta';

/** Keeps the browser tab named after the page, so people with many tabs open can tell them apart. */
export function TabTitle() {
  const path = usePathname();
  useEffect(() => { document.title = cardTitle(shareFor(path || '/portal')); }, [path]);
  return null;
}
