-- 1. A new cohort takes over a matching planned card instead of creating a duplicate.
--    Match: an unlinked, not-hidden listing whose planned month equals the cohort's start month and whose audience (Youth/Adults) agrees.
--    The card keeps its published/draft state and wording; its dates line becomes live. The founders get an alert to read the wording.
create or replace function app.draft_listing() returns trigger language plpgsql security definer set search_path = public as $$
declare t record; adopt uuid; youth boolean;
begin
  if new.status in ('followup','closed') or new.name ilike 'founders%' or (new.end_date is not null and new.end_date < current_date) then return new; end if;
  select * into t from app.listing_text(new);
  youth := t.badge like 'Youth%';
  if new.start_date is not null then
    select l.id into adopt from public.website_listings l
     where l.cohort_id is null and l.status <> 'hidden' and l.starts_on is not null
       and date_trunc('month', l.starts_on) = date_trunc('month', new.start_date)
       and (l.badge like 'Youth%') = youth
     order by l.created_at limit 1;
  end if;
  if adopt is not null then
    update public.website_listings set cohort_id = new.id, starts_on = new.start_date, updated_at = now() where id = adopt;
    insert into public.founder_alerts (kind, severity, title, body, link, source_table, source_id)
      values ('website', 'attention', 'A cohort took over a planned website card', new.name || ': check the wording on the card, it now follows this cohort''s dates.', '/portal/website', 'website_listings', new.id);
  else
    insert into public.website_listings (cohort_id, badge, heading, blurb, date_note, starts_on)
      values (new.id, t.badge, t.heading, t.blurb, t.date_note, new.start_date) on conflict (cohort_id) do nothing;
    insert into public.founder_alerts (kind, severity, title, body, link, source_table, source_id)
      values ('website', 'attention', 'A cohort is ready for the website', new.name || ': read the wording, then Publish or Hide.', '/portal/website', 'website_listings', new.id);
  end if;
  return new;
end $$;

-- 2. The next forum date for the Join page: the next upcoming seminar whose title says forum. Date only.
create or replace function app.public_next_forum() returns text language sql stable security definer set search_path = public as $$
  select to_char(held_on, 'FMDD FMMonth YYYY') from public.seminars
   where held_on >= current_date and title ilike '%forum%' and coalesce(status,'') not ilike 'cancel%'
   order by held_on limit 1
$$;
revoke all on function app.public_next_forum() from public, anon, authenticated;
