/**
 * The training calendar: who is delivering what, on which days, and where two trainings overlap.
 * Pure functions only (no database, no server imports) so they can be tested on their own.
 *
 * Overlapping trainings are allowed. What matters is that each one has its own trainer, so every overlap is
 * classed as one of three things:
 *   conflict   a trainer is on both trainings, which cannot work and has to be fixed
 *   check      different trainers (or one training has no trainer yet): needs a founder to confirm it more carefully
 *   confirmed  a founder has checked that different trainers cover each training
 */

export type Trainer = { id: string; name: string; role: string };

export type Training = {
  id: string;
  name: string;
  org: string;
  status: string;
  format: string;
  language: string;
  audience: string | null;
  venue: string | null;
  expected: number | null;
  enrolled: number;
  start: string | null;
  end: string | null;
  /** Every training day as an ISO date, weekends skipped. Empty when the training has no dates yet. */
  days: string[];
  trainers: Trainer[];
  /** The agreed daily time, 'HH:MM', set by a founder or the lead or co-facilitator. Both or neither. */
  startTime: string | null;
  endTime: string | null;
  timeNote: string | null;
  /** Whether the person looking may set the time. */
  canSetTime: boolean;
  /** Founders only: the latest invoice for this training. */
  invoice?: { number: string; status: string; amountKes: number } | null;
};

export type Confirmation = { a: string; b: string; by: string | null; at: string; note: string | null };

export type ClashLevel = 'conflict' | 'check' | 'confirmed';

export type Clash = {
  level: ClashLevel;
  /** The other training. */
  otherId: string;
  otherName: string;
  otherOrg: string;
  /** The days both trainings run. */
  days: string[];
  sharedTrainers: string[];
  /** Names of trainings in this pair that have nobody assigned yet. */
  unstaffed: string[];
  sameVenue: boolean;
  tentative: boolean;
  reasons: string[];
  /** A founder may confirm only when the trainers are different and every training has one. */
  canConfirm: boolean;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  note?: string | null;
};

/** Trainings that still need a trainer and a place on the calendar. Closed and follow-up stages are history. */
export const ACTIVE_STATUSES = ['requested', 'quoted', 'confirmed', 'delivering'];
export const isTentative = (status: string) => status === 'requested' || status === 'quoted';
export const isActive = (status: string) => ACTIVE_STATUSES.includes(status);

export const pairKey = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function findClashes(trainings: Training[], confirmations: Confirmation[] = []): Map<string, Clash[]> {
  const out = new Map<string, Clash[]>();
  const conf = new Map(confirmations.map((c) => [pairKey(c.a, c.b).join('|'), c]));
  const live = trainings.filter((t) => isActive(t.status) && t.days.length);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      const inB = new Set(b.days);
      const days = a.days.filter((d) => inB.has(d));
      if (!days.length) continue;

      const idsB = new Set(b.trainers.map((t) => t.id));
      const sharedTrainers = a.trainers.filter((t) => idsB.has(t.id)).map((t) => t.name);
      const unstaffed = [a, b].filter((t) => t.trainers.length === 0).map((t) => t.name);
      const sameVenue = !!norm(a.venue) && norm(a.venue) === norm(b.venue);
      const tentative = isTentative(a.status) || isTentative(b.status);
      const c = conf.get(pairKey(a.id, b.id).join('|'));

      const reasons: string[] = [];
      let level: ClashLevel;
      if (sharedTrainers.length) {
        level = 'conflict';
        reasons.push(`${sharedTrainers.join(' and ')} ${sharedTrainers.length > 1 ? 'are' : 'is'} assigned to both trainings on the same days. Give one of them a different trainer.`);
      } else if (unstaffed.length) {
        level = 'check';
        reasons.push(`No trainer is assigned yet to ${unstaffed.join(' or ')}. Assign a different trainer to each before confirming.`);
      } else if (c) {
        level = 'confirmed';
        reasons.push('Different trainers cover each training, and a founder has confirmed it.');
      } else {
        level = 'check';
        reasons.push('Different trainers are assigned, but running together needs a founder to confirm each trainer and the venue.');
      }
      if (sameVenue) reasons.push(`Both are at ${a.venue}. Check that the venue can hold two trainings at once.`);
      if (tentative && level !== 'conflict') reasons.push('At least one of them is not confirmed with the partner yet.');

      const base = { level, days, sharedTrainers, unstaffed, sameVenue, tentative, reasons } as const;
      const canConfirm = level === 'check' && !unstaffed.length;
      const meta = c ? { confirmedBy: c.by, confirmedAt: c.at, note: c.note } : {};
      push(out, a.id, { ...base, otherId: b.id, otherName: b.name, otherOrg: b.org, canConfirm, ...meta });
      push(out, b.id, { ...base, otherId: a.id, otherName: a.name, otherOrg: a.org, canConfirm, ...meta });
    }
  }
  return out;
}

