-- Adults (18 and over) agree for themselves; only under-18s need a parent or guardian.
-- null means the row was recorded before this rule and is left as it was.
alter table public.cohort_roster add column if not exists own_consent boolean;
alter table public.invitations add column if not exists own_consent boolean;
