-- A trainer confirms each day's attendance (whether it came from the Google Form or was ticked in the portal).
alter table public.sessions add column if not exists attendance_confirmed_at timestamptz;
alter table public.sessions add column if not exists attendance_confirmed_by uuid references public.people(id);
