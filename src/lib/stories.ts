import 'server-only';
import { dbMode } from './db';
import { supabaseAdmin } from './supabase-admin';

export const BUCKET = 'story-photos';
export const MAX_PHOTOS = 4;

export const THEMES: { k: string; en: string; sw: string }[] = [
  { k: 'income', en: 'More income', sw: 'Mapato zaidi' },
  { k: 'records', en: 'Keeping records', sw: 'Kutunza kumbukumbu' },
  { k: 'savings', en: 'Saving money', sw: 'Kuweka akiba' },
  { k: 'started', en: 'Started a business', sw: 'Nilianza biashara' },
  { k: 'grew', en: 'Grew my business', sw: 'Biashara yangu ilikua' },
  { k: 'work', en: 'Found work', sw: 'Nilipata kazi' },
  { k: 'confidence', en: 'More confidence', sw: 'Kujiamini zaidi' },
  { k: 'team', en: 'Working with others', sw: 'Kufanya kazi na wengine' },
  { k: 'family', en: 'Better for my family', sw: 'Familia yangu imenufaika' },
];
export const themeLabel = (k: string, lang: 'sw' | 'en' = 'en') => THEMES.find((t) => t.k === k)?.[lang] ?? k;

export const isMinor = (birthYear: number | null | undefined) => (birthYear ? new Date().getFullYear() - birthYear < 18 : false);

/** Photos need Supabase Storage, so they only work on the live portal. The demo keeps text stories. */
export const photosEnabled = async () => (await dbMode()) === 'pg';

/** "Amina Wanjiru" -> "Amina W."; anonymous stories are introduced by the cohort alone. */
export function introLine(consent: string, fullName: string, cohortName: string): string {
  if (consent === 'named') {
    const parts = String(fullName).trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  }
  return `A participant in ${cohortName}`;
}

/** Short-lived links for private photos. Callers must already have checked the person may see the story. */
export async function signPhotos(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length || !(await photosEnabled())) return {};
  const { data } = await supabaseAdmin().storage.from(BUCKET).createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
  return out;
}

export async function removeFiles(paths: string[]) {
  if (!paths.length || !(await photosEnabled())) return;
  await supabaseAdmin().storage.from(BUCKET).remove(paths);
}

export const STATUS_LABEL: Record<string, string> = {
  submitted: 'Waiting for review', approved: 'Approved', published: 'Published', declined: 'Not used', withdrawn: 'Withdrawn',
};
