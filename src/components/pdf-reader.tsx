'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'pdfjs-dist/web/pdf_viewer.css';
import { completeFromReader, uncompleteFromReader } from '../../app/portal/learn-actions';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Outline = { title: string; dest: any; items: Outline[] };
type Hit = { page: number; snippet: string };

let pdfjsPromise: Promise<any> | null = null;
function loadPdfjs() {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((m: any) => {
    m.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
    return m;
  });
  return pdfjsPromise;
}

/** One page: the picture, a faint watermark with the reader's name, and an invisible text layer so search can highlight. */
function PageView({ pdf, num, scale, w, h, wm, query, render }: { pdf: any; num: number; scale: number; w: number; h: number; wm: string; query: string; render: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(0);

  useEffect(() => {
    const c = canvasRef.current, tdiv = textRef.current;
    if (!c || !tdiv) return;
    if (!render) { c.width = 0; c.height = 0; tdiv.replaceChildren(); setDrawn(0); return; }
    let cancelled = false, task: any = null, layer: any = null;
    (async () => {
      const pdfjs = await loadPdfjs();
      const page = await pdf.getPage(num);
      const vp = page.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr);
      c.style.width = `${vp.width}px`; c.style.height = `${vp.height}px`;
      const ctx = c.getContext('2d')!;
      task = page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      await task.promise;
      if (cancelled) return;
      // faint diagonal watermark baked into the page picture
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.globalAlpha = 0.07; ctx.fillStyle = '#0D3B3B';
      ctx.font = `600 ${Math.max(13, vp.width / 38)}px Inter, Arial, sans-serif`;
      ctx.translate(vp.width / 2, vp.height / 2); ctx.rotate(-Math.PI / 6);
      const step = Math.max(90, vp.width / 5);
      for (let y = -vp.height; y < vp.height; y += step) for (let x = -vp.width * 1.2; x < vp.width * 1.2; x += step * 3.2) ctx.fillText(wm, x + ((y / step) % 2 ? step * 1.6 : 0), y);
      ctx.restore();
      tdiv.replaceChildren();
      tdiv.style.setProperty('--scale-factor', String(scale));
      tdiv.style.setProperty('--total-scale-factor', String(scale));
      layer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: tdiv, viewport: vp });
      await layer.render();
      if (!cancelled) setDrawn((n) => n + 1);
    })().catch(() => { /* cancelled renders end here */ });
    return () => { cancelled = true; try { task?.cancel(); } catch { /* already done */ } try { layer?.cancel(); } catch { /* already done */ } };
  }, [pdf, num, scale, render, wm]);

  useEffect(() => {
    const tdiv = textRef.current; if (!tdiv) return;
    const q = query.trim().toLowerCase();
    // text arrives in small pieces, so match across the whole line of text and mark every piece a match touches
    const spans = Array.from(tdiv.querySelectorAll<HTMLElement>('span:not(.markedContent)')).filter((sp) => sp.children.length === 0);
    spans.forEach((sp) => sp.classList.remove('reader-hit'));
    if (q.length < 2) return;
    let all = ''; const ranges = spans.map((sp) => { const a = all.length; all += (sp.textContent ?? '').toLowerCase(); return [a, all.length] as const; });
    let at = all.indexOf(q);
    while (at >= 0) { ranges.forEach(([a, b], i) => { if (b > at && a < at + q.length) spans[i].classList.add('reader-hit'); }); at = all.indexOf(q, at + q.length); }
  }, [query, drawn]);

  return (
    <div className="relative mx-auto bg-white shadow-md" style={{ width: w, height: h }} data-page={num}>
      <canvas ref={canvasRef} className="block" />
      <div ref={textRef} className="textLayer" />
    </div>
  );
}

