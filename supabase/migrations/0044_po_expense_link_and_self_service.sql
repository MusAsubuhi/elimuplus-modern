-- 0044: a purchase order can be paid by one or more expenses, and an employee can be tied to one portal login so they can see their own payslips.
alter table public.expense_requests add column if not exists po_id uuid references public.purchase_orders(id) on delete set null;
create index if not exists expense_requests_po on public.expense_requests(po_id) where po_id is not null;
create unique index if not exists employees_one_login on public.employees(person_id) where person_id is not null;
