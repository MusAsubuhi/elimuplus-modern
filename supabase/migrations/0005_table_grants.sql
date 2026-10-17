-- Mirrors the migration applied to the live project (elimu_0005_table_grants).
-- Row level security decides which rows each person sees; the signed-in role still needs base privileges.
-- The list is explicit so tables that belong to other apps in the same Supabase project are never touched.
grant usage on schema app to authenticated;
grant select, insert, update, delete on
  public.agreements, public.attendance, public.audit_log, public.canvas_answers, public.canvas_boxes,
  public.canvas_comments, public.canvas_unlocks, public.canvases, public.certifications,
  public.cohort_facilitators, public.cohorts, public.directory_listings, public.documents,
  public.enrolments, public.expense_approvals, public.expense_categories, public.expense_requests,
  public.followup_schedule, public.followup_visits, public.invitations, public.invoices,
  public.organisations, public.payments, public.people, public.qa_visits, public.quote_lines,
  public.quotes, public.reports, public.role_assignments, public.session_logs, public.sessions,
  public.settings, public.support_ledger, public.trainer_payments, public.welfare_flags
to authenticated;
