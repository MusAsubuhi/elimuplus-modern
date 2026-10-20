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
  maxLevel?: Level;         // 'view' when the section has nothing to change
  levelDefault?: Partial<Record<Role, Level>>; // starting level by role; edit when not listed
};
export type Level = 'view' | 'edit';

export const FEATURES: Feature[] = [
  { key: 'command', label: 'Command view', section: 'Overview', href: '/portal/command', icon: '★', delegable: false, roles: ['founder'], note: 'Whole-programme summary for founders.' },
  { key: 'alerts', label: 'Alerts', section: 'Overview', href: '/portal/alerts', icon: '⚑', delegable: false, roles: ['founder'], note: 'Welfare, urgent and system alerts.' },
  { key: 'approvals', label: 'Approvals', section: 'Overview', href: '/portal/approvals', icon: '✔', delegable: false, roles: ['founder'], note: 'Founder decisions.' },
  { key: 'impact', label: 'Impact', section: 'Programme', href: '/portal/impact', icon: '▲', delegable: true, roles: ['founder', 'master'], maxLevel: 'view', note: 'Numbers are limited to the trainer\u2019s own cohorts by the database.' },
  { key: 'forms', label: 'Forms and responses', section: 'Programme', href: '/portal/forms', icon: '▤', delegable: true, roles: ['founder', 'master', 'facilitator'], levelDefault: { facilitator: 'view' }, note: 'View: form links and counts for their cohorts. Edit: also the response sheets and form editor.' },
  { key: 'stories', label: 'Participant stories', section: 'Programme', href: '/portal/stories', icon: '❝', delegable: true, roles: ['founder', 'master', 'facilitator'], levelDefault: { facilitator: 'edit' }, note: 'Collect and read participant stories. Only founders approve them for use.' },
  { key: 'data', label: 'Data completeness', section: 'Programme', href: '/portal/data', icon: '▦', delegable: false, roles: ['founder'], note: 'What we hold for every cohort, and what is still missing.' },
  { key: 'seminars', label: 'Monthly seminars', section: 'Programme', href: '/portal/seminars', icon: '☼', delegable: true, roles: ['founder', 'master'], levelDefault: { facilitator: 'view' } },
  { key: 'news', label: 'News and signals', section: 'Programme', href: '/portal/news', icon: '◉', delegable: true, roles: ['founder', 'master', 'facilitator'], levelDefault: { facilitator: 'view' } },
  { key: 'crm', label: 'Partners: call, visit, check', section: 'Programme', href: '/portal/crm', icon: '☎', delegable: false, roles: ['founder', 'master'], note: 'Partner contact records.' },
  { key: 'newsletter', label: 'Weekly letters', section: 'Marketing', href: '/portal/newsletter', icon: '✉', delegable: true, roles: ['founder'] },
  { key: 'social', label: 'Social ideas', section: 'Marketing', href: '/portal/social', icon: '✦', delegable: true, roles: ['founder', 'master', 'facilitator'] },
  { key: 'social_publish', label: 'Social calendar and posting', section: 'Marketing', href: '/portal/social/calendar', icon: '▣', delegable: true, roles: ['founder'] },
  { key: 'social_insights', label: 'Social insights', section: 'Marketing', href: '/portal/social/insights', icon: '◔', delegable: true, roles: ['founder'] },
  { key: 'deals', label: 'Proposals and receipts', section: 'Money', href: '/portal/deals', icon: '✎', delegable: false, roles: ['founder'], note: 'Proposals, quotations, invoices and receipts for partners.' },
  { key: 'payouts', label: 'Trainer payments', section: 'Money', href: '/portal/payouts', icon: '◈', delegable: false, roles: ['founder'], note: 'Approve and record what trainers are paid for finished work.' },
  { key: 'earnings', label: 'My earnings', section: 'Money', href: '/portal/earnings', icon: '◇', delegable: false, roles: ['founder', 'master', 'facilitator'], note: 'What each trainer has earned and been paid.' },
  { key: 'finance', label: 'Finance', section: 'Money', href: '/portal/finance', icon: '₭', delegable: false, roles: ['founder'], note: 'Money, rates and margins.' },
  { key: 'team', label: 'Team and people', section: 'People and access', href: '/portal/team', icon: '☺', delegable: false, roles: ['founder'], note: 'Personal records.' },
  { key: 'people', label: 'Suggestions and partners', section: 'People and access', href: '/portal/people', icon: '☰', delegable: false, roles: ['founder'] },
  { key: 'journey', label: 'My journey', section: 'People and access', href: '/portal/journey', icon: '➜', delegable: true, roles: ['founder', 'master', 'facilitator'], note: 'Every trainer takes the participant and facilitator journey themselves.' },
  { key: 'plan', label: 'Improvement plans', section: 'People and access', href: '/portal/plan', icon: '↗', delegable: false, roles: ['founder', 'master', 'facilitator', 'participant'], note: 'Each person owns their plan; supervisors and founders can read and comment.' },
  { key: 'book', label: 'My business book', section: 'People and access', href: '/portal/book', icon: '▤', delegable: false, roles: ['participant'], note: 'Each participant keeps their own business numbers. Trainers and the team read them only while the owner has switched sharing on.' },
  { key: 'recognition', label: 'Recognition', section: 'People and access', href: '/portal/recognition', icon: '✧', delegable: false, roles: ['founder', 'master', 'facilitator', 'participant', 'org_admin'], maxLevel: 'view', note: 'Each person sees only their own standing, earned from recorded work. No rankings.' },
  { key: 'preview', label: 'Preview partner view', section: 'People and access', href: '/portal/preview', icon: '◉', delegable: false, roles: ['founder'], note: 'See exactly what a partner organisation sees.' },
  { key: 'permissions', label: 'Permissions', section: 'People and access', href: '/portal/permissions', icon: '⚿', delegable: false, roles: ['founder'], note: 'Only founders can change who sees what.' },
  { key: 'audit', label: 'Audit log', section: 'People and access', href: '/portal/audit', icon: '⌕', delegable: false, roles: ['founder'], note: 'Who read what.' },
];
export const SECTIONS = ['Overview', 'Programme', 'Marketing', 'Money', 'People and access'] as const;
export const DELEGABLE_ROLES: Role[] = ['facilitator', 'master'];
export const featureByKey = (k: string) => FEATURES.find((f) => f.key === k);
