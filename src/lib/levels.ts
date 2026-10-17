import tpl from './report-templates.json';

export type Field = {
  key: string; label: string; type: 'text' | 'longtext' | 'number' | 'choice' | 'scale';
  required?: boolean; core?: boolean; help?: string; options?: string[];
  min?: number; max?: number; minLabel?: string; maxLabel?: string;
};
export type Template = { name: string; short: string; depth: string; goes_to: string; kind?: string; fields: Field[] };

/** Facilitator levels. Tier 0 is the Trainee; 3 and 4 both use the Master view. */
export const LEVEL_NAMES: Record<number, string> = {
  0: 'Trainee Facilitator', 1: 'Associate Facilitator', 2: 'Certified Facilitator', 3: 'Master Trainer', 4: 'Master Trainer (ToT Lead)',
};
export const levelName = (tier: number) => LEVEL_NAMES[tier] ?? `Tier ${tier}`;
/** The report template a given tier fills in. */
export const templateFor = (tier: number): Template => (tpl.levels as Record<string, Template>)[String(Math.min(Math.max(tier, 0), 3))];
export const ALL_TEMPLATES = tpl.levels as Record<string, Template>;
export const reportLevelOf = (tier: number) => Math.min(Math.max(tier, 0), 3);

export const CONCERN_FROM_TEXT = (v: string): 'none' | 'watch' | 'urgent' =>
  /^urgent/i.test(v) ? 'urgent' : /^keep/i.test(v) ? 'watch' : 'none';

export const PHASES: [string, string][] = [
  ['training', 'The training'], ['followup_30', '30-day follow-up'], ['followup_60', '60-day follow-up'], ['followup_90', '90-day follow-up'], ['other', 'Something else'],
];
export const phaseLabel = (p?: string | null) => PHASES.find(([v]) => v === p)?.[1] ?? p ?? '';
