-- Corrects and completes the four past KE358 cohorts from the real field reports (run once in the Supabase SQL editor).
-- Sources: KE358 30-day and 60-day follow-up reports (Adult Cohort 1), Second Grown-Up Cohort session report and attendance list (Adult Cohort 2),
-- Adult Cohort 3 session report. Visit dates below are the report months (1 May and 1 Oct 2026) because the reports give no day; edit if you know them.
-- Health details are deliberately kept out of the notes; welfare follow-up stays with the CDC.

do $$
declare
  c1 uuid; c2 uuid; c3 uuid; org uuid; pid uuid; eid uuid; sid uuid; sched uuid;
  r record; d record;
begin
  perform set_config('app.skip_alert', '1', true);
  select id into c1 from cohorts where name = 'Adult Cohort 1';
  select id into c2 from cohorts where name = 'Adult Cohort 2';
  select id into c3 from cohorts where name = 'Adult Cohort 3';
  select organisation_id into org from cohorts where id = c1;

  -- 1. Real names. Cohort 1 keeps the "Mama" title the reports use, and every participant now shows their full name, not a first word.
  update people set full_name = 'Mama Dorcas Waema'
    where id in (select person_id from enrolments where cohort_id = c1) and full_name = 'Dorcas Waema';
  update people set display_name = full_name
    where id in (select person_id from enrolments where cohort_id in (c1, c2, c3));

  -- 2. Cohort 1 business details (as recorded at the 30 and 60 day visits).
  update people p set occupation = v.occ from (values
    ('Mama Dorcas Waema', 'Chicken rearing (broilers)'),
    ('Mama Mercy Ndanu', 'Groceries (bananas and tomatoes)'),
    ('Mama Hilda Jochabed', 'Eggs, cakes and sausages (smokies), street-side seller'),
    ('Mama Hajra Malombo', 'Hair salon and hair products'),
    ('Mama Joy Ndila', 'Cake making'),
    ('Mama Nathaniel Chai', 'Second-hand clothes (previously a vegetable stall)'),
    ('Mama Elizabeth Mary', 'Groceries, soap and cakes'),
    ('Mama Bravin Randi', 'Boiled maize'),
    ('Mama Nicole Sandra', 'Second-hand clothes (women''s), hawker'),
    ('Mama Jason Mwangi', 'Second-hand clothes, market hawker')
  ) v(n, occ) where p.full_name = v.n and p.id in (select person_id from enrolments where cohort_id = c1);

  -- 3. Cohort 1 follow-up visits: 30 day (report of May 2026) and 60 day (report of October 2026).
  for d in select * from (values
    -- name, stage, operating, status, urgent, direction, sales, stock_value, challenges, notes
    ('Mama Dorcas Waema', 30, true, 'growing', false, 'higher', 'Increasing (no figure)', 42420, array['Money for medicine and stock','Business capital used for home needs'],
      'Expanded coop space, added stock and won new customers. Needs training on chicken medicine and more stock.'),
    ('Mama Mercy Ndanu', 30, true, 'growing', false, 'higher', 'About KES 5,600/week', 1200, array['Low capital limits stock variety','Business capital used for home needs'],
      'Stock established and first customers won. A wider range (onions, potatoes) would let her serve more clients.'),
    ('Mama Hilda Jochabed', 30, true, 'growing', false, 'higher', 'KES 18,000/week', 2440, array['Depends on outside egg suppliers','No freezer for buying smokies in bulk'],
      'Added sausages in 2026 and sells strongly. Stock value excludes the sausage trolley and egg stand. Needs a freezer. Case study candidate.'),
    ('Mama Hajra Malombo', 30, true, 'struggling', true, 'lower', 'About KES 2,000 (period unclear)', 30000, array['Few customers and limited product variety','Low visibility of the salon'],
      'Needs stock variety, signage, product display and a shopfront refresh. Urgent.'),
    ('Mama Joy Ndila', 30, false, 'closed', true, 'lower', null, null, array['Production failure','No capital to restart','Missing packaging and decorating materials'],
      'Stopped before the visit; only equipment (mixer and scale) remains. Says her original supply list was not fully supplied. Needs a care-sensitive restart plan.'),
    ('Mama Nathaniel Chai', 30, true, 'struggling', true, 'lower', 'KES 1,200-1,500 weekdays; KES 1,700-2,000 Sundays', 1500, array['Stock variety and spoilage','High goods prices','Personal and family circumstances'],
      'Overwhelmed. A welfare referral through the CDC is recommended alongside restocking and simple record keeping.'),
    ('Mama Elizabeth Mary', 30, true, 'growing', false, 'higher', 'KES 6,000/week', 1700, array['Needs a Form B food vending licence','No formal workspace (roadside shade)'],
      'Hired a helper, pays herself a salary and saves. Strong case study.'),
    ('Mama Bravin Randi', 30, true, 'growing', false, 'higher', 'KES 2,400/week', 100, array['Business often closed','Business capital used for home needs','High maize prices','Childcare cost'],
      'Weighing a move from her current location. Needs maize, charcoal and advice on location.'),
    ('Mama Nicole Sandra', 30, true, 'growing', true, 'higher', 'KES 8,500/week', 23000, array['Safety while hawking'],
      'Doing well commercially. Raised a safety concern (attempted theft of stock while hawking) that was flagged to CDC leadership.'),
    ('Mama Jason Mwangi', 30, true, 'growing', false, 'higher', 'KES 5,000/week', 14500, array['Business capital used for home needs','Poor main location','Low capital'],
      'Steady growth. Next stock gap is boys'' trousers.'),

    ('Mama Hajra Malombo', 60, true, 'struggling', true, 'lower', 'About KES 1,000/week', 18500, array['Few customers','Short of hair oil to sell and use','Personal matter affecting the business'],
      'Second decline in a row. Field team recommends free social media marketing and a coaching visit; top up stock against a sales plan.'),
    ('Mama Hilda Jochabed', 60, true, 'growing', false, 'higher', 'About KES 35,000 (period to confirm; treated as weekly)', 14000, array['Rising egg and smokie prices','Stand floods in the rains'],
      'Income roughly doubled since 30 days. Plans a new trolley and a helper; wants a freezer. Strongest performer and a case study candidate.'),
    ('Mama Joy Ndila', 60, false, 'closed', true, 'lower', null, null, array['Business has not restarted'],
      'Still not trading and taking baking classes. Notes also mention hawking cakes, which needs clarifying before a restart plan.'),
    ('Mama Dorcas Waema', 60, true, 'struggling', true, 'lower', null, null, array['Rising feed prices','Owner''s health limits how much she can do'],
      'Holds 98 birds and KES 5,250 for 50 chicks; stock running low. Needs a restocking plan that works around her health (feed for a restock is about KES 21,800).'),
    ('Mama Elizabeth Mary', 60, true, 'growing', false, 'higher', 'About KES 6,000/week', 6800, array['No cake tin','No fridge to stock watermelon'],
      'Cakes grew from 2 kg to 4 kg; reinvested in an umbrella and a turntable. Case study candidate.'),
    ('Mama Nicole Sandra', 60, true, 'stable', false, 'lower', 'KES 12,000-15,000/week (reports income falling)', 35000, array['Fewer customers','Unexpected personal expenses'],
      'Takings are above the 30-day visit yet she reports a decline. Added shoes and new locations. Needs sales records by location.'),
    ('Mama Nathaniel Chai', 60, true, 'growing', false, 'higher', 'About KES 8,000/week', 46000, array['Slow-moving products','Personal and family circumstances'],
      'Changed from vegetables to second-hand clothes after KES 20,000 for a bale. Biggest turnaround in the cohort. Case study candidate.'),
    ('Mama Jason Mwangi', 60, true, 'growing', false, 'higher', 'Not confirmed (KES 5,000/week at 30 days)', null, array['Transport between sites','School-holiday dip','Business capital used for home needs'],
      'Moved from KES 8,000 to KES 13,000 bales. Needs market linkage.'),
    ('Mama Bravin Randi', 60, true, 'struggling', true, 'higher', 'KES 6,000-6,500/week (as reported)', null, array['Stand often closed','Not enough stock','High maize prices','Business capital used for home needs'],
      'Field impression, not verified: doing less well than she reports. Agree a 30-day sales record before more capital.')
  ) as t(name, stage, operating, status, urgent, direction, sales, stock, challenges, notes)
  loop
    select e.id into eid from enrolments e join people p on p.id = e.person_id where e.cohort_id = c1 and p.full_name = d.name;
    if eid is null then raise exception 'No cohort 1 enrolment for %', d.name; end if;
    insert into followup_schedule(enrolment_id, visit, due_date, window_end, status, attempts)
      values (eid, d.stage, case d.stage when 30 then date '2026-05-01' else date '2026-10-01' end,
              case d.stage when 30 then date '2026-05-01' else date '2026-10-01' end, 'done', 1)
      on conflict (enrolment_id, visit) do update set status = 'done', attempts = 1
      returning id into sched;
    insert into followup_visits(schedule_id, visited_on, still_operating, income_direction, weekly_sales_range, stock_cash_value_kes, challenges, notes)
      values (sched, case d.stage when 30 then date '2026-05-01' else date '2026-10-01' end, d.operating, d.direction, d.sales, d.stock, d.challenges,
              d.notes || ' (From the ' || d.stage || '-day report; visit date is the report month.)')
      on conflict (schedule_id) do nothing;
    insert into followup_forms(stage, cohort_id, enrolment_id, officer_text, participant_name, visited_on, business_status, urgent, operating,
                               sales_range, stock_value_kes, answers, response_id, source)
      values (d.stage, c1, eid, 'Elimu+ field team (from the ' || d.stage || '-day report)', d.name,
              case d.stage when 30 then date '2026-05-01' else date '2026-10-01' end, d.status, d.urgent, d.operating, d.sales, d.stock,
              jsonb_build_object('a1_operating', case when d.operating then 'Yes' else 'Closed' end,
                                 'a4_sales_range', d.sales, 'a3_stock_value', d.stock,
                                 'a4_compare', case d.direction when 'higher' then 'Higher' when 'lower' then 'Lower' else 'About the same' end,
                                 'c_status', initcap(d.status), 'c_urgent', case when d.urgent then 'Yes' else 'No' end,
                                 'a7_category', d.challenges[1], 'a7_words', d.notes, 'visited_on', case d.stage when 30 then '2026-05-01' else '2026-10-01' end,
                                 '_source', 'historical report'),
              'hist-c1-' || d.stage || '-' || replace(lower(d.name), ' ', '-'), 'historical_report')
      on conflict (response_id) do nothing;
  end loop;

  -- Mama Mercy Ndanu could not be reached for the 60-day visit (bereavement in her family): record the attempt, no invented data.
  select e.id into eid from enrolments e join people p on p.id = e.person_id where e.cohort_id = c1 and p.full_name = 'Mama Mercy Ndanu';
  insert into followup_schedule(enrolment_id, visit, due_date, window_end, status, attempts)
    values (eid, 60, date '2026-10-01', date '2026-10-01', 'unreachable', 1)
    on conflict (enrolment_id, visit) do update set status = 'unreachable', attempts = 1;

  -- 4. Adult Cohort 2: Lizlet Awuor has a business (type not disclosed); add Stacy (Day 1 only, phone not recorded, business status not yet known so recorded as no business); load attendance for all three days.
  update enrolments set has_business_at_entry = true
    where cohort_id = c2 and person_id in (select id from people where full_name = 'Lizlet Awuor');
  update people set occupation = 'Has a business (type not disclosed)' where full_name = 'Lizlet Awuor' and occupation is null;

  if not exists (select 1 from enrolments e join people p on p.id = e.person_id where e.cohort_id = c2 and p.full_name = 'Stacy') then
    insert into people(full_name, display_name, preferred_language) values ('Stacy', 'Stacy', 'sw') returning id into pid;
    insert into role_assignments(person_id, role, organisation_id) values (pid, 'participant', org);
    insert into enrolments(cohort_id, person_id, has_business_at_entry, track) values (c2, pid, false, 'standard') returning id into eid;
    insert into canvases(enrolment_id) values (eid) on conflict (enrolment_id) do nothing;
  end if;

  for r in select e.id eid, p.full_name from enrolments e join people p on p.id = e.person_id where e.cohort_id = c2 loop
    for sid in select id from sessions where cohort_id = c2 loop
      insert into attendance(session_id, enrolment_id, present)
        values (sid, r.eid, r.full_name <> 'Stacy' or (select day_number from sessions where id = sid) = 1)
        on conflict (session_id, enrolment_id) do update set present = excluded.present;
    end loop;
  end loop;

  -- 5. Adult Cohort 3: real business status and type for each caregiver (9 run a business, 3 intend to start).
  update enrolments e set has_business_at_entry = (p.full_name not in ('Caren Adhiambo', 'Mwanasiti Nyamawi', 'Lorine Kambi'))
    from people p where p.id = e.person_id and e.cohort_id = c3;
  update people p set occupation = v.occ from (values
    ('Roselyne Otieno', 'Selling leso (fabric wraps)'),
    ('Stellar Masika', 'Salon'),
    ('Roda Paul', 'Selling building stones'),
    ('Caren Adhiambo', 'Selling makaa (charcoal) (intends to start)'),
    ('Dorcas Peter', 'Salon'),
    ('Mariam Mwangolo', 'Selling leso (fabric wraps)'),
    ('Elizabeth Musango', 'Selling makaa (charcoal)'),
    ('Mwanasiti Nyamawi', 'Second-hand clothes, children''s (intends to start)'),
    ('Elizabeth Furaha', 'Hawker, second-hand clothes'),
    ('Mary Nabwire', 'Selling makaa (charcoal)'),
    ('Susan Peter', 'Selling onions')
  ) v(n, occ) where p.full_name = v.n and p.id in (select person_id from enrolments where cohort_id = c3);
end $$;

-- Check: should show 10, 9 (the 8 plus Stacy) and 12 people, and 19 follow-up forms on Adult Cohort 1 (10 at 30 days, 9 at 60 days; Mercy was unreachable).
select c.name cohort, count(*) enrolled,
       count(*) filter (where e.has_business_at_entry) with_business,
       (select count(*) from followup_forms f where f.cohort_id = c.id) followup_forms
from cohorts c join enrolments e on e.cohort_id = c.id
where c.name like 'Adult Cohort%' group by c.id, c.name order by c.name;