function push(m: Map<string, Clash[]>, k: string, v: Clash) {
  const list = m.get(k);
  if (list) list.push(v); else m.set(k, [v]);
}

/** The most serious level among a training's clashes, for the colour of its warning. */
export function worstLevel(list: Clash[] | undefined): ClashLevel | null {
  if (!list?.length) return null;
  if (list.some((c) => c.level === 'conflict')) return 'conflict';
  if (list.some((c) => c.level === 'check')) return 'check';
  return 'confirmed';
}

// ---------------------------------------------------------------------------------------------------
// Dates

export const isoOf = (x: any): string => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x ?? '').slice(0, 10));
export const addDays = (iso: string, n: number): string => {
  const x = new Date(iso + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
/** Monday of the week containing this date. */
export const mondayOf = (iso: string): string => {
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay(); // 0 = Sunday
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
};
export const monthStart = (iso: string): string => iso.slice(0, 7) + '-01';
export const shiftMonth = (iso: string, n: number): string => {
  const [y, m] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 10);
};

/** Weeks (each Monday to Sunday) that cover the month of `month` (any date in it). */
export function monthWeeks(month: string): string[][] {
  const first = monthStart(month);
  const last = addDays(shiftMonth(first, 1), -1);
  const weeks: string[][] = [];
  for (let w = mondayOf(first); w <= last; w = addDays(w, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  return weeks;
}

// ---------------------------------------------------------------------------------------------------
// Phone calendar feed (iCalendar)

export type IcsEvent = {
  uid: string;
  date: string; // all-day event on this ISO date
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  tentative?: boolean;
  /** Agreed times in East Africa Time, 'HH:MM'. Without them the event is an all-day entry. */
  startTime?: string;
  endTime?: string;
};

/** East Africa Time is UTC+3 all year, so a local time becomes UTC by taking three hours off. */
export function eatToUtc(date: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCHours(h - 3, m, 0, 0);
  return t.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export const hhmm = (t: string | null | undefined): string | null => (t ? String(t).slice(0, 5) : null);

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 bytes are folded onto continuation lines that start with a space. */
const fold = (line: string): string => {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) { parts.push(cur); cur = ''; bytes = 0; limit = 74; }
    cur += ch; bytes += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
};

export function icsCalendar(name: string, events: IcsEvent[], now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Elimu+//Training calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`,
    'X-WR-TIMEZONE:Africa/Nairobi',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  for (const e of events) {
    const timed = e.startTime && e.endTime;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      ...(timed
        ? [`DTSTART:${eatToUtc(e.date, e.startTime!)}`, `DTEND:${eatToUtc(e.date, e.endTime!)}`]
        : [`DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`]),
      `SUMMARY:${icsText(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push(`STATUS:${e.tentative ? 'TENTATIVE' : 'CONFIRMED'}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** One all-day event for each training day, so weekends stay clear. */
export function trainingEvents(trainings: Training[], clashes: Map<string, Clash[]>, baseUrl: string): IcsEvent[] {
  const out: IcsEvent[] = [];
  for (const t of trainings) {
    const worst = worstLevel(clashes.get(t.id));
    const tentative = isTentative(t.status);
    const total = t.days.length;
    t.days.forEach((date, i) => {
      const tag = tentative ? ' (tentative)' : '';
      const warn = worst === 'conflict' ? ' ⚠ trainer clash' : worst === 'check' ? ' ⚠ overlaps another training' : '';
      const desc = [
        `${t.org}`,
        t.startTime && t.endTime ? `Time: ${t.startTime} to ${t.endTime} (East Africa Time)${t.timeNote ? `, ${t.timeNote}` : ''}` : 'Time not agreed yet',
        `Day ${i + 1} of ${total}${t.format ? ` (${t.format === '12-day' ? '12-Day' : '5-Day'} programme)` : ''}`,
        t.trainers.length ? `Trainers: ${t.trainers.map((x) => `${x.name} (${x.role})`).join(', ')}` : 'Trainer not assigned yet',
        t.venue ? `Venue: ${t.venue}` : '',
        t.expected ? `Expected participants: ${t.expected}` : '',
        `Status: ${t.status}`,
        ...(clashes.get(t.id) ?? []).map((c) => `Overlaps ${c.otherName} (${c.otherOrg}): ${c.reasons[0]}`),
        `${baseUrl}/portal/cohorts/${t.id}`,
      ].filter(Boolean).join('\n');
      out.push({
        uid: `${t.id}-day${i + 1}@portal.elimuplus.com`,
        date,
        summary: `${t.name} · day ${i + 1}/${total}${tag}${warn}`,
        description: desc,
        location: t.venue ?? undefined,
        url: `${baseUrl}/portal/cohorts/${t.id}`,
        tentative,
        startTime: t.startTime ?? undefined,
        endTime: t.endTime ?? undefined,
      });
    });
  }
  return out;
}
