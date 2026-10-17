-- DEMO SEED. Synthetic people and organisations only (approved anonymised names + invented ones).
-- Fixed UUIDs make tests and demo personas stable. Never load into a production project.

insert into public.canvas_boxes(number,name_en,name_sw,phase,questions) values
 (1,'Problem','Tatizo',1,'[{"key":"problem","en":"What problem exists around you?","sw":"Ni tatizo gani lipo karibu nawe?"},{"key":"who_struggles","en":"Who is struggling with it?","sw":"Nani anateseka nalo?"}]'),
 (2,'Customer Segments','Wateja',1,'[{"key":"who_cares","en":"Who cares enough to fix it?","sw":"Nani anajali vya kutosha kulitatua?"},{"key":"who_pays","en":"Who has money or opportunity?","sw":"Nani ana pesa au nafasi?"}]'),
 (3,'Solution','Suluhisho',2,'[{"key":"what","en":"What exactly do I offer?","sw":"Ninatoa nini hasa?"},{"key":"how","en":"How does it work, and for how much?","sw":"Inafanyaje kazi, na kwa bei gani?"}]'),
 (4,'Unique Value Proposition','Thamani ya Kipekee',2,'[{"key":"why","en":"Why does it matter to the customer?","sw":"Kwa nini ni muhimu kwa mteja?"}]'),
 (5,'Unfair Advantage','Faida Yako Pekee',3,'[{"key":"advantage","en":"What do I have that others cannot easily copy?","sw":"Nina nini ambacho wengine hawawezi kunakili kwa urahisi?"}]'),
 (6,'Competition','Ushindani',3,'[{"key":"others","en":"Who else solves this problem?","sw":"Nani mwingine anatatua tatizo hili?"},{"key":"choose_me","en":"Why should someone choose me?","sw":"Kwa nini mtu anichague mimi?"}]'),
 (7,'Early Adopters','Wateja wa Kwanza',3,'[{"key":"first","en":"Who will give me my first chance?","sw":"Nani atanipa nafasi yangu ya kwanza?"}]'),
 (8,'Channels & Relationships','Njia na Mahusiano',5,'[{"key":"found","en":"How do opportunities find me?","sw":"Fursa zinanipataje?"},{"key":"trust","en":"How do I build trust?","sw":"Ninajengaje uaminifu?"}]'),
 (9,'Key Partners & Activities','Washirika na Shughuli',4,'[{"key":"activities","en":"What must I do every day or week?","sw":"Nifanye nini kila siku au wiki?"},{"key":"helpers","en":"Who helps me?","sw":"Nani ananisaidia?"}]'),
 (10,'Key Metrics','Vipimo Muhimu',5,'[{"key":"numbers","en":"Which three numbers will I track?","sw":"Nitafuatilia nambari zipi tatu?"}]'),
 (11,'Cost Structure','Gharama',4,'[{"key":"sunk","en":"Sunk costs","sw":"Gharama zilizopotea"},{"key":"fixed","en":"Fixed costs","sw":"Gharama za kudumu"},{"key":"variable","en":"Variable costs","sw":"Gharama zinazobadilika"}]'),
 (12,'Revenue Streams','Mapato',4,'[{"key":"paid","en":"How do I get paid?","sw":"Ninalipwaje?"}]');

insert into public.organisations(id,name,type,parent_id,county,ward) values
 ('00000000-0000-4000-8000-0000000000a1','Deliverance Church International, Likoni','church',null,'Mombasa','Likoni'),
 ('00000000-0000-4000-8000-0000000000a2','KE358 Child Development Centre','cdc','00000000-0000-4000-8000-0000000000a1','Mombasa','Likoni'),
 ('00000000-0000-4000-8000-0000000000a3','Bandari Secondary School (demo)','school',null,'Mombasa','Changamwe'),
 ('00000000-0000-4000-8000-0000000000a4','Pwani Technical College (demo)','college',null,'Kilifi','Malindi');

