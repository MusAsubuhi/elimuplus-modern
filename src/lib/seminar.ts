import 'server-only';
import { asAdmin } from './db';
import { upsertContact } from './brevo';

export const FEEDBACK_SCALES = [
  { key: 'useful', label: 'How useful was today for you?' },
  { key: 'content', label: 'How clear and relevant was the content?' },
  { key: 'organised', label: 'How well was the day organised?' },
] as const;

export const FEEDBACK_TEXT = [
  { key: 'best', label: 'What was the most useful part of today?' },
  { key: 'improve', label: 'What should we do differently next time?' },
  { key: 'topics', label: 'Which topics would you like us to cover in a future seminar?' },
] as const;

export const HOST_FIELDS = [
  { key: 'attendance_note', label: 'Attendance: how did the numbers compare with who you expected?', long: true },
  { key: 'agenda', label: 'What was covered, in order?', long: true },
  { key: 'speakers', label: 'Speakers and facilitators who took part', long: false },
  { key: 'went_well', label: 'What went well?', long: true },
  { key: 'went_wrong', label: 'What did not go well?', long: true },
  { key: 'actions', label: 'Follow-up actions, with who is responsible and by when', long: true },
  { key: 'welfare', label: 'Any welfare, safety or venue concern a founder should know about (write "none" if none)', long: false },
  { key: 'next', label: 'Ideas or date for the next seminar', long: false },
] as const;

/** Adds a seminar guest to the newsletter list straight away; if Brevo is unreachable the daily sync picks them up. */
export async function pushSeminarConsent(entryId: string, email: string, name: string) {
  try {
    const first = name.trim().split(/\s+/)[0] ?? '';
    await upsertContact(email, first ? { FIRSTNAME: first } : {});
    await asAdmin((q) => q('update seminar_entries set brevo_synced_at = now() where id = $1', [entryId]));
  } catch (e) { console.error('[seminar newsletter]', e); }
}
