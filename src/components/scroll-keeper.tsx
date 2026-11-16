'use client';
import { useEffect } from 'react';

/** After a save the server redirects back to the same page, which makes the browser jump to the top. This puts the reader back where they were. */
export default function ScrollKeeper() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => { if (timer) clearInterval(timer); timer = undefined; };
    const onSubmit = () => {
      const y = window.scrollY, path = window.location.pathname;
      if (y < 120) return;
      stop();
      const started = Date.now();
      let restored = 0;
      timer = setInterval(() => {
        if (window.location.pathname !== path || Date.now() - started > 6000) return stop();
        if (window.scrollY < y - 80) { window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }); restored = Date.now(); }
        else if (restored && Date.now() - restored > 800) stop();
      }, 60);
    };
    const onUser = () => { stop(); };
    document.addEventListener('submit', onSubmit, true);
    window.addEventListener('wheel', onUser, { passive: true });
    window.addEventListener('touchmove', onUser, { passive: true });
    return () => { stop(); document.removeEventListener('submit', onSubmit, true); window.removeEventListener('wheel', onUser); window.removeEventListener('touchmove', onUser); };
  }, []);
  return null;
}
