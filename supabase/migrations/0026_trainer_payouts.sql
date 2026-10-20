-- 0026: paying trainers for work that is done.
-- Money is recorded here, not moved. Each piece of finished work becomes a claim; founders approve it (same two-founder rule as expenses),
-- then a founder records the payment. Everything that decides or pays goes through a function, so the rules hold wherever the call comes from.
-- Mobile-money sending can be switched on later through `payouts.provider` without changing any of this.
-- Safe to run twice.

-- The fee schedule. Founders only: trainers see what they are owed, never the rate card.
create table if not exists public.payout_rates (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('delivery_lead','delivery_co','delivery_observer','followup_visit','qa_visit')),
  tier       smallint check (tier between 0 and 4),       -- null = every tier
  format     text check (format in ('5-day','12-day')),   -- null = every format (delivery kinds only)
  amount_kes int not null check (amount_kes > 0),
  note       text,
  created_at timestamptz not null default now()
);
create unique index if not exists payout_rates_unique on public.payout_rates(kind, coalesce(tier, -1), coalesce(format, ''));

-- Where a trainer wants to be paid. Only a mobile-money number and the name it is registered in: no bank or card numbers are stored.
create table if not exists public.payout_methods (
  person_id    uuid primary key references public.people(id) on delete cascade,
  method       text not null default 'mpesa' check (method in ('mpesa','cash','bank_transfer')),
  account_name text,
  phone        text,
  verified_on  date,
  verified_by  uuid references public.people(id) on delete set null,
  updated_at   timestamptz not null default now(),
  check (method <> 'mpesa' or (phone is not null and length(btrim(phone)) >= 9))
);

