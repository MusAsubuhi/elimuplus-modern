-- 0043: the rest of the operating system. Founders only for now.
-- Sales pipeline (before a partner is signed), purchase orders, stock and assets, operations tasks and incidents, compliance calendar and data-protection requests.

-- ---------- sales ----------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organisation_id uuid references public.organisations(id) on delete set null,
  contact_name text, phone text, email text, source text,
  stage text not null default 'new' check (stage in ('new','contacted','meeting','proposal','negotiation','won','lost')),
  expected_kes numeric(14,2) not null default 0,
  participants int,
  next_step text, next_on date,
  lost_reason text, notes text,
  closed_on date,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null check (kind in ('call','visit','whatsapp','email','meeting','note')),
  happened_on date not null default current_date,
  note text,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- inventory ----------
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'materials' check (category in ('materials','certificates','refreshments','equipment','other')),
  kind text not null default 'stock' check (kind in ('stock','asset')),
  unit text not null default 'piece',
  reorder_level numeric not null default 0,
  location text, serial text, assigned_to text, condition text,
  purchase_date date, cost_kes numeric(14,2), life_years int,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  delta numeric not null check (delta <> 0),
  reason text not null default 'adjustment' check (reason in ('received','issued_to_cohort','used','lost_damaged','returned','count_correction','adjustment')),
  cohort_id uuid references public.cohorts(id) on delete set null,
  po_id uuid,
  moved_on date not null default current_date,
  note text,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_item on public.stock_movements(item_id);

-- ---------- procurement ----------
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_no text not null unique,
  supplier_id uuid references public.suppliers(id) on delete set null,
  cohort_id uuid references public.cohorts(id) on delete set null,
  purpose text,
  status text not null default 'draft' check (status in ('draft','approved','sent','partly_received','received','cancelled')),
  ordered_on date not null default current_date,
  expected_on date,
  approved_by uuid references public.people(id) on delete set null,
  approved_at timestamptz,
  note text,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.po_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  item_id uuid references public.inventory_items(id) on delete set null,
  description text not null,
  qty numeric not null check (qty > 0),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  received_qty numeric not null default 0
);
alter table public.stock_movements drop constraint if exists stock_movements_po_fk;
alter table public.stock_movements add constraint stock_movements_po_fk foreign key (po_id) references public.purchase_orders(id) on delete set null;

-- ---------- operations ----------
create table if not exists public.ops_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null, detail text,
  owner_name text,
  due_on date,
  recurrence text not null default 'none' check (recurrence in ('none','weekly','monthly','quarterly','yearly')),
  status text not null default 'open' check (status in ('open','done')),
  done_on date,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null default current_date,
  kind text not null check (kind in ('safety','safeguarding','equipment','data','complaint','conduct','other')),
  severity text not null default 'low' check (severity in ('low','medium','high')),
  description text not null, action_taken text,
  status text not null default 'open' check (status in ('open','closed')),
  cohort_id uuid references public.cohorts(id) on delete set null,
  reported_by uuid references public.people(id) on delete set null,
  closed_on date,
  created_at timestamptz not null default now()
);

-- ---------- compliance ----------
create table if not exists public.compliance_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  authority text,
  category text not null default 'other' check (category in ('tax','statutory','licence','insurance','data_protection','safeguarding','contract','other')),
  due_on date,
  recurrence text not null default 'none' check (recurrence in ('none','monthly','quarterly','yearly')),
  status text not null default 'open' check (status in ('open','done')),
  last_done_on date,
  owner_name text, evidence_note text, note text,
  created_at timestamptz not null default now()
);
insert into public.compliance_items(title, authority, category, due_on, recurrence, note)
select * from (values
  ('Remit PAYE, NSSF, SHIF and Housing Levy for last month', 'KRA, NSSF, SHA', 'statutory', date '2026-12-09', 'monthly', 'Due by the 9th of the following month. Payroll shows the amounts.'),
  ('Annual tax returns', 'KRA', 'tax', null::date, 'yearly', 'Set the real due date with your accountant.'),
  ('Business permit renewal', 'County government', 'licence', null::date, 'yearly', 'Set the date on the permit.'),
  ('Data controller registration renewal', 'Office of the Data Protection Commissioner', 'data_protection', null::date, 'yearly', 'Elimu+ keeps names, phones and photos of participants, including children.'),
  ('Work injury (WIBA) insurance renewal', 'Insurer', 'insurance', null::date, 'yearly', 'Cover for employees injured at work.'),
  ('Review the child safeguarding policy and trainer vetting', 'Internal', 'safeguarding', null::date, 'yearly', 'Check every trainer has read and signed it.'),
  ('Review signed consent forms are filed for every cohort', 'Internal', 'data_protection', null::date, 'quarterly', 'Forms come from the Consent forms page.')
) v(title, authority, category, due_on, recurrence, note)
where not exists (select 1 from public.compliance_items);

create table if not exists public.data_requests (
  id uuid primary key default gen_random_uuid(),
  received_on date not null default current_date,
  from_name text not null,
  kind text not null check (kind in ('access','correction','deletion','withdraw_consent','complaint')),
  due_on date not null,
  status text not null default 'open' check (status in ('open','done')),
  outcome text,
  closed_on date,
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['leads','lead_activities','inventory_items','stock_movements','purchase_orders','po_lines','ops_tasks','incidents','compliance_items','data_requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists founders_all on public.%I', t);
    execute format('create policy founders_all on public.%I for all to authenticated using (app.is_founder()) with check (app.is_founder())', t);
  end loop;
end $$;

grant select, insert, update on public.leads to authenticated;
grant select, insert, update on public.lead_activities to authenticated;
grant select, insert, update on public.inventory_items to authenticated;
grant select, insert, update on public.stock_movements to authenticated;
grant select, insert, update on public.purchase_orders to authenticated;
grant select, insert, update on public.po_lines to authenticated;
grant select, insert, update on public.ops_tasks to authenticated;
grant select, insert, update on public.incidents to authenticated;
grant select, insert, update on public.compliance_items to authenticated;
grant select, insert, update on public.data_requests to authenticated;