insert into public.agreements(organisation_id,named_participant_access,welfare_flag_visibility,released_report_types,can_nominate,confidentiality_label) values
 ('00000000-0000-4000-8000-0000000000a1','aggregates',false,'{followup_30,followup_60,followup_90,completion}','{participant,org_viewer}','Confidential: partner use only'),
 ('00000000-0000-4000-8000-0000000000a2','named',true,'{session,followup_30,followup_60,followup_90,completion,impact}','{participant,org_viewer}','Confidential: contains participant names'),
 ('00000000-0000-4000-8000-0000000000a3','aggregates',false,'{completion}','{participant}','Partner use only'),
 ('00000000-0000-4000-8000-0000000000a4','none',false,'{}','{participant,trainer_candidate}',null);

-- people (auth_user_id is linked at sign-up)
insert into public.people(id,full_name,display_name,phone,preferred_language,birth_year) values
 ('00000000-0000-4000-8000-000000000101','Asubuhi (Founder)','Asubuhi','+254700000101','en',1990),
 ('00000000-0000-4000-8000-000000000102','James Kimani','James','+254700000102','en',1990),
 ('00000000-0000-4000-8000-000000000201','Neema Achieng (Tier 3)','Neema','+254700000201','en',1992),
 ('00000000-0000-4000-8000-000000000202','Brian Otieno (Tier 2)','Brian','+254700000202','en',2001),
 ('00000000-0000-4000-8000-000000000203','Faith Wanjiru (Tier 1)','Faith','+254700000203','en',2003),
 ('00000000-0000-4000-8000-000000000204','Kevin Mwangi (Tier 1, 16)','Kevin','+254700000204','en',2010),
 ('00000000-0000-4000-8000-000000000301','Zawadi (demo)','Zawadi','+254700000301','sw',1998),
 ('00000000-0000-4000-8000-000000000302','Rehema (demo)','Rehema','+254700000302','sw',1985),
 ('00000000-0000-4000-8000-000000000303','Amina (demo)','Amina','+254700000303','sw',2006),
 ('00000000-0000-4000-8000-000000000304','Juma (demo)','Juma','+254700000304','sw',1990),
 ('00000000-0000-4000-8000-000000000305','Mwanaisha (demo)','Mwanaisha','+254700000305','sw',1979),
 ('00000000-0000-4000-8000-000000000306','Salim (demo)','Salim','+254700000306','sw',2004),
 ('00000000-0000-4000-8000-000000000401','Pastor Mary (KE358 admin)','Mary','+254700000401','en',1975),
 ('00000000-0000-4000-8000-000000000402','Mr Otieno (School admin)','Otieno','+254700000402','en',1980);

insert into public.role_assignments(person_id,role,tier,organisation_id) values
 ('00000000-0000-4000-8000-000000000101','founder',null,null),
 ('00000000-0000-4000-8000-000000000102','founder',null,null),
 ('00000000-0000-4000-8000-000000000201','facilitator',3,null),
 ('00000000-0000-4000-8000-000000000202','facilitator',2,null),
 ('00000000-0000-4000-8000-000000000203','facilitator',1,null),
 ('00000000-0000-4000-8000-000000000204','facilitator',1,null),
 ('00000000-0000-4000-8000-000000000301','participant',null,'00000000-0000-4000-8000-0000000000a2'),
 ('00000000-0000-4000-8000-000000000302','participant',null,'00000000-0000-4000-8000-0000000000a2'),
 ('00000000-0000-4000-8000-000000000303','participant',null,'00000000-0000-4000-8000-0000000000a2'),
 ('00000000-0000-4000-8000-000000000304','participant',null,'00000000-0000-4000-8000-0000000000a2'),
 ('00000000-0000-4000-8000-000000000305','participant',null,'00000000-0000-4000-8000-0000000000a3'),
 ('00000000-0000-4000-8000-000000000306','participant',null,'00000000-0000-4000-8000-0000000000a3'),
 ('00000000-0000-4000-8000-000000000401','org_admin',null,'00000000-0000-4000-8000-0000000000a1'),
 ('00000000-0000-4000-8000-000000000402','org_admin',null,'00000000-0000-4000-8000-0000000000a3');

insert into public.cohorts(id,organisation_id,name,format,language,audience,start_date,end_date,venue,expected_participants,status) values
 ('00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-0000000000a2','KE358 Cohort 1 (demo figures)','5-day','sw','Youth and caregivers','2026-07-06','2026-07-10','Likoni',4,'followup'),
 ('00000000-0000-4000-8000-000000000502','00000000-0000-4000-8000-0000000000a3','Bandari Cohort A (demo)','12-day','en','Students','2026-09-14','2026-09-30','Changamwe',2,'delivering');

