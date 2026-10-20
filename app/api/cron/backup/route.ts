import { NextResponse } from 'next/server';
import { asAdmin, dbMode } from '@/lib/db';
import { exportAll, saveToDrive, saveToStorage } from '@/lib/backup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** Every two days (Vercel cron): exports the Elimu+ tables, replaces the backup in Supabase Storage, and the Google Drive copy when it is set up. */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  // BACKUP_SECRET is the dedicated secret used by the database scheduler (pg_cron); CRON_SECRET still works.
  const ok = [process.env.BACKUP_SECRET, process.env.CRON_SECRET].some((s) => !!s && auth === `Bearer ${s}`);
  if (!ok) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  if ((await dbMode()) !== 'pg') return NextResponse.json({ skipped: 'demo mode' });
  const result: Record<string, unknown> = {};
  const problems: string[] = [];
  let json = '';
  try {
    const x = await exportAll();
    json = x.json; result.tables = x.tables; result.rows = x.rows; result.bytes = Buffer.byteLength(json);
  } catch (e: any) { problems.push('export: ' + (e?.message ?? e)); }
  if (json) {
    try { await saveToStorage(json); result.storage = 'saved'; } catch (e: any) { problems.push('storage: ' + (e?.message ?? e)); }
    try { result.drive = (await saveToDrive(json)) ? 'saved' : 'not set up'; } catch (e: any) { problems.push('drive: ' + (e?.message ?? e)); }
  }
  if (problems.length) {
    console.error('[backup]', problems);
    await asAdmin((q) => q(
      `insert into founder_alerts(kind, severity, title, body, link, source_table) values ('system','urgent','The scheduled backup did not finish',$1,'/portal/data','backups')`,
      [problems.join(' | ').slice(0, 500)])).catch(() => {});
  }
  return NextResponse.json({ ok: problems.length === 0, problems, ...result }, { status: problems.length ? 500 : 200 });
}
