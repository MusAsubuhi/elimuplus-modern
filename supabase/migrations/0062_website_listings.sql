-- Website cohort listings: the "Cohorts in planning" cards on elimuplus.com come from here.
-- A new cohort creates a DRAFT listing and a founder alert; nothing is public until a founder taps Publish.
-- The public feed (app.public_cohort_listings) returns only the card wording of published listings: no names, phones, money or counts.

create table if not exists public.website_listings (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid unique references public.cohorts(id) on delete cascade,   -- null for a planned cohort that is not in the portal yet
  badge text not null,
  heading text not null,
  blurb text not null,
  date_note text not null,
  starts_on date,                                                          -- ordering for listings without a cohort
  status text not null default 'draft' check (status in ('draft','published','hidden')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_text_ok check (length(badge) between 1 and 80 and length(heading) between 1 and 80
    and length(blurb) between 1 and 500 and length(date_note) between 1 and 120)
);
alter table public.website_listings enable row level security;
create policy wl_founder on public.website_listings for all using (app.is_founder()) with check (app.is_founder());
grant select, insert, update, delete on public.website_listings to authenticated;

-- Wording generated from a cohort. The same text is used for the first draft and for "Refresh from cohort".
create or replace function app.listing_text(c public.cohorts) returns table (badge text, heading text, blurb text, date_note text)
language sql stable set search_path = public as $$
  select
    (case when coalesce(c.audience,'') ~* 'youth|student|school|secondary|teen' then 'Youth' else 'Adults' end)
      || ' · ' || (case when c.format = '12-day' then '12-Day SEE' when c.format = '5-day' then '5-Day Crush' else 'Programme' end),
    coalesce(to_char(c.start_date, 'FMMonth YYYY'), 'Dates to be confirmed'),
    (case when coalesce(c.audience,'') ~* 'youth|student|school|secondary|teen' then 'A youth cohort' else 'An adult cohort' end)
      || coalesce(', run in ' || nullif(btrim(c.venue), ''), '') || ' with a partner organisation.',
    case when c.start_date is null then 'Dates to be confirmed' else to_char(c.start_date, 'FMMonth YYYY') || ' · exact dates to be confirmed' end
$$;

-- A new cohort that is still ahead of us gets a draft and a founder alert. Past or finished cohorts and the founders' own cohort do not.
create or replace function app.draft_listing() returns trigger language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if new.status in ('followup','closed') or new.name ilike 'founders%' or (new.end_date is not null and new.end_date < current_date) then return new; end if;
  select * into t from app.listing_text(new);
  insert into public.website_listings (cohort_id, badge, heading, blurb, date_note, starts_on)
    values (new.id, t.badge, t.heading, t.blurb, t.date_note, new.start_date) on conflict (cohort_id) do nothing;
  insert into public.founder_alerts (kind, severity, title, body, link, source_table, source_id)
    values ('website', 'attention', 'A cohort is ready for the website', new.name || ': read the wording, then Publish or Hide.', '/portal/website', 'website_listings', new.id);
  return new;
end $$;
drop trigger if exists cohort_draft_listing on public.cohorts;
create trigger cohort_draft_listing after insert on public.cohorts for each row execute function app.draft_listing();

-- What the website may show: published listings whose cohort has not finished. Card wording only.
create or replace function app.public_cohort_listings() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('badge', x.badge, 'heading', x.heading, 'blurb', x.blurb, 'date_note', x.date_note)
         order by x.sort_on nulls last, x.created_at), '[]'::jsonb)
  from (
    select l.badge, l.heading, l.blurb, l.date_note, l.created_at, coalesce(c.start_date, l.starts_on) sort_on
    from public.website_listings l
    left join public.cohorts c on c.id = l.cohort_id
    where l.status = 'published'
      and (c.id is null or (c.status not in ('followup','closed') and (c.end_date is null or c.end_date >= current_date)))
      and (c.id is not null or l.starts_on is null or l.starts_on >= date_trunc('month', current_date)::date)
  ) x
$$;
revoke all on function app.public_cohort_listings() from public, anon, authenticated;

-- The four cards already on the website, kept exactly as they read today so the page does not change until a founder edits them.
insert into public.website_listings (badge, heading, blurb, date_note, starts_on, status, published_at)
select * from (values
  ('Youth · 12-Day SEE', 'November 2026', 'Youth cohorts 2 and 3, run in Likoni through partner institutions.', 'November 2026 · exact dates to be confirmed', date '2026-11-01', 'published', now()),
  ('Adults · caregiver cohort', 'January 2027', 'Our next adult cohort, with follow-up visits planned for February, March and April 2027. Choice of 5-Day Crush or 12-Day SEE Programme, agreed with the host.', 'January 2027 · exact dates to be confirmed', date '2027-01-01', 'published', now()),
  ('Youth · 12-Day SEE', 'April 2027', 'Youth cohort 4, run in the school holidays through partner institutions.', 'April 2027 · exact dates to be confirmed', date '2027-04-01', 'published', now()),
  ('Adults · 5-Day or 12-Day', 'Mtongwe', 'With KE740 GNCA Mtongwe, our newest partner. Thirteen adults started here in November 2026.', 'Next dates: in planning', null::date, 'published', now())
) v(badge, heading, blurb, date_note, starts_on, status, published_at)
where not exists (select 1 from public.website_listings);
