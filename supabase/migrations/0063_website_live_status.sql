-- Keep the website's cohort cards in step with the portal without anyone editing them.
-- 1. The "when" line of a linked listing is worked out live from the cohort's dates and status.
-- 2. Linked listings stay public until 30 days after the cohort ends (follow-up cohorts no longer vanish), then retire by themselves.
-- 3. Cohorts that existed before listings were built get listings (published, wording editable under Website).

create or replace function app.listing_when(c public.cohorts) returns text language sql stable set search_path = public as $$
  select case
    when c.start_date is null then 'Dates to be confirmed'
    when current_date < c.start_date then 'Starts ' || to_char(c.start_date, 'FMDD FMMonth YYYY')
    when c.end_date is null or current_date <= c.end_date then 'Under way' || coalesce(' · ends ' || to_char(c.end_date, 'FMDD FMMonth YYYY'), '')
    else 'Finished ' || to_char(c.end_date, 'FMDD FMMonth YYYY') || case when c.status = 'followup' then ' · follow-up visits under way' else '' end
  end
$$;

create or replace function app.listing_text(c public.cohorts) returns table (badge text, heading text, blurb text, date_note text)
language sql stable set search_path = public as $$
  select
    (case when coalesce(c.audience,'') || ' ' || coalesce(c.name,'') ~* 'youth|student|school|secondary|teen' then 'Youth' else 'Adults' end)
      || ' · ' || (case when c.format = '12-day' then '12-Day SEE' when c.format = '5-day' then '5-Day Crush' else 'Programme' end),
    coalesce(to_char(c.start_date, 'FMMonth YYYY'), 'Dates to be confirmed'),
    (case when coalesce(c.audience,'') || ' ' || coalesce(c.name,'') ~* 'youth|student|school|secondary|teen' then 'A youth cohort' else 'An adult cohort' end)
      || coalesce(', run in ' || nullif(btrim(c.venue), ''), '') || ' with a partner organisation.',
    app.listing_when(c)
$$;

create or replace function app.public_cohort_listings() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('badge', x.badge, 'heading', x.heading, 'blurb', x.blurb, 'date_note', x.date_note)
         order by x.sort_on nulls last, x.created_at), '[]'::jsonb)
  from (
    select l.badge, l.heading, l.blurb,
           case when c.id is not null then app.listing_when(c) else l.date_note end date_note,
           l.created_at, coalesce(c.start_date, l.starts_on) sort_on
    from public.website_listings l
    left join public.cohorts c on c.id = l.cohort_id
    where l.status = 'published'
      and (c.id is null or (c.status <> 'closed' and coalesce(c.end_date, current_date) >= current_date - 30))
      and (c.id is not null or l.starts_on is null or l.starts_on >= date_trunc('month', current_date)::date)
  ) x
$$;
revoke all on function app.public_cohort_listings() from public, anon, authenticated;

-- Backfill: every open cohort that has no listing yet.
insert into public.website_listings (cohort_id, badge, heading, blurb, date_note, starts_on, status, published_at)
select c.id, t.badge, t.heading, t.blurb, t.date_note, c.start_date, 'published', now()
from public.cohorts c cross join lateral app.listing_text(c) t
where c.status <> 'closed' and c.name not ilike 'founders%' and coalesce(c.end_date, current_date) >= current_date - 30
  and not exists (select 1 from public.website_listings l where l.cohort_id = c.id);

-- Wording for the three real cohorts, and retire the two hand-written cards they replace.
update public.website_listings l set heading = 'Youth cohort 2', blurb = 'Our second youth cohort, a 5-day programme run in Likoni.'
  from public.cohorts c where c.id = l.cohort_id and c.name = 'Youth class- Maendeleo';
update public.website_listings l set heading = 'Youth cohort 3', blurb = 'Our third youth cohort, a 5-day programme run in Likoni.'
  from public.cohorts c where c.id = l.cohort_id and c.name = 'Youth class- Amka Kijana';
update public.website_listings l set heading = 'Mtongwe', badge = 'Adults · 5-Day Crush',
  blurb = 'With KE740 GNCA Mtongwe, our newest partner. Thirteen adults took part in November 2026.'
  from public.cohorts c where c.id = l.cohort_id and c.name = 'KE0740 HVC 27/6';
update public.website_listings set status = 'hidden'
  where cohort_id is null and ((heading = 'November 2026' and badge like 'Youth%') or heading = 'Mtongwe');
