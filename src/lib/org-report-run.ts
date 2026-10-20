import 'server-only';
import { asUser } from './db';
import { loadImpact } from './impact';
import { buildModel, SECTION_KEYS } from './org-report';
import { renderReportPdf } from './report-pdf';
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
  const { all, label, org } = await asUser(me.id, async (q) => ({
    all: await loadImpact(q),
    label: (await q("select confidentiality_label l from agreements where confidentiality_label is not null limit 1"))[0]?.l as string | undefined,
    org: me.orgIds?.length ? (await q('select name from organisations where id = any($1::uuid[]) limit 1', [me.orgIds]))[0]?.name as string | undefined : undefined,
  }));
  const chosen = p.cohorts.length ? all.filter((c) => p.cohorts.includes(c.id)) : all;
  const model = buildModel(chosen);
  const orgName = org ?? chosen[0]?.org ?? 'Partner organisation';
  const title = p.title || `${orgName}: training results${chosen.length === 1 ? `, ${chosen[0].name}` : ''}`;
  return { all, chosen, model, orgName, title, confidentiality: label ?? 'Confidential: prepared for the named organisation only' };
}

export async function makePdf(me: Me, p: ReportParams) {
  const r = await prepareReport(me, p);
  const bytes = await renderReportPdf({ title: r.title, org: r.orgName, model: r.model, sections: p.sections, confidentiality: r.confidentiality, preparedBy: me.displayName ?? me.name ?? 'Partner', generatedOn: new Date(), note: p.note || undefined });
  return { ...r, bytes };
}
export const fileName = (title: string, ext: string) => `${title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'elimu-report'}.${ext}`;