insert into public.cohort_facilitators values
 ('00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000202','lead'),
 ('00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000203','co'),
 ('00000000-0000-4000-8000-000000000502','00000000-0000-4000-8000-000000000202','lead');

insert into public.enrolments(id,cohort_id,person_id,has_business_at_entry,track,status) values
 ('00000000-0000-4000-8000-000000000601','00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000301',true,'standard','completed'),
 ('00000000-0000-4000-8000-000000000602','00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000302',true,'standard','completed'),
 ('00000000-0000-4000-8000-000000000603','00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000303',false,'starter','completed'),
 ('00000000-0000-4000-8000-000000000604','00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000304',true,'standard','dropped'),
 ('00000000-0000-4000-8000-000000000605','00000000-0000-4000-8000-000000000502','00000000-0000-4000-8000-000000000305',false,'starter','enrolled'),
 ('00000000-0000-4000-8000-000000000606','00000000-0000-4000-8000-000000000502','00000000-0000-4000-8000-000000000306',false,'starter','enrolled');

insert into public.sessions(id,cohort_id,day_number,session_date,topic,canvas_boxes) values
 ('00000000-0000-4000-8000-000000000701','00000000-0000-4000-8000-000000000501',1,'2026-07-06','Introduction and the problem','{1,3,11,12}'),
 ('00000000-0000-4000-8000-000000000702','00000000-0000-4000-8000-000000000501',2,'2026-07-07','Designing your offer','{3,4}'),
 ('00000000-0000-4000-8000-000000000703','00000000-0000-4000-8000-000000000501',3,'2026-07-08','Customers and operations','{2,7,9}');

insert into public.canvas_unlocks(cohort_id,box_number) values
 ('00000000-0000-4000-8000-000000000501',1),('00000000-0000-4000-8000-000000000501',2),('00000000-0000-4000-8000-000000000501',3),
 ('00000000-0000-4000-8000-000000000501',4),('00000000-0000-4000-8000-000000000501',5),('00000000-0000-4000-8000-000000000501',6),
 ('00000000-0000-4000-8000-000000000501',7),('00000000-0000-4000-8000-000000000501',8),('00000000-0000-4000-8000-000000000501',9),
 ('00000000-0000-4000-8000-000000000501',10),('00000000-0000-4000-8000-000000000501',11),('00000000-0000-4000-8000-000000000501',12),
 ('00000000-0000-4000-8000-000000000502',1),('00000000-0000-4000-8000-000000000502',2),('00000000-0000-4000-8000-000000000502',3);

insert into public.attendance(session_id,enrolment_id,present,late_minutes)
select s.id,e.id,true,0 from public.sessions s join public.enrolments e on e.cohort_id=s.cohort_id where s.cohort_id='00000000-0000-4000-8000-000000000501';

insert into public.session_logs(session_id,author_id,flow_rating,checks,hardest_concepts,went_well,to_improve,notable_quotes) values
 ('00000000-0000-4000-8000-000000000701','00000000-0000-4000-8000-000000000202',4,'{"canvas_order":true,"cost_types_order":true,"canvas_completion_checked":true}','Fixed vs variable costs','Group energy was high','Start the break-even demo earlier','"Sasa naona biashara yangu kwa macho mapya" (demo)');

insert into public.canvases(id,enrolment_id,status) values
 ('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000601','presented'),
 ('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000602','submitted'),
 ('00000000-0000-4000-8000-000000000803','00000000-0000-4000-8000-000000000603','draft'),
 ('00000000-0000-4000-8000-000000000805','00000000-0000-4000-8000-000000000605','draft');