-- One row per piece of finished work.
create table if not exists public.payout_claims (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people(id) on delete restrict,
  cohort_id   uuid references public.cohorts(id) on delete set null,
  kind        text not null check (kind in ('delivery','followup_30','followup_60','followup_90','qa_visit','other')),
  description text not null,
  amount_kes  int not null check (amount_kes > 0),
  evidence    jsonb not null default '{}'::jsonb,   -- what the work was checked against, for example reports filed or visits done
  status      text not null default 'pending_work' check (status in ('pending_work','ready','queried','declined','approved','paid','cancelled')),
  decided_on  date,
  created_by  uuid references public.people(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists payout_claims_one_per_work on public.payout_claims(person_id, cohort_id, kind) where cohort_id is not null;
create index if not exists payout_claims_person on public.payout_claims(person_id, status);

create table if not exists public.payout_approvals (
  id          uuid primary key default gen_random_uuid(),
  claim_id    uuid not null references public.payout_claims(id) on delete cascade,
  approver_id uuid not null references public.people(id),
  decision    text not null check (decision in ('approve','decline','query')),
  note        text,
  created_at  timestamptz not null default now(),
  unique (claim_id, approver_id)
);

-- A payment that was made, and the claims it settled.
create table if not exists public.payouts (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references public.people(id) on delete restrict,
  amount_kes   int not null check (amount_kes > 0),
  method       text not null check (method in ('mpesa','cash','bank_transfer')),
  reference    text,                                  -- the M-Pesa code or bank reference
  phone_used   text,
  provider     text not null default 'manual' check (provider in ('manual','mpesa_b2c')),
  provider_ref text,
  status       text not null default 'recorded' check (status in ('recorded','sent','failed')),
  paid_on      date not null default current_date,
  paid_by      uuid references public.people(id) on delete set null,
  created_at   timestamptz not null default now()
);
create table if not exists public.payout_items (
  payout_id uuid not null references public.payouts(id) on delete cascade,
  claim_id  uuid not null unique references public.payout_claims(id) on delete restrict,
  primary key (payout_id, claim_id)
);

alter table public.payout_rates     enable row level security;
alter table public.payout_methods   enable row level security;
alter table public.payout_claims    enable row level security;
alter table public.payout_approvals enable row level security;
alter table public.payouts          enable row level security;
alter table public.payout_items     enable row level security;

-- rate card: founders only
drop policy if exists pr_all on public.payout_rates;
create policy pr_all on public.payout_rates for all using (app.is_founder()) with check (app.is_founder());

-- payout details: you manage your own; founders can read them to pay, and may mark one verified
drop policy if exists pm_read on public.payout_methods;
create policy pm_read on public.payout_methods for select using (person_id = app.me() or app.is_founder());
drop policy if exists pm_insert on public.payout_methods;
create policy pm_insert on public.payout_methods for insert with check (person_id = app.me() and verified_on is null and verified_by is null);
drop policy if exists pm_update on public.payout_methods;
create policy pm_update on public.payout_methods for update
  using (person_id = app.me() or app.is_founder()) with check (person_id = app.me() or app.is_founder());

-- Changing where the money goes clears any earlier verification, so a verified number is always the one that was checked.
create or replace function app.guard_payout_method() returns trigger language plpgsql as $$
declare touched_verification boolean;
begin
  if tg_op = 'UPDATE' then
    touched_verification := new.verified_on is distinct from old.verified_on or new.verified_by is distinct from old.verified_by;
    if touched_verification and new.person_id = app.me() then raise exception 'Nobody verifies their own payout details'; end if;
    if (new.phone is distinct from old.phone or new.method is distinct from old.method) and not touched_verification then
      new.verified_on := null; new.verified_by := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists payout_methods_guard on public.payout_methods;
create trigger payout_methods_guard before update on public.payout_methods for each row execute function app.guard_payout_method();

-- claims: you see your own; founders see all. Founders may create and adjust a claim only until it is approved; approval and payment happen through the functions below.
drop policy if exists pc_read on public.payout_claims;
create policy pc_read on public.payout_claims for select using (person_id = app.me() or app.is_founder());
drop policy if exists pc_insert on public.payout_claims;
create policy pc_insert on public.payout_claims for insert with check (app.is_founder() and status in ('pending_work','ready') and created_by = app.me());
drop policy if exists pc_update on public.payout_claims;
create policy pc_update on public.payout_claims for update
  using (app.is_founder() and status in ('pending_work','ready','queried'))
  with check (app.is_founder() and status in ('pending_work','ready','queried','cancelled'));

drop policy if exists pa_read on public.payout_approvals;
create policy pa_read on public.payout_approvals for select using (
  app.is_founder() or claim_id in (select id from public.payout_claims where person_id = app.me()));

drop policy if exists po_read on public.payouts;
create policy po_read on public.payouts for select using (person_id = app.me() or app.is_founder());
drop policy if exists pi_read on public.payout_items;
create policy pi_read on public.payout_items for select using (
  payout_id in (select id from public.payouts where person_id = app.me()) or app.is_founder());

-- Who a claim is for never changes, and the amount is frozen once approved.
create or replace function app.guard_payout_claim() returns trigger language plpgsql as $$
begin
  if new.person_id is distinct from old.person_id then raise exception 'A claim cannot be moved to another person'; end if;
  if old.status in ('approved','paid','declined','cancelled') and (new.amount_kes is distinct from old.amount_kes or new.kind is distinct from old.kind) then
    raise exception 'A decided claim cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists payout_claims_guard on public.payout_claims;
create trigger payout_claims_guard before update on public.payout_claims for each row execute function app.guard_payout_claim();

-- Approve, decline or query a claim. Either founder may approve up to the threshold; above it both must; nobody decides on their own claim.
create or replace function app.decide_payout_claim(p_claim uuid, p_decision text, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare c public.payout_claims; thr int; need int; n int; res text;
begin
  if not app.is_founder() then raise exception 'Only founders decide on payments'; end if;
  if p_decision not in ('approve','decline','query') then raise exception 'Unknown decision'; end if;
  select * into c from public.payout_claims where id = p_claim for update;
  if not found then raise exception 'Claim not found'; end if;
  if c.person_id = app.me() then raise exception 'You cannot decide on your own claim'; end if;
  if c.status not in ('ready','queried') then raise exception 'This claim is % and cannot be decided now', c.status; end if;
  insert into public.payout_approvals(claim_id, approver_id, decision, note) values (p_claim, app.me(), p_decision, p_note)
    on conflict (claim_id, approver_id) do update set decision = excluded.decision, note = excluded.note, created_at = now();
  select coalesce((select (value #>> '{}')::int from public.settings where key = 'payout_threshold_kes'),
                  (select (value #>> '{}')::int from public.settings where key = 'expense_threshold_kes'), 20000) into thr;
  need := case when c.amount_kes > thr then 2 else 1 end;
  select count(*) into n from public.payout_approvals where claim_id = p_claim and decision = 'approve';
  res := case when p_decision = 'decline' then 'declined' when p_decision = 'query' then 'queried' when n >= need then 'approved' else c.status end;
  update public.payout_claims set status = res, decided_on = case when res in ('approved','declined') then current_date else decided_on end where id = p_claim;
  return res;
end $$;

-- Record a payment that has been made and settle the claims it covers. Not to yourself, only approved claims, only the person's own.
create or replace function app.record_payout(p_person uuid, p_claims uuid[], p_method text, p_reference text, p_paid_on date default current_date) returns uuid
language plpgsql security definer set search_path = public as $$
declare total int; got int; pm public.payout_methods; pid uuid;
begin
  if not app.is_founder() then raise exception 'Only founders record payments'; end if;
  if p_person = app.me() then raise exception 'You cannot record a payment to yourself; the other founder does that'; end if;
  if p_method not in ('mpesa','cash','bank_transfer') then raise exception 'Unknown payment method'; end if;
  if coalesce(array_length(p_claims, 1), 0) = 0 then raise exception 'Choose at least one claim'; end if;
  if p_method <> 'cash' and coalesce(btrim(p_reference), '') = '' then raise exception 'Enter the payment reference (for example the M-Pesa code)'; end if;
  perform 1 from public.payout_claims where id = any(p_claims) for update;   -- lock them so two payments cannot settle the same claim
  select coalesce(sum(amount_kes), 0), count(*) into total, got from public.payout_claims
    where id = any(p_claims) and person_id = p_person and status = 'approved';
  if got <> array_length(p_claims, 1) then raise exception 'Every claim must be approved, belong to this person and still be unpaid'; end if;
  select * into pm from public.payout_methods where person_id = p_person;
  if p_method = 'mpesa' and (pm.person_id is null or pm.method <> 'mpesa') then raise exception 'This person has no M-Pesa number on file'; end if;
  insert into public.payouts(person_id, amount_kes, method, reference, phone_used, paid_on, paid_by)
    values (p_person, total, p_method, nullif(btrim(p_reference), ''), case when p_method = 'mpesa' then pm.phone end, p_paid_on, app.me()) returning id into pid;
  insert into public.payout_items(payout_id, claim_id) select pid, unnest(p_claims);
  update public.payout_claims set status = 'paid' where id = any(p_claims);
  return pid;
end $$;

revoke execute on function app.decide_payout_claim(uuid, text, text), app.record_payout(uuid, uuid[], text, text, date) from public, anon;
grant  execute on function app.decide_payout_claim(uuid, text, text), app.record_payout(uuid, uuid[], text, text, date) to authenticated;

grant select, insert, update, delete on public.payout_rates to authenticated;
grant select, insert, update on public.payout_methods, public.payout_claims to authenticated;
grant select on public.payout_approvals, public.payouts, public.payout_items to authenticated;
