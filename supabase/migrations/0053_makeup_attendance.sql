-- A person can attend outside the normal class times (a make-up lesson, a later visit). The day stays "absent" for the class register,
-- but the make-up is recorded with its date, a note and who recorded it, and it counts towards completing the programme.
alter table public.attendance add column if not exists made_up_on date;
alter table public.attendance add column if not exists made_up_note text;
alter table public.attendance add column if not exists made_up_by uuid references public.people(id);