insert into public.canvas_answers(canvas_id,box_number,question_key,answer,language,assisted,entered_by) values
 ('00000000-0000-4000-8000-000000000801',1,'problem','Wateja wa mtaa wangu hawapati mboga safi karibu na nyumbani.','sw',false,'00000000-0000-4000-8000-000000000301'),
 ('00000000-0000-4000-8000-000000000801',2,'who_cares','Akina mama wanaofanya kazi mjini.','sw',false,'00000000-0000-4000-8000-000000000301'),
 ('00000000-0000-4000-8000-000000000801',3,'what','Kuuza mboga safi asubuhi na mapema kwa bei ya jumla ndogo.','sw',false,'00000000-0000-4000-8000-000000000301'),
 ('00000000-0000-4000-8000-000000000801',4,'why','Safi, karibu, na bei nafuu.','sw',false,'00000000-0000-4000-8000-000000000301'),
 ('00000000-0000-4000-8000-000000000801',11,'fixed','Kodi ya kibanda KES 1,500 kwa mwezi','sw',true,'00000000-0000-4000-8000-000000000202'),
 ('00000000-0000-4000-8000-000000000802',1,'problem','Watoto wengi hawana huduma ya kusuka nywele kwa bei nafuu.','sw',false,'00000000-0000-4000-8000-000000000302'),
 ('00000000-0000-4000-8000-000000000802',3,'what','Kusuka nywele nyumbani kwa mteja.','sw',false,'00000000-0000-4000-8000-000000000302'),
 ('00000000-0000-4000-8000-000000000803',1,'problem','Vijana wengi hawana ujuzi wa kupata kazi.','sw',true,'00000000-0000-4000-8000-000000000203'),
 ('00000000-0000-4000-8000-000000000805',1,'problem','Many students cannot afford printed notes.','en',false,'00000000-0000-4000-8000-000000000305');

-- follow-up: cohort 1 ended 2026-07-10, so 30 / 60 / 90 fall on 2026-08-09 / 09-08 / 10-08
insert into public.followup_schedule(id,enrolment_id,visit,due_date,window_end,status,assigned_to,attempts) values
 ('00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000601',30,'2026-08-09','2026-08-16','done','00000000-0000-4000-8000-000000000203',1),
 ('00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000601',60,'2026-09-08','2026-09-15','done','00000000-0000-4000-8000-000000000203',1),
 ('00000000-0000-4000-8000-000000000903','00000000-0000-4000-8000-000000000601',90,'2026-10-08','2026-10-15','done','00000000-0000-4000-8000-000000000203',1),
 ('00000000-0000-4000-8000-000000000904','00000000-0000-4000-8000-000000000602',30,'2026-08-09','2026-08-16','done','00000000-0000-4000-8000-000000000203',2),
 ('00000000-0000-4000-8000-000000000905','00000000-0000-4000-8000-000000000602',60,'2026-09-08','2026-09-15','done','00000000-0000-4000-8000-000000000203',1),
 ('00000000-0000-4000-8000-000000000906','00000000-0000-4000-8000-000000000602',90,'2026-10-08','2026-10-15','done','00000000-0000-4000-8000-000000000203',1),
 ('00000000-0000-4000-8000-000000000907','00000000-0000-4000-8000-000000000603',30,'2026-08-09','2026-08-16','done','00000000-0000-4000-8000-000000000203',1),
 ('00000000-0000-4000-8000-000000000908','00000000-0000-4000-8000-000000000603',60,'2026-09-08','2026-09-15','done','00000000-0000-4000-8000-000000000203',3),
 ('00000000-0000-4000-8000-000000000909','00000000-0000-4000-8000-000000000603',90,'2026-10-08','2026-10-15','scheduled','00000000-0000-4000-8000-000000000203',0),
 ('00000000-0000-4000-8000-000000000910','00000000-0000-4000-8000-000000000604',30,'2026-08-09','2026-08-16','unreachable','00000000-0000-4000-8000-000000000203',3);

