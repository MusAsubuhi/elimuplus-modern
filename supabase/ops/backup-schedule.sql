-- Scheduled backup trigger (applied live 2026-10-19; not a migration because PGlite demo mode has no pg_cron).
-- Vercel crons only run on Production (main = static site), so the portal on `platform` is called from the database instead.
-- Needs a Vault secret named elimu_backup_secret holding the same value as BACKUP_SECRET in Vercel.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function app.run_portal_backup() returns bigint language plpgsql security definer set search_path = '' as $$
declare s text; rid bigint;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'elimu_backup_secret' limit 1;
  if s is null or s = '' then
    raise warning 'elimu_backup_secret is not set in Vault; backup call skipped';
    return null;
  end if;
  select net.http_get(
    url := 'https://portal.elimuplus.com/api/cron/backup',
    headers := jsonb_build_object('Authorization', 'Bearer ' || s),
    timeout_milliseconds := 120000
  ) into rid;
  return rid;
end $$;
revoke all on function app.run_portal_backup() from public, anon, authenticated;

select cron.schedule('elimu-portal-backup', '0 1 */2 * *', 'select app.run_portal_backup();');
