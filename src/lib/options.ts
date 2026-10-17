// Shared option lists (safe to import from client components).
export const EDUCATION: [string, string][] = [
  ['none', 'No formal schooling'],
  ['primary_incomplete', 'Some primary'],
  ['primary', 'Completed primary (KCPE)'],
  ['secondary_incomplete', 'Some secondary'],
  ['secondary', 'Completed secondary (KCSE)'],
  ['tvet_certificate', 'TVET / vocational certificate'],
  ['diploma', 'Diploma'],
  ['degree', 'Bachelor’s degree'],
  ['postgraduate', 'Postgraduate'],
];
export const educationLabel = (k?: string | null) => EDUCATION.find(([v]) => v === k)?.[1] ?? '';

export const ORG_TYPES: [string, string][] = [
  ['church', 'Church'], ['cdc', 'Child development centre'], ['school', 'School'], ['college', 'College / TVET'],
  ['ngo', 'NGO / community group'], ['company', 'Company / business'], ['other', 'Other'],
];
export const orgTypeLabel = (k?: string | null) => ORG_TYPES.find(([v]) => v === k)?.[1] ?? k ?? '';

export const ROLE_OPTIONS: { group: string; items: [string, string][] }[] = [
  { group: 'Elimu+ team', items: [['founder', 'Founder'], ['staff', 'Staff (sees everything a founder sees; cannot approve money)']] },
  { group: 'Trainers', items: [
    ['facilitator:0', 'Trainee Facilitator (Tier 0, observes and reports, works under a supervisor)'],
    ['facilitator:1', 'Associate Facilitator (Tier 1, Foundation)'], ['facilitator:2', 'Certified Facilitator (Tier 2, Programme)'],
    ['facilitator:3', 'Master Trainer (Tier 3, Senior Facilitator)'], ['facilitator:4', 'Master Trainer (Tier 4, Accredited ToT Lead)'],
    ['trainer_candidate', 'Trainer candidate (not yet certified)']] },
  { group: 'Participants', items: [['participant', 'Participant']] },
  { group: 'Partner organisations', items: [['org_admin', 'Partner admin (roster, requests, invoices)'], ['org_viewer', 'Partner viewer (read only)']] },
];
export const roleLabel = (role: string, tier?: number | null) =>
  role === 'facilitator' ? ({ 0: 'Trainee facilitator', 1: 'Associate facilitator', 2: 'Certified facilitator', 3: 'Master trainer (Tier 3)', 4: 'Master trainer (Tier 4)' } as Record<number, string>)[tier ?? 0] : role.replace(/_/g, ' ');
