-- A discount is a negative line on the quotation, added by a founder at any time.
alter table public.quote_lines drop constraint if exists quote_lines_kind_check;
alter table public.quote_lines add constraint quote_lines_kind_check check (kind in ('training','followup_30','followup_60','followup_90','other','discount'));
-- The first quotation covers the training only; the follow-up visits are quoted separately once the training is done.
alter table public.quotes add column if not exists scope text not null default 'training';
alter table public.quotes drop constraint if exists quotes_scope_check;
alter table public.quotes add constraint quotes_scope_check check (scope in ('training','followup'));
