export const kes = (n: number | string | null | undefined) =>
  `KES ${Number(n ?? 0).toLocaleString('en-KE')}`;
export const d = (x: string | Date | null | undefined) => {
  if (!x) return '';
  const dt = typeof x === 'string' ? new Date(x) : x;
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
export const daysFromToday = (x: string | Date) => {
  const a = new Date(typeof x === 'string' ? x : x.toISOString());
  const t0 = new Date(); t0.setHours(0, 0, 0, 0); a.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - t0.getTime()) / 86400000);
};
/** Today's date in Kenya, as YYYY-MM-DD. */
export const todayEAT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
/** A training day counts as done once its attendance is confirmed, or its date has passed. */
export const dayIsDone = (s: { attendance_confirmed_at?: any; session_date?: any }) => !!s.attendance_confirmed_at || (!!s.session_date && String(s.session_date instanceof Date ? s.session_date.toISOString() : s.session_date).slice(0, 10) < todayEAT());
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
export const iso = (x: any) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x ?? '').slice(0, 10));
