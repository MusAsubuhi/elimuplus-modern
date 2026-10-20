import 'server-only';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { REPORT_SECTIONS, hasData, takeaways, type Model, type Row } from './org-report';

const W = 595, H = 842, M = 48, CW = W - M * 2;
const TEAL = rgb(0.051, 0.231, 0.231), GOLD = rgb(0.831, 0.659, 0.263), GREEN = rgb(0.18, 0.545, 0.478), RED = rgb(0.784, 0.333, 0.239), BLUE = rgb(0.416, 0.549, 0.686);
const INK = rgb(0.1, 0.12, 0.12), GREY = rgb(0.45, 0.5, 0.5), LINE = rgb(0.85, 0.9, 0.89), PALE = rgb(0.94, 0.97, 0.96);
const SERIES = [TEAL, GOLD, GREEN, RED, BLUE];

/** Standard PDF fonts only cover Latin-1, so anything else is swapped for a plain equivalent rather than failing. */
const clean = (s: unknown) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
const day = (d: string | Date | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export interface PdfInput { title: string; org: string; model: Model; sections: string[]; confidentiality: string; preparedBy: string; generatedOn: Date; note?: string }

export async function renderReportPdf(inp: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(clean(inp.title)); doc.setAuthor('Elimu+'); doc.setCreator('Elimu+ portal');
  const reg = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage([W, H]); let y = H - M;
  const pages: PDFPage[] = [page];

  const newPage = () => { page = doc.addPage([W, H]); pages.push(page); y = H - M; };
  const need = (h: number) => { if (y - h < M + 24) newPage(); };
  const text = (t: string, x: number, yy: number, size = 10, font: PDFFont = reg, color = INK) => page.drawText(clean(t), { x, y: yy, size, font, color });
  const wrap = (t: string, size: number, width: number, font: PDFFont = reg) => {
    const words = clean(t).split(/\s+/), lines: string[] = []; let cur = '';
    for (const w of words) { const n = cur ? `${cur} ${w}` : w; if (font.widthOfTextAtSize(n, size) > width && cur) { lines.push(cur); cur = w; } else cur = n; }
    if (cur) lines.push(cur); return lines;
  };
  const para = (t: string, size = 10, color = INK, font: PDFFont = reg, indent = 0, gap = 4) => {
    for (const l of wrap(t, size, CW - indent, font)) { need(size + 4); text(l, M + indent, y - size, size, font, color); y -= size + 4; }
    y -= gap;
  };
  const h2 = (t: string) => { need(40); y -= 10; page.drawRectangle({ x: M, y: y - 3, width: 4, height: 18, color: GOLD }); text(t, M + 12, y, 14, bold, TEAL); y -= 24; };

  // ---- cover band
  page.drawRectangle({ x: 0, y: H - 150, width: W, height: 150, color: TEAL });
  text('ELIMU+', M, H - 56, 11, bold, GOLD);
  for (const [i, l] of wrap(inp.title, 22, CW, bold).slice(0, 2).entries()) text(l, M, H - 86 - i * 28, 22, bold, rgb(1, 1, 1));
  text(`${inp.org}  |  Prepared ${day(inp.generatedOn)}`, M, H - 138, 10, reg, rgb(0.85, 0.93, 0.92));
  y = H - 180;
  if (inp.note) { para(inp.note, 10.5, INK, reg, 0, 8); }
  para(`Cohorts included: ${inp.model.rows.map((r) => r.name).join(', ')}.`, 9.5, GREY);

  // ---- headline tiles
  const t = inp.model.total;
  const tiles: [string, string, string][] = [
    ['People trained', String(t.enrolled), `${t.completed} completed`],
    ['Completion', t.completion != null ? `${t.completion}%` : '-', 'of those enrolled'],
    ['Attendance', t.attendance != null ? `${t.attendance}%` : '-', 'average'],
    [t.stages[2].trading != null ? 'Trading at 90 days' : 'Trading at 30 days', String((t.stages[2].trading ?? t.stages[0].trading) ?? '-') + ((t.stages[2].trading ?? t.stages[0].trading) != null ? '%' : ''), 'of those reached'],
  ];
  need(70); const tw = (CW - 18) / 4;
  tiles.forEach(([a, b, c], i) => {
    const x = M + i * (tw + 6);
    page.drawRectangle({ x, y: y - 58, width: tw, height: 58, color: PALE, borderColor: LINE, borderWidth: 0.7 });
    page.drawRectangle({ x, y: y - 58, width: 3, height: 58, color: i % 2 ? GOLD : TEAL });
    text(a.toUpperCase(), x + 10, y - 14, 6.8, bold, GREY); text(b, x + 10, y - 38, 20, bold, INK); text(c, x + 10, y - 51, 7.5, reg, GREY);
  });
  y -= 76;

  // ---- charts and tables
  const bars = (cats: string[], series: { name: string; values: (number | null)[]; color: any }[], opt: { max?: number; suffix?: string; height?: number } = {}) => {
    const hgt = opt.height ?? 150, top = Math.max(1, opt.max ?? Math.max(...series.flatMap((s) => s.values.map((v) => v ?? 0)), 1));
    need(hgt + 60);
    const x0 = M + 34, x1 = M + CW, y0 = y - hgt - 6, plotH = hgt - 14;
    for (let i = 0; i <= 4; i++) {
      const gy = y0 + (plotH * i) / 4; page.drawLine({ start: { x: x0, y: gy }, end: { x: x1, y: gy }, thickness: 0.4, color: LINE });
      text(`${Math.round((top * i) / 4)}${opt.suffix ?? ''}`, M, gy - 3, 7, reg, GREY);
    }
    const gw = (x1 - x0) / cats.length, bw = Math.min(34, (gw - 14) / series.length);
    cats.forEach((c, ci) => {
      const gx = x0 + ci * gw + (gw - bw * series.length) / 2;
      series.forEach((s, si) => {
        const v = s.values[ci]; if (v == null) return;
        const bh = Math.max(0.5, (v / top) * plotH);
        page.drawRectangle({ x: gx + si * bw, y: y0, width: bw - 2, height: bh, color: s.color });
        text(`${v}${opt.suffix ?? ''}`, gx + si * bw + 1, y0 + bh + 3, 7, bold, INK);
      });
      const lab = wrap(c, 7.5, gw - 4, reg).slice(0, 2);
      lab.forEach((l, li) => text(l, x0 + ci * gw + (gw - reg.widthOfTextAtSize(l, 7.5)) / 2, y0 - 11 - li * 9, 7.5, reg, GREY));
    });
    let lx = x0;
    series.forEach((s) => { page.drawRectangle({ x: lx, y: y0 - 36, width: 8, height: 8, color: s.color }); text(s.name, lx + 12, y0 - 35, 8, reg, INK); lx += reg.widthOfTextAtSize(clean(s.name), 8) + 30; });
    y = y0 - 50;
  };
  const table = (head: string[], rows: string[][], widths: number[]) => {
    const rh = 17; need(rh * (rows.length + 1) + 10);
    const draw = (cells: string[], hd: boolean) => {
      need(rh); if (hd) page.drawRectangle({ x: M, y: y - rh + 4, width: CW, height: rh, color: TEAL });
      let x = M + 5;
      cells.forEach((c, i) => { const s = clean(c); const fit = wrap(s, 8, widths[i] - 6, hd ? bold : reg)[0] ?? ''; text(fit, x, y - 8, 8, hd || i === 0 ? bold : reg, hd ? rgb(1, 1, 1) : INK); x += widths[i]; });
      if (!hd) page.drawLine({ start: { x: M, y: y - rh + 4 }, end: { x: M + CW, y: y - rh + 4 }, thickness: 0.4, color: LINE });
      y -= rh;
    };
    draw(head, true); rows.forEach((r) => draw(r, false)); y -= 8;
  };
  const f = (v: number | null, suf = '') => (v == null ? '-' : `${v}${suf}`);
  const names = inp.model.rows.map((r) => r.name);
  const rowsFor = (fn: (r: Row) => string[]) => [...inp.model.rows.map(fn), ...(inp.model.rows.length > 1 ? [fn(inp.model.total)] : [])];
  const label = (r: Row) => (r.id === 'total' ? 'All cohorts' : r.name);

  const wanted = REPORT_SECTIONS.filter((x) => inp.sections.includes(x.key));
  const empty = wanted.filter((x) => !hasData(inp.model, x.key));
  for (const s of wanted.filter((x) => hasData(inp.model, x.key))) {
    need(s.key === 'followup' ? 400 : 330); // a section starts on a fresh page unless its heading, chart and table fit together
    h2(s.label);
    for (const l of takeaways(inp.model, s.key)) para(l, 10, INK, reg, 0, 2);
    y -= 6;
    if (s.key === 'reach') {
      bars(names, [{ name: 'Enrolled', values: inp.model.rows.map((r) => r.enrolled), color: TEAL }, { name: 'Completed', values: inp.model.rows.map((r) => r.completed), color: GOLD }]);
      table(['Cohort', 'Dates', 'Enrolled', 'Completed', 'Rate', 'Women', 'Attendance'], rowsFor((r) => [label(r), r.start ? `${day(r.start)} - ${day(r.end)}` : '', String(r.enrolled), String(r.completed), f(r.completion, '%'), String(r.female), f(r.attendance, '%')]), [142, 118, 46, 56, 38, 42, 57]);
    }
    if (s.key === 'learning') {
      bars(names, [{ name: 'Before training', values: inp.model.rows.map((r) => r.prePct), color: BLUE }, { name: 'After training', values: inp.model.rows.map((r) => r.postPct), color: GREEN }], { max: 100, suffix: '%' });
      table(['Cohort', 'Before', 'After', 'Gain (same people)', 'People with both'], rowsFor((r) => [label(r), f(r.prePct, '%'), f(r.postPct, '%'), r.gain == null ? '-' : `${r.gain >= 0 ? '+' : ''}${r.gain} points`, String(r.pairedN)]), [150, 70, 70, 120, 81]);
    }
    if (s.key === 'followup') {
      const multi = inp.model.rows.length > 1 && inp.model.rows.length <= 4;
      if (multi) bars(['Day 30', 'Day 60', 'Day 90'], inp.model.rows.map((r, i) => ({ name: r.name, values: r.stages.map((x) => x.trading), color: SERIES[i % SERIES.length] })), { max: 100, suffix: '%' });
      else bars(['Day 30', 'Day 60', 'Day 90'], [{ name: 'Trading', values: inp.model.total.stages.map((x) => x.trading), color: TEAL }, { name: 'Income higher', values: inp.model.total.stages.map((x) => x.higher), color: GOLD }, { name: 'Keeps daily records', values: inp.model.total.stages.map((x) => x.records), color: GREEN }], { max: 100, suffix: '%' });
      table(['Stage', 'Due', 'Reached', 'Trading', 'Income higher', 'Daily records', 'Separates money'], inp.model.total.stages.map((x) => [`Day ${x.stage}`, String(x.due), String(x.reached), f(x.trading, '%'), f(x.higher, '%'), f(x.records, '%'), f(x.separates, '%')]), [70, 50, 60, 66, 80, 80, 91]);
      para('Percentages are among people reached at that visit. "Trading" means at least one sale in the 14 days before the visit.', 8, GREY);
    }
    if (s.key === 'youth') {
      bars(names, [{ name: 'First income', values: inp.model.rows.map((r) => r.firstIncome), color: TEAL }, { name: 'CV ready', values: inp.model.rows.map((r) => r.cvReady), color: GOLD }], { max: 100, suffix: '%' });
      table(['Cohort', 'Youth reported', 'First income', 'CV ready', 'Interviews'], rowsFor((r) => [label(r), String(r.youthN), f(r.firstIncome, '%'), f(r.cvReady, '%'), String(r.interviews)]), [150, 85, 85, 80, 61]);
    }
    if (s.key === 'feedback') {
      bars(names, [{ name: 'Rating (of 5)', values: inp.model.rows.map((r) => r.rating), color: GOLD }], { max: 5, height: 120 });
      table(['Cohort', 'Responses', 'Rating', 'Would recommend'], rowsFor((r) => [label(r), String(r.exitN), r.rating == null ? '-' : `${r.rating}/5`, f(r.recommend, '%')]), [190, 90, 80, 101]);
    }
  }

  if (empty.length) { h2('Not available yet'); para(`Nothing has been recorded yet for: ${empty.map((x) => x.label.toLowerCase()).join('; ')}. These parts will fill in as results come in.`, 10, GREY); }

  // ---- method note and footers
  h2('About these figures');
  para('Every figure is an aggregate from the Elimu+ portal, built from registration, learning checks, follow-up visits and exit feedback. No participant is named or identifiable in this report. Follow-up percentages are among people reached; people who could not be reached are counted separately.', 9, GREY);
  const foot = clean(`${inp.confidentiality}  |  Prepared by ${inp.preparedBy} via the Elimu+ portal`);
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 34 }, end: { x: W - M, y: 34 }, thickness: 0.5, color: LINE });
    p.drawText(foot, { x: M, y: 22, size: 7.5, font: reg, color: GREY });
    p.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 50, y: 22, size: 7.5, font: reg, color: GREY });
  });
  return doc.save();
}