insert into public.followup_visits(schedule_id,visited_on,still_operating,sold_within_14_days,income_direction,weekly_sales_range,stock_cash_value_kes,knows_breakeven,tracks_key_metric,used_calc_for_decision,confidence,challenges,notes,officer_id) values
 ('00000000-0000-4000-8000-000000000901','2026-08-10',true,true,'higher','3000-5000',6000,true,true,false,4,'{stock,competition}','Anauza mboga kila siku','00000000-0000-4000-8000-000000000203'),
 ('00000000-0000-4000-8000-000000000902','2026-09-09',true,true,'higher','4000-6000',8000,true,true,true,4,'{stock}','Amekuza stock','00000000-0000-4000-8000-000000000203'),
 ('00000000-0000-4000-8000-000000000903','2026-10-08',true,true,'higher','5000-7000',9500,true,true,true,5,'{}','Ameajiri msaidizi siku mbili','00000000-0000-4000-8000-000000000203'),
 ('00000000-0000-4000-8000-000000000904','2026-08-11',true,true,'same','1000-2000',2000,false,false,false,3,'{capital,time}','','00000000-0000-4000-8000-000000000203'),
 ('00000000-0000-4000-8000-000000000905','2026-09-10',true,false,'same','1000-2000',2500,true,false,false,3,'{capital}','Mauzo ya wiki mbili zilizopita hayakuwepo','00000000-0000-4000-8000-000000000203'),
 ('00000000-0000-4000-8000-000000000906','2026-10-09',true,true,'higher','2000-3000',3500,true,true,false,4,'{capital}','','00000000-0000-4000-8000-000000000203'),
 ('00000000-0000-4000-8000-000000000907','2026-08-12',false,false,null,null,null,false,false,false,2,'{startup_capital}','Starter track: anajiandaa','00000000-0000-4000-8000-000000000203'),
 ('00000000-0000-4000-8000-000000000908','2026-09-12',true,true,'higher','500-1000',1200,true,false,false,3,'{capital}','Ameanza biashara ndogo','00000000-0000-4000-8000-000000000203');

insert into public.welfare_flags(enrolment_id,raised_by,category,summary) values
 ('00000000-0000-4000-8000-000000000603','00000000-0000-4000-8000-000000000203','economic','Participant skipping meals before sessions (demo)');

insert into public.support_ledger(enrolment_id,entry_date,amount_kes,item,funder) values
 ('00000000-0000-4000-8000-000000000601','2026-07-20',3000,'Starter stock (demo)','Partner fund'),
 ('00000000-0000-4000-8000-000000000602','2026-07-20',2500,'Hair braiding kit (demo)','Partner fund');

insert into public.certifications(person_id,tier,number,issued_on,status) values
 ('00000000-0000-4000-8000-000000000201',3,'EL-2026-T3-001','2026-05-01','active'),
 ('00000000-0000-4000-8000-000000000202',2,'EL-2026-T2-001','2026-03-01','active'),
 ('00000000-0000-4000-8000-000000000203',1,'EL-2026-T1-007','2026-04-12','active'),
 ('00000000-0000-4000-8000-000000000204',1,'EL-2026-T1-008','2026-04-12','active');

insert into public.qa_visits(facilitator_id,observer_id,observed_on,score,outcome,notes) values
 ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000201','2026-07-08',15,'pass','Strong pace; keep silence minute.'),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000201','2026-07-07',16,'pass','');

-- finance (demo figures; real invoices are entered by founders)
insert into public.expense_categories(id,name) values
 ('00000000-0000-4000-8000-000000000a01','Transport'),('00000000-0000-4000-8000-000000000a02','Materials and printing'),
 ('00000000-0000-4000-8000-000000000a03','Facilitator fees'),('00000000-0000-4000-8000-000000000a04','Venue and refreshments'),
 ('00000000-0000-4000-8000-000000000a05','Follow-up visits');

insert into public.quotes(id,organisation_id,cohort_id,issued_on,status) values
 ('00000000-0000-4000-8000-000000000b01','00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-000000000501','2026-06-01','signed'),
 ('00000000-0000-4000-8000-000000000b02','00000000-0000-4000-8000-0000000000a3','00000000-0000-4000-8000-000000000502','2026-08-20','signed');
insert into public.quote_lines(quote_id,kind,description,qty,unit_kes) values
 ('00000000-0000-4000-8000-000000000b01','training','5-Day programme (demo price)',4,6000),
 ('00000000-0000-4000-8000-000000000b01','followup_30','30-day follow-up',4,800),
 ('00000000-0000-4000-8000-000000000b01','followup_60','60-day follow-up',4,800),
 ('00000000-0000-4000-8000-000000000b01','followup_90','90-day follow-up',4,800),
 ('00000000-0000-4000-8000-000000000b02','training','12-Day programme (demo price)',2,9000);
