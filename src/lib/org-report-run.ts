import 'server-only';
import { asUser } from './db';
import { loadImpact } from './impact';
import { buildModel, SECTION_KEYS } from './org-report';
import { renderReportPdf } from './report-pdf';
import { loadPhotoBytes } from './session-photos';
import type { Me } from './session';

const UUID = /^[0-9a-f-]{36}$/;
export interface ReportParams { cohorts: string[]; sections: string[]; title: string; note: string }

/** Reads and cleans the choices from a form or a link. Anything unknown is dropped, never trusted. */
export function readParams(get: (k: string) => string | null | undefined, getAll?: (k: string) => string[]): ReportParams {
  const list = (k: string) => (getAll ? getAll(k) : String(get(k) ?? '').split(',')).map((x) => x.trim()).filter(Boolean);
  const sections = list('s').filter((x) => SECTION_KEYS.includes(x));
  return {
    cohorts: list('c').filter((x) => UUID.test(x)).slice(0, 12),
    sections: sections.length ? sections : SECTION_KEYS,
    title: String(get('t') ?? '').trim().slice(0, 120),
    note: String(get('n') ?? '').trim().slice(0, 600),
  };
}

/** Loads only what this person can already see: the database limits the cohorts to the organisation, and only aggregates are read. */
export async function prepareReport(me: Me, p: ReportParams) {
  const { all, label, org, photos } = await asUser(me.id, async (q) => ({
    photos: p.sections.includes('photos') ? await q("select p.id, p.day_number, p.storage_path, p.caption, c.name cohort_name, p.cohort_id from session_photos p join cohorts c on c.id=p.cohort_id where p.status='approved' order by c.seq, p.day_number").catch(() => []) : [],
    all: await loadImpact(q),
    label: (await q("select confidentiality_label l from agreements where confidentiality_label is not null limit 1"))[0]?.l as string | undefined,
    org: me.orgIds?.length ? (await q('select name from organisations where id = any($1::uuid[]) limit 1', [me.orgIds]))[0]?.name as string | undefined : undefined,
  }));
  const chosen = p.cohorts.length ? all.filter((c) => p.cohorts.includes(c.id)) : all;
  const ids = new Set(chosen.map((c) => c.id));
  const pool = (photos as any[]).filter((x) => ids.has(x.cohort_id));
  // a report holds at most 12 photos, spread across the days (first photo of each day first) so it stays light enough to email
  const seen: Record<string, number> = {};
  const ranked = pool.map((x) => ({ x, r: (seen[`${x.cohort_id}:${x.day_number}`] = (seen[`${x.cohort_id}:${x.day_number}`] ?? -1) + 1) }));
  const chosenPhotos = ranked.sort((a, b) => a.r - b.r).slice(0, 12).map((o) => o.x).sort((a, b) => (a.cohort_name === b.cohort_name ? a.day_number - b.day_number : a.cohort_name.localeCompare(b.cohort_name)));
  const model = buildModel(chosen, chosenPhotos.length);
  const orgName = org ?? chosen[0]?.org ?? 'Partner organisation';
  const title = p.title || `${orgName}: training results${chosen.length === 1 ? `, ${chosen[0].name}` : ''}`;
  return { all, chosen, model, photos: chosenPhotos as { id: string; day_number: number; storage_path: string; caption: string | null; cohort_name: string }[], orgName, title, confidentiality: label ?? 'Confidential: prepared for the named organisation only' };
}

export async function makePdf(me: Me, p: ReportParams) {
  const r = await prepareReport(me, p);
  const pics = (await Promise.all(r.photos.map(async (x) => ({ cohort: x.cohort_name, day: x.day_number, caption: x.caption, bytes: await loadPhotoBytes(x.storage_path) })))).filter((x): x is { cohort: string; day: number; caption: string | null; bytes: Uint8Array } => !!x.bytes);
  const bytes = await renderReportPdf({ photos: pics, title: r.title, org: r.orgName, model: r.model, sections: p.sections, confidentiality: r.confidentiality, preparedBy: me.displayName ?? me.name ?? 'Partner', generatedOn: new Date(), note: p.note || undefined });
  return { ...r, bytes };
}
export const fileName = (title: string, ext: string) => `${title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'elimu-report'}.${ext}`;
