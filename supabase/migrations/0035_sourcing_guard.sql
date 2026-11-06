-- Only a founder can approve a supplier choice; the person who raised the need can only recommend.
create or replace function app.guard_sourcing() returns trigger language plpgsql set search_path = public, app as $$
begin
  if not app.is_founder() then
    if new.status in ('selected') or new.selected_quote_id is distinct from old.selected_quote_id
       or new.selected_reason is distinct from old.selected_reason or new.decided_by is distinct from old.decided_by then
      raise exception 'Only a founder can approve a supplier choice';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists sourcing_guard on public.sourcing_needs;
create trigger sourcing_guard before update on public.sourcing_needs for each row execute function app.guard_sourcing();