insert into public.invoices(id,quote_id,organisation_id,number,issued_on,due_on,amount_kes,status) values
 ('00000000-0000-4000-8000-000000000c01','00000000-0000-4000-8000-000000000b01','00000000-0000-4000-8000-0000000000a2','INV-2026-001','2026-07-12','2026-08-12',33600,'paid'),
 ('00000000-0000-4000-8000-000000000c02','00000000-0000-4000-8000-000000000b02','00000000-0000-4000-8000-0000000000a3','INV-2026-002','2026-09-01','2026-10-01',18000,'part_paid');
insert into public.payments(invoice_id,amount_kes,method,reference,received_on,recorded_by) values
 ('00000000-0000-4000-8000-000000000c01',33600,'mpesa','QHX1DEMO01','2026-07-30','00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000c02',9000,'mpesa','QHX1DEMO02','2026-09-12','00000000-0000-4000-8000-000000000101');

insert into public.expense_requests(id,requester_id,cohort_id,category_id,amount_kes,reason,status,created_at,decided_on,paid_on,paid_amount_kes) values
 ('00000000-0000-4000-8000-000000000d01','00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000a01',2400,'Fare for 5 days to Likoni','paid','2026-07-03','2026-07-04','2026-07-04',2400),
 ('00000000-0000-4000-8000-000000000d02','00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000a02',3800,'Printing 12 participant booklets','paid','2026-07-02','2026-07-03','2026-07-03',3650),
 ('00000000-0000-4000-8000-000000000d03','00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000a05',1800,'Transport for 90-day visits','submitted','2026-10-09',null,null,null),
 ('00000000-0000-4000-8000-000000000d04','00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000502','00000000-0000-4000-8000-000000000a04',32000,'Venue hire and refreshments, 12 days (above threshold)','submitted','2026-10-12',null,null,null);
insert into public.trainer_payments(person_id,cohort_id,kind,amount_kes,paid_on) values
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000501','fee',7000,'2026-07-20'),
 ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000501','stipend',4000,'2026-07-20');

insert into public.reports(id,organisation_id,cohort_id,type,title,period,summary,status,reviewed_by,released_by,released_on,confidentiality_label) values
 ('00000000-0000-4000-8000-000000000e01','00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-000000000501','followup_30','KE358 Cohort 1: 30-day follow-up (demo)','Aug 2026','3 of 4 reached; 2 of 3 operating; see charts.','released','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101','2026-08-25','Confidential: contains participant names'),
 ('00000000-0000-4000-8000-000000000e02','00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-000000000501','followup_90','KE358 Cohort 1: 90-day follow-up (demo)','Oct 2026','Draft pending review.','draft',null,null,null,null),
 ('00000000-0000-4000-8000-000000000e03','00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000501','completion','Likoni DCI: completion summary (demo)','Jul 2026','Aggregate results only.','released','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101','2026-07-20','Confidential: partner use only');

insert into public.documents(organisation_id,cohort_id,kind,title,visible_to_org) values
 ('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-000000000501','attendance_list','KE358 Cohort 1 attendance list',true),
 ('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-000000000501','invoice','INV-2026-001',true),
 ('00000000-0000-4000-8000-0000000000a2',null,'agreement','Partnership agreement (founders copy)',false);

insert into public.directory_listings(enrolment_id,display_name,business_sw,business_en,wish_list,consent_given,host_approved,status) values
 ('00000000-0000-4000-8000-000000000601','Zawadi','Mboga safi za asubuhi','Fresh morning vegetables','Mizani ya kidijitali',true,true,'listed');

insert into public.settings(key,value,note) values
 ('expense_threshold_kes','20000','Requests above this need both founders. PLACEHOLDER: confirm the amount.'),
 ('blackout_after','"12-15"','No follow-up visits scheduled after 15 Dec; reports due 8 Jan.'),
 ('survival_target','0.75','Target survival at 90 days'),
 ('cohort1_support_total_kes','153940','Confirmed total support for cohort 1');

insert into public.invitations(full_name,contact,role,organisation_id,nominated_by,status,birth_year,guardian_consent,note) values
 ('Grace Njeri (demo)','+254700000777','participant','00000000-0000-4000-8000-0000000000a3','00000000-0000-4000-8000-000000000402','nominated',2009,false,'Under 18: guardian consent needed before approval'),
 ('Hassan Ali (demo)','+254700000778','trainer_candidate','00000000-0000-4000-8000-0000000000a4','00000000-0000-4000-8000-000000000201','nominated',2003,false,'Campus student, English');
