-- 0041: chart of accounts, money accounts, opening position and a small ledger for what is not an invoice or an expense.
-- Statements are worked out from invoices, payments, expenses and trainer claims on an accrual basis; nothing here duplicates them.
-- Founders only. Support money given to participants (support_ledger) is deliberately not part of any of this.

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('income','direct_cost','overhead')),
  is_system boolean not null default false,
  active boolean not null default true,
  note text,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);

insert into public.accounts(code, name, kind, is_system, note) values
  ('4000','Training fees','income',true,'Invoices for training delivered'),
  ('4100','Follow-up visit fees','income',true,'Invoices for the 30, 60 and 90 day visits'),
  ('4900','Other income','income',true,'Anything else earned, such as a donation for running costs'),
  ('5100','Trainer and facilitator fees','direct_cost',true,'Approved trainer claims and fees paid for delivery'),
  ('5200','Venue and hall hire','direct_cost',true,null),
  ('5300','Training materials and printing','direct_cost',true,'Workbooks, flipcharts, consent forms, certificates paper'),
  ('5400','Participant meals and refreshments','direct_cost',true,null),
  ('5500','Transport and travel','direct_cost',true,'Fares, fuel and boda-boda to sessions and visits'),
  ('5600','Certificates and recognition','direct_cost',true,null),
  ('6100','Salaries and wages','overhead',true,'Gross pay of employees (from payroll)'),
  ('6110','Employer statutory contributions','overhead',true,'NSSF, Housing Levy and NITA paid on top of pay (from payroll)'),
  ('6200','Marketing and social media','overhead',true,'Adverts, boosts, design, forum promotion'),
  ('6300','Software and subscriptions','overhead',true,null),
  ('6400','Airtime and data','overhead',true,null),
  ('6500','Banking and mobile-money fees','overhead',true,null),
  ('6600','Professional fees','overhead',true,'Accountant, lawyer, consultants'),
  ('6700','Admin and licences','overhead',true,null),
  ('6800','Insurance','overhead',true,'Including work injury (WIBA) cover'),
  ('6900','Equipment and small assets','overhead',true,'Items too small to keep on the asset list'),
  ('6910','Depreciation','overhead',true,'Wear on equipment over its life'),
  ('6990','Other costs','overhead',true,null)
on conflict (code) do nothing;

-- Every cost account is also something an expense can be recorded against.
alter table public.expense_categories add column if not exists account_id uuid references public.accounts(id) on delete set null;
insert into public.expense_categories(name, account_id)
select a.name, a.id from public.accounts a where a.kind in ('direct_cost','overhead') and a.code not in ('6100','6110','6910')
on conflict (name) do update set account_id = coalesce(public.expense_categories.account_id, excluded.account_id);
update public.expense_categories k set account_id = (select id from public.accounts where code = case
    when k.name ilike '%software%' then '6300' when k.name ilike '%marketing%' or k.name ilike '%social%' then '6200'
    when k.name ilike '%airtime%' or k.name ilike '%data%' then '6400' when k.name ilike '%bank%' or k.name ilike '%fee%' then '6500'
    when k.name ilike '%meal%' or k.name ilike '%refresh%' then '5400' when k.name ilike '%equip%' then '6900'
    when k.name ilike '%transport%' or k.name ilike '%travel%' then '5500' when k.name ilike '%venue%' or k.name ilike '%hall%' then '5200'
    when k.name ilike '%print%' or k.name ilike '%material%' then '5300' when k.name ilike '%admin%' or k.name ilike '%licen%' then '6700'
    else '6990' end)
 where k.account_id is null;

-- A category added later without an account lands on "Other costs" until a founder moves it.
create or replace function app.category_default_account() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.account_id is null then new.account_id := (select id from public.accounts where code = '6990'); end if;
  return new;
end $$;
drop trigger if exists category_default_account on public.expense_categories;
create trigger category_default_account before insert on public.expense_categories for each row execute function app.category_default_account();

-- Where the money sits. One row each for the bank, M-Pesa and cash on hand; the opening figure is the real balance on the books start date.
create table if not exists public.money_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('bank','mpesa','cash')),
  opening_kes bigint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.money_accounts(name, kind) select * from (values ('Bank account','bank'),('M-Pesa','mpesa'),('Cash on hand','cash')) v(n,k)
 where not exists (select 1 from public.money_accounts);

-- A real balance read from the bank, M-Pesa statement or a cash count on a date, to compare with what the books say.
create table if not exists public.money_checks (
  id uuid primary key default gen_random_uuid(),
  money_account_id uuid not null references public.money_accounts(id) on delete cascade,
  checked_on date not null,
  actual_kes bigint not null,
  note text,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);

-- The opening position, filled in when the founders are ready. Receivables and payables at the start date are worked out, not typed.
create table if not exists public.opening_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('equipment','prepayment','other_asset','loan','other_liability','capital')),
  label text not null,
  amount_kes bigint not null check (amount_kes >= 0),
  note text,
  voided_at timestamptz,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Things that happen to the books that are not an invoice, a payment or an expense.
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  kind text not null check (kind in ('capital_in','drawings','loan_in','loan_repaid','asset_purchase','depreciation','other_income')),
  amount_kes bigint not null check (amount_kes > 0),
  money_account_id uuid references public.money_accounts(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  cohort_id uuid references public.cohorts(id) on delete set null,
  description text,
  voided_at timestamptz,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ledger_entries_date on public.ledger_entries(entry_date);

do $$ declare t text; begin
  foreach t in array array['accounts','money_accounts','money_checks','opening_items','ledger_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists founders_all on public.%I', t);
    execute format('create policy founders_all on public.%I for all to authenticated using (app.is_founder()) with check (app.is_founder())', t);
  end loop;
end $$;
-- the expense form needs the cost accounts, so trainers can read them (name and code only matter)
drop policy if exists accounts_read on public.accounts;
create policy accounts_read on public.accounts for select to authenticated using (app.is_founder() or app.has_role('facilitator') or app.is_staff());

grant select, insert, update on public.accounts to authenticated;
grant select, insert, update on public.money_accounts to authenticated;
grant select, insert on public.money_checks to authenticated;
grant select, insert, update on public.opening_items to authenticated;
grant select, insert, update on public.ledger_entries to authenticated;
