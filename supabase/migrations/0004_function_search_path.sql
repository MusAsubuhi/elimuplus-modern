-- Mirrors the migration applied to the live project (elimu_0004_pin_search_path).
alter function app.is_founder() set search_path = public;
alter function app.is_staff() set search_path = public;
alter function app.is_master_trainer() set search_path = public;
