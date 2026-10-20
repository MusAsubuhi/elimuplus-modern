-- 0028: My business book (Kitabu cha Biashara Yangu), the phone version.
-- A person keeps one active book for their business: what they sell and what it costs, fixed costs, and a short page for each trading day.
-- The numbers belong to the person. Their trainer and the Elimu+ team can read them only while the person has switched sharing on.
-- Nobody else ever writes in a book. Partner organisations get no access here (aggregates can be added later through a definer function).
-- Safe to run twice.

create table if not exists public.business_books (
  id               uuid primary key default gen_random_uuid(),
  person_id        uuid not null references public.people(id) on delete cascade,
  enrolment_id     uuid references public.enrolments(id) on delete set null,
  business_name    text not null,
  what_i_sell      text,
  where_i_trade    text,
  started_on       date,
  entry_mode       text not null default 'simple' check (entry_mode in ('simple','items')),
  margin_pct       numeric(5,2) check (margin_pct is null or (margin_pct >= 0 and margin_pct <= 100)),
  days_per_week    smallint not null default 6 check (days_per_week between 1 and 7),
  days_per_month   smallint not null default 26 check (days_per_month between 1 and 31),
  opening_cash     numeric(12,2) not null default 0 check (opening_cash >= 0),
  opening_owed_to_me numeric(12,2) not null default 0 check (opening_owed_to_me >= 0),
  goal_text        text,
  share_with_trainer boolean not null default false,
  status           text not null default 'active' check (status in ('active','closed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists business_books_one_active on public.business_books(person_id) where status = 'active';

create table if not exists public.business_items (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references public.business_books(id) on delete cascade,
  name         text not null check (length(btrim(name)) > 0),
  unit         text,
  price_kes    numeric(12,2) not null default 0 check (price_kes >= 0),
  unit_cost_kes numeric(12,2) not null default 0 check (unit_cost_kes >= 0),
  active       boolean not null default true,
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists business_items_book on public.business_items(book_id, sort_order);

create table if not exists public.business_fixed_costs (
  id             uuid primary key default gen_random_uuid(),
  book_id        uuid not null references public.business_books(id) on delete cascade,
  name           text not null check (length(btrim(name)) > 0),
  amount_kes     numeric(12,2) not null check (amount_kes >= 0),
  times_per_month numeric(6,2) not null default 1 check (times_per_month > 0),
  created_at     timestamptz not null default now()
);
create index if not exists business_fixed_costs_book on public.business_fixed_costs(book_id);

create table if not exists public.business_days (
  id             uuid primary key default gen_random_uuid(),
  book_id        uuid not null references public.business_books(id) on delete cascade,
  day            date not null,
  traded         boolean not null default true,
  -- simple mode: totals entered by the person. In items mode the sales come from the lines below.
  sales_cash     numeric(12,2) not null default 0 check (sales_cash >= 0),
  sales_credit   numeric(12,2) not null default 0 check (sales_credit >= 0),
  debts_received numeric(12,2) not null default 0 check (debts_received >= 0),
  stock_paid     numeric(12,2) not null default 0 check (stock_paid >= 0),
  stall_fee      numeric(12,2) not null default 0 check (stall_fee >= 0),
  transport      numeric(12,2) not null default 0 check (transport >= 0),
  mpesa_fees     numeric(12,2) not null default 0 check (mpesa_fees >= 0),
  other_paid     numeric(12,2) not null default 0 check (other_paid >= 0),
  debts_repaid   numeric(12,2) not null default 0 check (debts_repaid >= 0),
  customers      integer check (customers is null or customers >= 0),
  saved_kes      numeric(12,2) not null default 0 check (saved_kes >= 0),
  cash_counted   numeric(12,2) check (cash_counted is null or cash_counted >= 0),
  noticed        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (book_id, day)
);
create index if not exists business_days_book_day on public.business_days(book_id, day desc);

-- One row per item sold in items mode. Price and cost are copied at the time, so changing a price later never rewrites history.
create table if not exists public.business_day_lines (
  id        uuid primary key default gen_random_uuid(),
  day_id    uuid not null references public.business_days(id) on delete cascade,
  item_id   uuid references public.business_items(id) on delete set null,
  name      text not null,
  qty       numeric(10,2) not null check (qty > 0),
  price_kes numeric(12,2) not null check (price_kes >= 0),
  unit_cost_kes numeric(12,2) not null default 0 check (unit_cost_kes >= 0),
  on_credit boolean not null default false
);
create index if not exists business_day_lines_day on public.business_day_lines(day_id);

-- Weekly and monthly reflections ("what I learned", "next week I will"), plus the "does my canvas still describe my business" ticks.
create table if not exists public.business_reflections (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references public.business_books(id) on delete cascade,
  kind         text not null check (kind in ('week','month')),
  period_start date not null,
  learned      text,
  next_step    text,
  data         jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  unique (book_id, kind, period_start)
);

-- ---------- who may see a book ----------
create or replace function app.owns_book(bid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_books where id = bid and person_id = app.me())
$$;
-- The owner always. A trainer of the person's cohort, and the founders, only while the owner has chosen to share.
create or replace function app.can_see_book(bid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_books b where b.id = bid and (
    b.person_id = app.me()
    or (b.share_with_trainer and (app.is_staff()
        or exists (select 1 from public.enrolments e where e.person_id = b.person_id and e.cohort_id in (select app.my_cohorts())))
        )))
$$;

alter table public.business_books       enable row level security;
alter table public.business_items       enable row level security;
alter table public.business_fixed_costs enable row level security;
alter table public.business_days        enable row level security;
alter table public.business_day_lines   enable row level security;
alter table public.business_reflections enable row level security;

drop policy if exists bb_read on public.business_books;
create policy bb_read on public.business_books for select using (person_id = app.me() or app.can_see_book(id));
drop policy if exists bb_insert on public.business_books;
create policy bb_insert on public.business_books for insert with check (person_id = app.me());
drop policy if exists bb_update on public.business_books;
create policy bb_update on public.business_books for update using (person_id = app.me()) with check (person_id = app.me());
drop policy if exists bb_delete on public.business_books;
create policy bb_delete on public.business_books for delete using (person_id = app.me());

do $$
declare t text;
begin
  foreach t in array array['business_items','business_fixed_costs','business_days','business_reflections'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (app.can_see_book(book_id))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all using (app.owns_book(book_id)) with check (app.owns_book(book_id))', t || '_write', t);
  end loop;
end $$;

create or replace function app.owns_day(did uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_days d join public.business_books b on b.id = d.book_id where d.id = did and b.person_id = app.me())
$$;
create or replace function app.can_see_day(did uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_days d where d.id = did and app.can_see_book(d.book_id))
$$;
drop policy if exists business_day_lines_read on public.business_day_lines;
create policy business_day_lines_read on public.business_day_lines for select using (app.can_see_day(day_id));
drop policy if exists business_day_lines_write on public.business_day_lines;
create policy business_day_lines_write on public.business_day_lines for all using (app.owns_day(day_id)) with check (app.owns_day(day_id));

-- Whose book it is never changes.
create or replace function app.guard_book_update() returns trigger language plpgsql as $$
begin
  if new.person_id is distinct from old.person_id then raise exception 'A book cannot be moved to another person'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists business_books_guard on public.business_books;
create trigger business_books_guard before update on public.business_books for each row execute function app.guard_book_update();

create or replace function app.touch_business_day() returns trigger language plpgsql as $$
begin
  if new.book_id is distinct from old.book_id then raise exception 'A day cannot move to another book'; end if;
  if new.day is distinct from old.day then raise exception 'The date of a day page cannot be changed'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists business_days_guard on public.business_days;
create trigger business_days_guard before update on public.business_days for each row execute function app.touch_business_day();

-- When a person is removed at their own request, their business numbers go with them.
create or replace function app.trg_person_archived_books() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'archived' and old.status is distinct from 'archived' then
    delete from public.business_books where person_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists people_archived_books on public.people;
create trigger people_archived_books after update of status on public.people for each row execute function app.trg_person_archived_books();

grant select, insert, update, delete on public.business_books, public.business_items, public.business_fixed_costs,
  public.business_days, public.business_day_lines, public.business_reflections to authenticated;
