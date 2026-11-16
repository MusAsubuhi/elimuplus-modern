-- Young people being nominated or booked often have no phone or email of their own, so contact is optional.
alter table public.invitations alter column contact drop not null;
