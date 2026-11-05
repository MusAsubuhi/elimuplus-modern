// Small helpers for turning what a Google Form sends (labels and text) into the typed values the database stores.
// No server-only import: these are plain functions, also used by the tests.

type Q = (sql: string, params?: any[]) => Promise<any[]>;

export const clean = (v: unknown, n = 160) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, n);
export const longText = (v: unknown, n = 2000) => { const t = String(v ?? '').trim().slice(0, n); return t || null; };

/** "KES 12,500" -> 12500; blank or words -> null. */
export const asNum = (v: unknown): number | null => {
  const raw = String(v ?? '').replace(/[^\d.]/g, '');
  if (!/^\d{1,9}(\.\d+)?$/.test(raw)) return null;
  return Math.round(Number(raw));
};

/** "Not yet" -> not_yet, "About the same" -> about_the_same. Blank -> null. */
export const code = (v: unknown): string | null => {
  const t = String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return t || null;
};

/** Yes / No questions. Anything that is neither (blank, "Not applicable", "Partly") is unknown, not false. */
export const yesNo = (v: unknown): boolean | null => {
  const t = String(v ?? '').trim().toLowerCase();
  if (t.startsWith('yes')) return true;
  if (t === 'no') return false;
  return null;
};

/** The label chosen, mapped through a list of [pattern, value] pairs. */
export const pick = (v: unknown, map: [RegExp, string][]): string | null => {
  const t = String(v ?? '').trim();
  if (!t) return null;
  for (const [re, out] of map) if (re.test(t)) return out;
  return null;
};

export const list = (v: unknown): string[] => String(v ?? '').split(/,\s+/).map((x) => x.trim()).filter(Boolean);
export const isoDate = (v: unknown): string | null => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null);

export const STORY = (v: unknown) => pick(v, [[/without/i, 'anonymous'], [/^yes/i, 'named'], [/^no/i, 'none']]);
export const GENDER = (v: unknown) => pick(v, [[/^female/i, 'female'], [/^male/i, 'male'], [/^other/i, 'other'], [/^prefer/i, 'undisclosed']]);
export const EDU_CODE: [RegExp, string][] = [
  [/no formal/i, 'none'], [/some primary/i, 'primary_incomplete'], [/completed primary/i, 'primary'], [/some secondary/i, 'secondary_incomplete'],
  [/completed secondary/i, 'secondary'], [/tvet|vocational/i, 'tvet_certificate'], [/diploma/i, 'diploma'], [/bachelor/i, 'degree'], [/postgraduate/i, 'postgraduate'],
];

export type Field = { key: string; label: string; type?: string; correct?: string };

/** Question text (any case) -> the field it belongs to. */
export function byLabel(fields: Field[]) {
  return new Map<string, Field>(fields.map((f) => [f.label.trim().toLowerCase(), f]));
}

/** Re-keys { "<question text>": value } as { "<key>": value }; text it does not know is kept under the question text. */
export function rekey(fields: Field[], raw: Record<string, unknown>) {
  const map = byLabel(fields);
  const out: Record<string, any> = {};
  for (const [label, value] of Object.entries(raw ?? {})) {
    const f = map.get(String(label).trim().toLowerCase());
    out[f ? f.key : String(label).slice(0, 120)] = value;
  }
  return out;
}

export async function cohortFromLabel(q: Q, label: unknown) {
  const m = /\[([0-9a-f]{8})\]\s*$/i.exec(String(label ?? ''));
  if (!m) return null;
  return (await q('select id, name, organisation_id from cohorts where id::text like $1 limit 1', [m[1].toLowerCase() + '%']))[0] ?? null;
}

/** The participant's enrolment: matched by phone, preferring the cohort named on the form. */
export async function findEnrolment(q: Q, phone: string, cohortId: string | null) {
  if (!phone) return null;
  return (await q(
    `select e.id, e.cohort_id, e.person_id, e.has_business_at_entry from enrolments e join people p on p.id = e.person_id
     where (p.phone = $1 or p.phone = $2) order by (e.cohort_id = $3) desc nulls last, e.id limit 1`,
    [phone, '+254' + phone.slice(1), cohortId]))[0] ?? null;
}

export async function personByPhone(q: Q, phone: string) {
  if (!phone) return null;
  return (await q('select id from people where phone = $1 or phone = $2 limit 1', [phone, '+254' + phone.slice(1)]))[0]?.id ?? null;
}

/** Builds "col1, col2" / "$3, $4" / "col1 = excluded.col1" parts for an insert from an object, skipping undefined values. */
export function insertParts(row: Record<string, unknown>, firstParam = 1) {
  const keys = Object.keys(row).filter((k) => row[k] !== undefined);
  return {
    cols: keys.join(', '),
    marks: keys.map((_, i) => `$${i + firstParam}`).join(', '),
    values: keys.map((k) => row[k]),
    update: (skip: string[]) => keys.filter((k) => !skip.includes(k)).map((k) => `${k} = excluded.${k}`).join(', '),
  };
}

/** Which of a checkbox question's options were ticked, in the order the options are listed. Google joins ticks with ", ", and some options contain a comma themselves. */
export const ticked = (raw: unknown, options: string[]): string[] => {
  const hay = ', ' + String(raw ?? '') + ', ';
  return options.filter((o) => hay.includes(', ' + o + ', '));
};

/** Weekly profit bands (and the matching estimate used when only a band is given, so averages still work). A figure typed on the form always wins. */
const PROFIT_MID: [RegExp, number][] = [[/^no profit/i, 0], [/^under/i, 500], [/1,000 to 2,000/, 1500], [/2,000 to 4,000/, 3000], [/^over/i, 5000]];
export const profitKes = (figure: unknown, band: unknown): number | null => {
  const f = asNum(figure);
  if (f !== null) return f;
  const t = String(band ?? '').trim();
  const hit = PROFIT_MID.find(([re]) => re.test(t));
  return hit ? hit[1] : null;
};

/** The three money habits are asked as Yes / Sometimes (or Mostly) / No; the impact figures count them under these codes. */
export const SEPARATES = (v: unknown) => pick(v, [[/^yes/i, 'always'], [/^mostly/i, 'mostly'], [/^no/i, 'no']]);
export const PAYS_SELF = (v: unknown) => pick(v, [[/^yes/i, 'regularly'], [/^sometimes/i, 'sometimes'], [/^no/i, 'not_yet']]);
export const INCOME_VS = (v: unknown) => pick(v, [[/^increas|^more/i, 'higher'], [/^about|^the same/i, 'about_the_same'], [/^decreas|^less/i, 'lower']]);
