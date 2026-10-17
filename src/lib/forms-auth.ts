import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/** The Google Forms script proves who it is with a shared secret kept in Vercel and in the script's properties. */
export function validSecret(given: string | null | undefined): boolean {
  const want = process.env.FORMS_WEBHOOK_SECRET;
  if (!want || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
