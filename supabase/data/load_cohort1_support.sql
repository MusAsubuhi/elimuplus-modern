-- Loads the support given to the ten Adult Cohort 1 women into the finance ledger (run once in the Supabase SQL editor).
-- Source: KE358 30-day report (KES 153,940 by line items; the report's own headline of 153,640 is a KES 300 typo) and the 60-day report
-- (+KES 59,250), giving KES 213,190 in total. The reports give the month, not the day, so entries are dated 1 May 2026 (recorded in the 30-day report)
-- or 1 October 2026 (added by the 60-day report). The funder is not stated in the reports, so it is left blank; fill it in on the Finance page if you wish.

do $$
declare c1 uuid; r record; eid uuid; total int;
begin
  select id into c1 from cohorts where name = 'Adult Cohort 1';
  if exists (select 1 from support_ledger s join enrolments e on e.id = s.enrolment_id where e.cohort_id = c1) then
    raise exception 'Support for Adult Cohort 1 is already loaded; nothing was changed.';
  end if;

  for r in select * from (values
    ('Mama Dorcas Waema', date '2026-05-01', 5250,  '50 chicks (recorded in the 30-day report)'),
    ('Mama Dorcas Waema', date '2026-05-01', 8480,  '2 bags of starter feed (recorded in the 30-day report)'),
    ('Mama Dorcas Waema', date '2026-05-01', 15960, '2 bags of finisher feed (recorded in the 30-day report)'),
    ('Mama Dorcas Waema', date '2026-05-01', 2100,  'Chicken medicine (recorded in the 30-day report)'),
    ('Mama Dorcas Waema', date '2026-05-01', 450,   'Vaccines (recorded in the 30-day report)'),
    ('Mama Dorcas Waema', date '2026-05-01', 1500,  'Disinfectant (recorded in the 30-day report)'),
    ('Mama Mercy Ndanu', date '2026-05-01', 3500,   '1 crate of tomatoes (recorded in the 30-day report)'),
    ('Mama Mercy Ndanu', date '2026-05-01', 2500,   '1 crate of bananas (recorded in the 30-day report)'),
    ('Mama Hilda Jochabed', date '2026-05-01', 24000, 'Cake baking oven (recorded in the 30-day report)'),
    ('Mama Hajra Malombo', date '2026-05-01', 11495, 'Blow dryer, hair braids and hair oil (recorded in the 30-day report)'),
    ('Mama Joy Ndila', date '2026-05-01', 2200,     'Mixer (recorded in the 30-day report)'),
    ('Mama Joy Ndila', date '2026-05-01', 870,      'Weighing scale (recorded in the 30-day report)'),
    ('Mama Joy Ndila', date '2026-05-01', 1285,     'Baking ingredients (recorded in the 30-day report)'),
    ('Mama Nathaniel Chai', date '2026-05-01', 2800, '1 crate of bananas (recorded in the 30-day report)'),
    ('Mama Nathaniel Chai', date '2026-05-01', 4500, '1 crate of tomatoes (recorded in the 30-day report)'),
    ('Mama Nathaniel Chai', date '2026-10-01', 20000, 'Cash for a bale of clothes (added by the 60-day report)'),
    ('Mama Elizabeth Mary', date '2026-05-01', 2300, '1 crate of bananas (recorded in the 30-day report)'),
    ('Mama Elizabeth Mary', date '2026-05-01', 24000, 'Cake baking oven (recorded in the 30-day report)'),
    ('Mama Bravin Randi', date '2026-05-01', 750,   '25 pieces of green maize (recorded in the 30-day report)'),
    ('Mama Bravin Randi', date '2026-10-01', 29250, 'Further support, two rounds in total (added by the 60-day report; itemised detail to be confirmed)'),
    ('Mama Nicole Sandra', date '2026-05-01', 22000, '1 bale of cotton dresses (recorded in the 30-day report)'),
    ('Mama Nicole Sandra', date '2026-10-01', 10000, 'Supplementary support (added by the 60-day report)'),
    ('Mama Jason Mwangi', date '2026-05-01', 18000, '1 bale of second-hand clothes (recorded in the 30-day report)')
  ) as t(name, dt, amt, item)
  loop
    select e.id into eid from enrolments e join people p on p.id = e.person_id where e.cohort_id = c1 and p.full_name = r.name;
    if eid is null then raise exception 'No Adult Cohort 1 enrolment for %', r.name; end if;
    insert into support_ledger(enrolment_id, entry_date, amount_kes, item) values (eid, r.dt, r.amt, r.item);
  end loop;

  select coalesce(sum(s.amount_kes), 0) into total from support_ledger s join enrolments e on e.id = s.enrolment_id where e.cohort_id = c1;
  if total <> 213190 then raise exception 'Total is %, expected 213190; nothing was saved.', total; end if;
end $$;

-- Check: Adult Cohort 1 should total KES 213,190 across 23 entries.
select count(*) entries, sum(s.amount_kes) total_kes
from support_ledger s join enrolments e on e.id = s.enrolment_id join cohorts c on c.id = e.cohort_id where c.name = 'Adult Cohort 1';
