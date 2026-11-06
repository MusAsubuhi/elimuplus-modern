-- Suppliers (open categories and regions), reviews, sourcing, and the founders' own "needs me" items.

alter table public.expense_requests add column if not exists supplier_id uuid;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  offers text,
  notes text,
  categories text[] not null default '{}',
  regions text[] not null default '{}',
  status text not null default 'suggested' check (status in ('suggested','active','on_hold','blocked','declined')),
  suggested_by uuid references public.people(id),
  approved_by uuid references public.people(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists suppliers_name_uq on public.suppliers (lower(name));
alter table public.suppliers enable row level security;
drop policy if exists sup_read on public.suppliers;
create policy sup_read on public.suppliers for select to authenticated using (
  app.is_founder() or suggested_by = app.me()
  or (status in ('active','on_hold') and (app.has_role('facilitator') or app.is_staff())));
drop policy if exists sup_insert on public.suppliers;
create policy sup_insert on public.suppliers for insert to authenticated with check (
  app.is_founder() or (status = 'suggested' and suggested_by = app.me() and (app.has_role('facilitator') or app.is_staff())));
drop policy if exists sup_update on public.suppliers;
create policy sup_update on public.suppliers for update to authenticated using (app.is_founder()) with check (app.is_founder());
grant select, insert, update on public.suppliers to authenticated;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expense_requests_supplier_fk') then
    alter table public.expense_requests add constraint expense_requests_supplier_fk foreign key (supplier_id) references public.suppliers(id) on delete set null;
  end if;
end $$;

create table if not exists public.supplier_reviews (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  reviewer_id uuid not null references public.people(id),
  expense_id uuid references public.expense_requests(id) on delete set null,
  cohort_id uuid references public.cohorts(id) on delete set null,
  price smallint not null check (price between 1 and 5),
  quality smallint not null check (quality between 1 and 5),
  reliability smallint not null check (reliability between 1 and 5),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists supplier_reviews_supplier on public.supplier_reviews(supplier_id);
alter table public.supplier_reviews enable row level security;
drop policy if exists srv_read on public.supplier_reviews;
create policy srv_read on public.supplier_reviews for select to authenticated using (app.is_founder() or app.has_role('facilitator') or app.is_staff());
drop policy if exists srv_insert on public.supplier_reviews;
create policy srv_insert on public.supplier_reviews for insert to authenticated with check (reviewer_id = app.me() and (app.is_founder() or app.has_role('facilitator') or app.is_staff()));
grant select, insert on public.supplier_reviews to authenticated;

create table if not exists public.sourcing_needs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text,
  category text,
  region text,
  cohort_id uuid references public.cohorts(id) on delete set null,
  budget_kes int,
  status text not null default 'open' check (status in ('open','recommended','selected','closed')),
  raised_by uuid not null references public.people(id),
  recommended_quote_id uuid,
  recommended_reason text,
  selected_quote_id uuid,
  selected_reason text,
  decided_by uuid references public.people(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.sourcing_quotes (
  id uuid primary key default gen_random_uuid(),
  need_id uuid not null references public.sourcing_needs(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id),
  amount_kes int,
  notes text,
  added_by uuid not null references public.people(id),
  created_at timestamptz not null default now(),
  unique (need_id, supplier_id)
);
alter table public.sourcing_needs enable row level security;
alter table public.sourcing_quotes enable row level security;
drop policy if exists sn_read on public.sourcing_needs;
create policy sn_read on public.sourcing_needs for select to authenticated using (app.is_founder() or raised_by = app.me() or app.has_role('facilitator') or app.is_staff());
drop policy if exists sn_insert on public.sourcing_needs;
create policy sn_insert on public.sourcing_needs for insert to authenticated with check (raised_by = app.me() and (app.is_founder() or app.has_role('facilitator') or app.is_staff()));
drop policy if exists sn_update on public.sourcing_needs;
create policy sn_update on public.sourcing_needs for update to authenticated using (app.is_founder() or (raised_by = app.me() and status in ('open','recommended'))) with check (app.is_founder() or (raised_by = app.me() and status in ('open','recommended')));
drop policy if exists sq_read on public.sourcing_quotes;
create policy sq_read on public.sourcing_quotes for select to authenticated using (exists (select 1 from public.sourcing_needs n where n.id = need_id));
drop policy if exists sq_insert on public.sourcing_quotes;
create policy sq_insert on public.sourcing_quotes for insert to authenticated with check (added_by = app.me() and exists (select 1 from public.sourcing_needs n where n.id = need_id and (app.is_founder() or n.raised_by = app.me())));
grant select, insert, update on public.sourcing_needs to authenticated;
grant select, insert on public.sourcing_quotes to authenticated;

-- founders' own to-do items for the Needs me list (for example "reply to a partner"); email is added later
create table if not exists public.founder_todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text,
  link text,
  due_on date,
  created_by uuid not null references public.people(id),
  done_at timestamptz,
  done_by uuid references public.people(id),
  created_at timestamptz not null default now()
);
alter table public.founder_todos enable row level security;
drop policy if exists ft_all on public.founder_todos;
create policy ft_all on public.founder_todos for all to authenticated using (app.is_founder()) with check (app.is_founder());
grant select, insert, update on public.founder_todos to authenticated;
