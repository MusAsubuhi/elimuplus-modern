-- Partners create cohorts as themselves (row level security applies), and a new cohort draws its number from public.cohort_seq.
-- Migration 0020 created the sequence but never granted it, so every partner request failed with "permission denied for sequence cohort_seq".
grant usage, select on sequence public.cohort_seq to authenticated;
-- Same for the audit log counter, in case a signed-in session ever writes an audit row directly.
grant usage, select on sequence public.audit_log_id_seq to authenticated;
