-- Money spent for Elimu+: record it after the fact, say where it came from, attach receipts, and reconcile it.
alter table public.expense_requests
  add column if not exists paid_from text not null default 'to_be_paid' check (paid_from in ('to_be_paid','own_pocket','bank','cash','mpesa')),
  add column if not exists spent_on date,
  add column if not exists reference text,
  add column if not exists late boolean not null default false,
  add column if not exists reconciled_on date,
  add column if not exists reconciled_by uuid references public.people(id);

-- trainees (Tier 0) may record spending too
drop policy if exists er_insert on public.expense_requests;
create policy er_insert on public.expense_requests for insert with check (
  requester_id = app.me() and status = 'submitted' and (app.has_role('facilitator') or app.is_staff()));

create table if not exists public.expense_receipts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.expense_requests(id) on delete cascade,
  storage_path text not null unique,
  kind text not null default 'image' check (kind in ('image','pdf')),
  uploaded_by uuid references public.people(id),
  created_at timestamptz not null default now()
);
create index if not exists expense_receipts_request on public.expense_receipts(request_id);
alter table public.expense_receipts enable row level security;
drop policy if exists xr_read on public.expense_receipts;
create policy xr_read on public.expense_receipts for select to authenticated using (
  exists (select 1 from public.expense_requests r where r.id = request_id));
grant select on public.expense_receipts to authenticated;

insert into public.expense_categories(id, name)
select gen_random_uuid(), n from unnest(array['Software and subscriptions','Marketing and social media','Airtime and data','Banking and mobile-money fees','Meals and refreshments','Equipment','Admin and licences']) n
where not exists (select 1 from public.expense_categories c where lower(c.name) = lower(n));

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('expense-receipts', 'expense-receipts', false, 3145728, array['image/jpeg','application/pdf'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