function Contents({ items, go, depth = 0 }: { items: Outline[]; go: (o: Outline) => void; depth?: number }) {
  return (
    <ul className={depth ? 'ml-3 border-l border-teal-100 pl-2' : ''}>
      {items.map((o, i) => (
        <li key={i}>
          <button onClick={() => go(o)} className="block w-full rounded px-2 py-1 text-left text-sm text-teal hover:bg-teal-50" style={{ fontWeight: depth ? 400 : 700 }}>{o.title}</button>
          {o.items?.length > 0 && <Contents items={o.items} go={go} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

export default function PdfReader({ src, id, title, watermark, initialDone, required }: { src: string; id: string; title: string; watermark: string; initialDone: boolean; required: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [err, setErr] = useState('');
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<'scroll' | 'pages'>('scroll');
  const [cur, setCur] = useState(1);
  const [maxSeen, setMaxSeen] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [side, setSide] = useState<'' | 'contents' | 'search'>('');
  const [outline, setOutline] = useState<Outline[] | null>(null);
  const [texts, setTexts] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [hitIdx, setHitIdx] = useState(0);
  const [done, setDone] = useState(initialDone);
  const [busy, setBusy] = useState(false);
  const [full, setFull] = useState(false);
  const [dir, setDir] = useState(1);
  const n = sizes.length;

  // load the document
  useEffect(() => {
    let dead = false, doc: any = null;
    (async () => {
      const pdfjs = await loadPdfjs();
      doc = await pdfjs.getDocument({ url: src, withCredentials: true, disableRange: true, disableStream: true, isEvalSupported: false }).promise;
      if (dead) return;
      const sz: { w: number; h: number }[] = [];
      for (let i = 1; i <= doc.numPages; i++) { const vp = (await doc.getPage(i)).getViewport({ scale: 1 }); sz.push({ w: vp.width, h: vp.height }); }
      if (dead) return;
      setSizes(sz); setPdf(doc);
      doc.getOutline().then((o: Outline[] | null) => !dead && setOutline(o && o.length ? o : [])).catch(() => setOutline([]));
      // read the text of every page in the background so search is instant
      const t: string[] = [];
      for (let i = 1; i <= doc.numPages && !dead; i++) {
        const tc = await (await doc.getPage(i)).getTextContent();
        t.push(tc.items.map((x: any) => x.str + (x.hasEOL ? ' ' : '')).join('').replace(/\s+/g, ' '));
        if (i % 5 === 0 || i === doc.numPages) setTexts([...t]);
      }
    })().catch(() => !dead && setErr('This document could not be opened. Please try again, or ask a founder to check it.'));
    return () => { dead = true; try { doc?.destroy(); } catch { /* closing */ } };
  }, [src]);

  // fit to the available width
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [pdf]);

  const scaleOf = useCallback((i: number) => Math.max(0.2, ((width - 32) / (sizes[i]?.w || 600)) * zoom), [width, sizes, zoom]);
  const dims = useMemo(() => sizes.map((s, i) => ({ w: s.w * scaleOf(i), h: s.h * scaleOf(i) })), [sizes, scaleOf]);

  const goTo = useCallback((p: number, smooth = true) => {
    const page = Math.min(Math.max(1, p), n || 1);
    setDir(page >= cur ? 1 : -1);
    setCur(page); setPageInput(String(page));
    if (mode === 'scroll') {
      const el = scroller.current?.querySelector(`[data-page="${page}"]`) as HTMLElement | null;
      if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop - 12, behavior: smooth ? 'smooth' : 'auto' });
    } else scroller.current?.scrollTo({ top: 0 });
  }, [n, cur, mode]);

  useEffect(() => { setMaxSeen((m) => Math.max(m, cur)); }, [cur]);

  // which page is in view while scrolling
  useEffect(() => {
    const el = scroller.current; if (!el || mode !== 'scroll' || !n) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = el.scrollTop + el.clientHeight * 0.35;
        let best = 1;
        el.querySelectorAll<HTMLElement>('[data-page]').forEach((p) => { if (p.offsetTop <= mid) best = Number(p.dataset.page); });
        setCur(best); setPageInput(String(best));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [mode, n]);

  // keyboard: arrows flip pages in page mode; "/" opens search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!wrap.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      if (e.key === '/') { e.preventDefault(); setSide('search'); setTimeout(() => (document.getElementById('reader-q') as HTMLInputElement | null)?.focus(), 30); }
      if (mode === 'pages') { if (e.key === 'ArrowRight' || e.key === 'PageDown') goTo(cur + 1); if (e.key === 'ArrowLeft' || e.key === 'PageUp') goTo(cur - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, cur, goTo]);

  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);

  // search results
  const hits: Hit[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const out: Hit[] = [];
    texts.forEach((t, i) => {
      const low = t.toLowerCase(); let from = 0, k = 0;
      while (k < 3) { const at = low.indexOf(term, from); if (at < 0) break; const a = Math.max(0, at - 40); out.push({ page: i + 1, snippet: `${a > 0 ? '…' : ''}${t.slice(a, at + term.length + 60)}…` }); from = at + term.length; k++; }
    });
    return out;
  }, [q, texts]);
  useEffect(() => { setHitIdx(0); }, [q]);
  const stepHit = (d: number) => { if (!hits.length) return; const i = (hitIdx + d + hits.length) % hits.length; setHitIdx(i); goTo(hits[i].page); };

  const openOutline = async (o: Outline) => {
    try {
      const dest = typeof o.dest === 'string' ? await pdf.getDestination(o.dest) : o.dest;
      if (!dest) return;
      const idx = typeof dest[0] === 'object' ? await pdf.getPageIndex(dest[0]) : Number(dest[0]);
      goTo(idx + 1); if (window.innerWidth < 768) setSide('');
    } catch { /* a contents entry that points nowhere */ }
  };

  const finish = async (value: boolean) => {
    setBusy(true);
    try {
      if (value) { if (await completeFromReader(id)) setDone(true); }
      else if (await uncompleteFromReader(id)) setDone(false);
    } finally { setBusy(false); }
  };
  const canFinish = !required || maxSeen >= n;

  // pages near the one being read are drawn; the rest are cleared to save memory
  const near = (p: number) => (mode === 'pages' ? p === cur : Math.abs(p - cur) <= 3);

  // swipe to flip in page mode
  const touch = useRef<number | null>(null);

  if (err) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{err}</div>;

  const btn = 'rounded-md border border-teal-100 bg-white px-2.5 py-1.5 text-xs font-bold text-teal hover:bg-teal-50 disabled:opacity-40';
  return (
    <>
    <div ref={wrap} className="reader overflow-hidden rounded-xl border border-teal-100 bg-[#e9eeec] shadow-sm" onContextMenu={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}>
      <style>{`.reader,.reader *{-webkit-user-select:none;user-select:none}.reader .reader-hit{background:rgba(255,200,0,.5);border-radius:2px}.reader .textLayer{opacity:1;mix-blend-mode:multiply}.reader .textLayer span{color:transparent}
        @keyframes flipR{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:none}}@keyframes flipL{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:none}}
        @media print{.reader{display:none!important}}`}</style>
      <div className="flex flex-wrap items-center gap-2 border-b border-teal-100 bg-white px-3 py-2">
        <button className={btn} onClick={() => setSide(side === 'contents' ? '' : 'contents')} aria-pressed={side === 'contents'}>Contents</button>
        <button className={btn} onClick={() => { setSide(side === 'search' ? '' : 'search'); setTimeout(() => (document.getElementById('reader-q') as HTMLInputElement | null)?.focus(), 30); }} aria-pressed={side === 'search'}>Search</button>
        <span className="mx-1 hidden h-5 w-px bg-teal-100 sm:block" />
        <button className={btn} onClick={() => goTo(cur - 1)} disabled={cur <= 1} aria-label="Previous page">‹</button>
        <form onSubmit={(e) => { e.preventDefault(); const v = parseInt(pageInput, 10); if (v) goTo(v); }} className="flex items-center gap-1 text-xs text-slate-600">
          <input value={pageInput} onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))} className="w-12 rounded-md border border-teal-100 px-1.5 py-1 text-center text-sm" aria-label="Page number" /> of {n || '…'}
        </form>
        <button className={btn} onClick={() => goTo(cur + 1)} disabled={cur >= n} aria-label="Next page">›</button>
        <span className="mx-1 hidden h-5 w-px bg-teal-100 sm:block" />
        <button className={btn} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} aria-label="Zoom out">−</button>
        <button className={btn} onClick={() => setZoom(1)} aria-label="Fit to width">Fit</button>
        <button className={btn} onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} aria-label="Zoom in">+</button>
        <button className={btn} onClick={() => { setMode(mode === 'scroll' ? 'pages' : 'scroll'); setTimeout(() => goTo(cur, false), 60); }}>{mode === 'scroll' ? 'Page by page' : 'Scroll'}</button>
        <button className={btn} onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen?.())}>{full ? 'Exit full screen' : 'Full screen'}</button>
        <span className="ml-auto flex items-center gap-2">
          {done ? <><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Done ✓</span><button className="text-xs text-slate-500 underline" disabled={busy} onClick={() => finish(false)}>Undo</button></>
            : <button disabled={busy || !canFinish || !n} onClick={() => finish(true)} title={canFinish ? '' : 'Read to the last page to finish this one'} className="rounded-md bg-teal px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{canFinish ? 'I have read this' : `Read to page ${n} to finish`}</button>}
        </span>
      </div>

      <div className="relative flex" style={{ height: full ? '100vh' : 'min(78vh, 900px)' }}>
        {side && (
          <aside className="absolute inset-y-0 left-0 z-20 w-72 max-w-[85%] overflow-y-auto border-r border-teal-100 bg-white p-3 shadow-lg md:static md:max-w-none md:shadow-none">
            {side === 'contents' && (
              <>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Contents</h3>
                {outline === null ? <p className="text-sm text-slate-500">Loading…</p>
                  : outline.length ? <Contents items={outline} go={openOutline} />
                  : <p className="text-sm text-slate-500">This document has no contents list. Use the page box above, or search.</p>}
              </>
            )}
            {side === 'search' && (
              <>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Search this document</h3>
                <form onSubmit={(e) => { e.preventDefault(); stepHit(1); }} className="flex gap-1">
                  <input id="reader-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a word or phrase" className="min-w-0 flex-1 rounded-md border border-teal-100 px-2 py-1.5 text-sm" />
                  <button type="button" className={btn} onClick={() => stepHit(-1)} aria-label="Previous match">↑</button>
                  <button type="button" className={btn} onClick={() => stepHit(1)} aria-label="Next match">↓</button>
                </form>
                <p className="mt-1 text-xs text-slate-500">{q.trim().length < 2 ? 'Type at least two letters.' : texts.length < n ? `${hits.length} found so far, still reading the document…` : hits.length ? `${hits.length} match${hits.length === 1 ? '' : 'es'}` : 'No matches.'}</p>
                <ul className="mt-2 space-y-1">
                  {hits.slice(0, 80).map((h, i) => (
                    <li key={i}><button onClick={() => { setHitIdx(i); goTo(h.page); if (window.innerWidth < 768) setSide(''); }} className={`block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-teal-50 ${i === hitIdx ? 'bg-gold-100' : ''}`}><b className="text-teal">Page {h.page}</b><br /><span className="text-slate-600">{h.snippet}</span></button></li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        )}
        <div ref={scroller} className="min-w-0 flex-1 overflow-auto px-2 py-3"
          onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => { if (mode !== 'pages' || touch.current === null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > 70) goTo(cur + (dx < 0 ? 1 : -1)); }}>
          {!pdf && <p className="p-8 text-center text-sm text-slate-600">Opening {title}…</p>}
          {pdf && mode === 'scroll' && dims.map((d, i) => (
            <div key={i} className="mb-3"><PageView pdf={pdf} num={i + 1} scale={scaleOf(i)} w={d.w} h={d.h} wm={watermark} query={q} render={near(i + 1)} /></div>
          ))}
          {pdf && mode === 'pages' && dims[cur - 1] && (
            <div key={cur} style={{ animation: `${dir >= 0 ? 'flipR' : 'flipL'} .22s ease-out` }}>
              <PageView pdf={pdf} num={cur} scale={scaleOf(cur - 1)} w={dims[cur - 1].w} h={dims[cur - 1].h} wm={watermark} query={q} render />
            </div>
          )}
        </div>
      </div>
    </div>
    <p className="hidden p-6 text-center text-sm print:block">Printing is turned off for documents in the learning center.</p>
    </>
  );
}
