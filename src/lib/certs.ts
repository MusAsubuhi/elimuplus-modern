import 'server-only';
import type { Q } from './db';

export const TIER_TITLES: Record<number, string> = { 1: 'Foundation Facilitator', 2: 'Programme Facilitator', 3: 'Senior Facilitator', 4: 'Accredited ToT Lead' };
export const TIER_TEXT: Record<number, string> = {
  1: 'is certified to deliver the Elimu+ programme as a Foundation Facilitator, working alongside a certified trainer.',
  2: 'is certified to lead Elimu+ training sessions as a Programme Facilitator.',
  3: 'is certified as a Senior Facilitator and may lead cohorts and supervise and observe other trainers.',
  4: 'is accredited as an Elimu+ Training-of-Trainers Lead, able to certify and mentor new trainers.',
};
/** Who signs. Edit here if titles change. */
export const SIGNERS = [{ name: 'Kimani James', role: 'Co-founder & Executive Director' }, { name: 'Asubuhi', role: 'Co-founder' }];

const yr = () => new Date().getFullYear();

/** EL-2026-P-0001: next participant certificate number. */
export async function nextParticipantNumber(q: Q): Promise<string> {
  let n = (await q('select count(*)::int n from participant_certificates where number like $1', [`EL-${yr()}-P-%`]))[0].n as number;
  for (;;) {
    n++;
    const num = `EL-${yr()}-P-${String(n).padStart(4, '0')}`;
    if (!(await q('select 1 from participant_certificates where number=$1', [num])).length) return num;
  }
}
/** EL-2026-T2-003: next trainer certificate number for a tier. */
export async function nextTrainerNumber(q: Q, tier: number): Promise<string> {
  let n = (await q('select count(*)::int n from certifications where number like $1', [`EL-${yr()}-T${tier}-%`]))[0].n as number;
  for (;;) {
    n++;
    const num = `EL-${yr()}-T${tier}-${String(n).padStart(3, '0')}`;
    if (!(await q('select 1 from certifications where number=$1', [num])).length) return num;
  }
}
