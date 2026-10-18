-- Newsletter mailing list (Brevo): who agreed to the Elimu+ letter and who has been sent across.
alter table public.people
  add column if not exists newsletter_consent boolean not null default false,
  add column if not exists newsletter_consent_at timestamptz,
  add column if not exists brevo_synced_at timestamptz,
  add column if not exists brevo_sync_error text;

alter table public.organisations
  add column if not exists newsletter_consent boolean not null default false,
  add column if not exists newsletter_consent_at timestamptz,
  add column if not exists brevo_synced_at timestamptz,
  add column if not exists brevo_sync_error text;

-- Sync works through the server connection, so no new grants for signed-in users are needed.
