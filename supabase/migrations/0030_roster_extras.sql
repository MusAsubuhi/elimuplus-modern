-- A partner may list only as many people as the quotation covers. Anyone beyond that is held as an extra until the partner confirms
-- them, which raises a supplemental invoice (not a new quotation) for the founders to review and send.
alter table public.cohort_roster drop constraint if exists cohort_roster_status_check;
alter table public.cohort_roster add constraint cohort_roster_status_check check (status in ('expected','enrolled','withdrawn','pending_extra'));
alter table public.cohort_roster add column if not exists extra_invoice_id uuid references public.invoices(id) on delete set null;

-- partners can still take back an extra they have not confirmed
drop policy if exists ros_delete on public.cohort_roster;
create policy ros_delete on public.cohort_roster for delete using (
  app.is_staff() or (status in ('expected','pending_extra') and organisation_id in (select app.my_org_admin_orgs())));

-- people already listed beyond what their quotation covers become extras, oldest first kept
with cap as (
  select c.id cohort_id, coalesce((select q.participants from public.quotes q where q.cohort_id = c.id and q.participants is not null order by q.issued_on desc limit 1), c.expected_participants) n
  from public.cohorts c
), ranked as (
  select r.id, row_number() over (partition by r.cohort_id order by r.created_at, r.id) rn, cap.n
  from public.cohort_roster r join cap on cap.cohort_id = r.cohort_id
  where r.status = 'expected' and r.extra_invoice_id is null
)
update public.cohort_roster r set status = 'pending_extra' from ranked where ranked.id = r.id and ranked.n is not null and ranked.rn > ranked.n;
