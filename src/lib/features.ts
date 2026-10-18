import type { Role } from './session';

/**
 * Every section of the portal that can be switched on or off for people.
 * "fixed" sections follow the person's role and cannot be changed here (they hold money, welfare or access data).
 * "delegable" sections start from the defaults below, and the founders can change them per role or per person on the Permissions page.
 */
export type Feature = {
  key: string;
  label: string;
  section: 'Overview' | 'Programme' | 'Marketing' | 'Money' | 'People and access';
  href: string;
  icon: string;
  delegable: boolean;
  roles: Role[];            // who has it by default
  note?: string;            // why it is fixed, or what it contains
};

export const FEATURES: Feature[] = [
  { key: 'command', label: 'Command view', section: 'Overview', href: '/portal/command', icon: '★', delegable: false, roles: ['founder'], note: 'Whole-programme summary for founders.' },
  { key: 'alerts', label: 'Alerts', section: 'Overview', href: '/portal/alerts', icon: '⚑', delegable: false, roles: ['founder'], note: 'Welfare, urgent and system alerts.' },
  { key: 'approvals', label: 'Approvals', section: 'Overview', href: '/portal/approvals', icon: '✔', delegable: false, roles: ['founder'], note: 'Founder decisions.' },
  { key: 'impact', label: 'Impact', section: 'Programme', href: '/portal/impact', icon: '▲', delegable: false, roles: ['founder', 'master'], note: 'Participant business numbers.' },
  { key: 'forms', label: 'Forms and responses', section: 'Programme', href: '/portal/forms', icon: '▤', delegable: false, roles: ['founder', 'master'], note: 'Participant form responses.' },
  { key: 'seminars', label: 'Monthly seminars', section: 'Programme', href: '/portal/seminars', icon: '☼', delegable: true, roles: ['founder', 'master'] },
  { key: 'crm', label: 'Partners: call, visit, check', section: 'Programme', href: '/portal/crm', icon: '☎', delegable: false, roles: ['founder', 'master'], note: 'Partner contact records.' },
  { key: 'newsletter', label: 'Weekly letters', section: 'Marketing', href: '/portal/newsletter', icon: '✉', delegable: true, roles: ['founder'] },
  { key: 'social', label: 'Social ideas', section: 'Marketing', href: '/portal/social', icon: '✦', delegable: true, roles: ['founder', 'master', 'facilitator'] },
  { key: 'social_publish', label: 'Social calendar and posting', section: 'Marketing', href: '/portal/social/calendar', icon: '▣', delegable: true, roles: ['founder'] },
  { key: 'social_insights', label: 'Social insights', section: 'Marketing', href: '/portal/social/insights', icon: '◔', delegable: true, roles: ['founder'] },
  { key: 'finance', label: 'Finance', section: 'Money', href: '/portal/finance', icon: '₭', delegable: false, roles: ['founder'], note: 'Money, rates and margins.' },
  { key: 'team', label: 'Team and people', section: 'People and access', href: '/portal/team', icon: '☺', delegable: false, roles: ['founder'], note: 'Personal records.' },
  { key: 'people', label: 'Suggestions and partners', section: 'People and access', href: '/portal/people', icon: '☰', delegable: false, roles: ['founder'] },
  { key: 'journey', label: 'My journeys', section: 'People and access', href: '/portal/journey', icon: '➜', delegable: false, roles: ['founder'] },
  { key: 'permissions', label: 'Permissions', section: 'People and access', href: '/portal/permissions', icon: '⚿', delegable: false, roles: ['founder'], note: 'Only founders can change who sees what.' },
  { key: 'audit', label: 'Audit log', section: 'People and access', href: '/portal/audit', icon: '⌕', delegable: false, roles: ['founder'], note: 'Who read what.' },
];
export const SECTIONS = ['Overview', 'Programme', 'Marketing', 'Money', 'People and access'] as const;
export const DELEGABLE_ROLES: Role[] = ['facilitator', 'master'];
export const featureByKey = (k: string) => FEATURES.find((f) => f.key === k);
