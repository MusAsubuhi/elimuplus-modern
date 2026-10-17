-- Loads the four delivered Elimu+ cohorts for KE358 Deliverance Church Likoni CDC (youth cohort 1, adult cohorts 1 to 3),
-- with participants, session dates, cohort 3 attendance and the outstanding follow-up visits.
-- Safe to run once: it stops if cohort 3 is already there. Run it in the Supabase SQL editor.
do $$
declare
  org uuid; cy uuid; c1 uuid; c2 uuid; c3 uuid;
  r jsonb; pid uuid; eid uuid; sid uuid; cid uuid; d int;
begin
  if exists (select 1 from public.cohorts where name = 'Adult Cohort 3') then raise exception 'Past cohorts are already loaded'; end if;

  insert into public.organisations(name, type, county, status, venue_name, what_they_do)
  values ('KE358 Deliverance Church Likoni CDC', 'cdc', 'Mombasa', 'active', 'Deliverance Church International, Likoni', 'Child Development Centre partner that hosts the Elimu+ youth and caregiver programmes')
  returning id into org;
  insert into public.agreements(organisation_id) values (org) on conflict do nothing;

  insert into public.cohorts(organisation_id, name, format, language, audience, start_date, end_date, venue, expected_participants, status) values
    (org, 'Youth Cohort 1', '5-day', 'sw', 'Youth (school holidays, 2025)', null, null, 'KE358 CDC, Likoni', 15, 'closed') returning id into cy;
  insert into public.cohorts(organisation_id, name, format, language, audience, start_date, end_date, venue, expected_participants, status) values
    (org, 'Adult Cohort 1', '3-day-legacy', 'sw', 'Women entrepreneurs, caregivers (January 2026)', null, null, 'KE358 CDC, Likoni', 10, 'followup') returning id into c1;
  insert into public.cohorts(organisation_id, name, format, language, audience, start_date, end_date, venue, expected_participants, status) values
    (org, 'Adult Cohort 2', '3-day-legacy', 'sw', 'Caregivers (the Second Grown-Up Cohort)', '2026-05-19', '2026-05-21', 'KE358 CDC, Likoni', 9, 'followup') returning id into c2;
  insert into public.cohorts(organisation_id, name, format, language, audience, start_date, end_date, venue, expected_participants, status) values
    (org, 'Adult Cohort 3', '5-day', 'sw', 'Caregivers', '2026-09-14', '2026-09-18', 'Deliverance Church International, Likoni', 15, 'followup') returning id into c3;

  -- participants: name, phone (null when not recorded), business or idea, has a business at entry, cohort
  for r in select * from jsonb_array_elements('[
    ["Dorcas Waema",null,"Chicken rearing (broilers)",true,1],
    ["Mama Mercy Ndanu",null,"Groceries (bananas and tomatoes)",true,1],
    ["Mama Hilda Jochabed",null,"Hawker: eggs, cakes and sausages",true,1],
    ["Mama Hajra Malombo",null,"Hair dressing and hair products",true,1],
    ["Mama Joy Ndila",null,"Cake making",true,1],
    ["Mama Nathaniel Chai",null,"Vegetable stall",true,1],
    ["Mama Elizabeth Mary",null,"Bananas and cake sales",true,1],
    ["Mama Bravin Randi",null,"Boiled maize seller",true,1],
    ["Mama Nicole Sandra",null,"Second-hand clothes (hawker)",true,1],
    ["Mama Jason Mwangi",null,"Second-hand clothes (market)",true,1],
    ["Lizlet Awuor","0115460388",null,false,2],
    ["Rehema Athuman","0757400383","Tailoring",true,2],
    ["Lorine Kambi","0740063081","Hair salon (intends to start)",false,2],
    ["Yemima Nanjala","0741575694","Selling firewood and omena (intends to start)",false,2],
    ["Mornicah Matama","0114929354","Selling firewood and charcoal",true,2],
    ["Mweni Topista","0702786075","Selling charcoal and katashingo (intends to start)",false,2],
    ["Emily N. Muthuvi","0706655803","Children''s clothes (intends to start)",false,2],
    ["Esther Kaari","0113955180","Selling omena",true,2],
    ["Roselyne Otieno","0724278986",null,true,3],
    ["Stellar Masika","0790774544",null,true,3],
    ["Roda Paul","0748373801",null,true,3],
    ["Caren Adhiambo","0702355647",null,true,3],
    ["Dorcas Peter","0746252778",null,true,3],
    ["Mariam Mwangolo","0746690215",null,true,3],
    ["Elizabeth Musango","0707437258",null,true,3],
    ["Mwanasiti Nyamawi","0740620056",null,true,3],
    ["Elizabeth Furaha","0748195782",null,true,3],
    ["Mary Nabwire","0726270611",null,true,3],
    ["Susan Peter","0762268854",null,true,3],
    ["Lorine Kambi","0740063081","Hair salon (intends to start)",false,3]
  ]'::jsonb) loop
    cid := case (r->>4)::int when 1 then c1 when 2 then c2 else c3 end;
    pid := null;
    if r->>1 is not null then select id into pid from public.people where phone = r->>1 limit 1; end if;
    if pid is null then
      insert into public.people(full_name, display_name, phone, preferred_language, occupation)
      values (r->>0, split_part(r->>0, ' ', 1), r->>1, 'sw', r->>2) returning id into pid;
      insert into public.role_assignments(person_id, role, organisation_id) values (pid, 'participant', org);
    end if;
    insert into public.enrolments(cohort_id, person_id, has_business_at_entry, track, status)
    values (cid, pid, (r->>3)::boolean, 'standard', 'completed') returning id into eid;
    insert into public.canvases(enrolment_id) values (eid) on conflict do nothing;
  end loop;

  -- sessions
  for d in 1..3 loop
    insert into public.sessions(cohort_id, day_number, session_date, topic) values (c2, d, date '2026-05-18' + d, 'SEE Canvas');
  end loop;
  for d in 1..5 loop
    insert into public.sessions(cohort_id, day_number, session_date, topic)
    values (c3, d, date '2026-09-13' + d, case when d <= 3 then 'Front canvas (10 sections)' else 'Cost versus income' end);
  end loop;

  -- cohort 3 attendance, from the paper registers: everyone has a row for every day
  insert into public.attendance(session_id, enrolment_id, present)
  select s.id, e.id,
    case p.full_name
      when 'Mary Nabwire' then s.day_number <= 4
      when 'Susan Peter' then s.day_number >= 3
      when 'Lorine Kambi' then s.day_number = 2
      else true end
  from public.sessions s join public.enrolments e on e.cohort_id = s.cohort_id join public.people p on p.id = e.person_id
  where s.cohort_id = c3;

  -- follow-up visits still to do (cohort 2 on the recovery rounds, cohort 3 on the standard 30, 60 and 90 days)
  insert into public.followup_schedule(enrolment_id, visit, due_date)
  select e.id, v.visit, case e.cohort_id when c3 then v.d3 else v.d2 end
  from public.enrolments e
  cross join (values (30, date '2026-10-18', date '2026-10-14'), (60, date '2026-11-17', date '2026-11-13'), (90, date '2026-12-15', date '2026-12-13')) v(visit, d3, d2)
  where e.cohort_id in (c2, c3);
  -- cohort 1: the 30 and 60-day visits are reported; the 90-day visit is overdue
  insert into public.followup_schedule(enrolment_id, visit, due_date)
  select e.id, 90, date '2026-04-30' from public.enrolments e where e.cohort_id = c1;

  raise notice 'Loaded: org %, cohorts % % % %', org, cy, c1, c2, c3;
end $$;

select c.name, c.status, count(e.id) as participants from public.cohorts c left join public.enrolments e on e.cohort_id = c.id group by c.name, c.status order by c.name;
