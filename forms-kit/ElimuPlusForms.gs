/**
 * Elimu+ day report forms.
 * Creates one Google Form per facilitator level (Trainee, Associate, Certified, Master), sends each report to the leader the
 * writer chooses, and posts it to the Elimu+ portal so founders see it and supervisors can mark it seen.
 *
 * HOW TO USE (once):
 *  1. Go to script.google.com, create a New project, paste this whole file, and save.
 *  2. Choose the function  createAllForms  and press Run. Approve the permissions when Google asks.
 *  3. Open  View > Logs  to see the four form links. Share the right link with each level.
 *  Later: the function  refreshChoices  keeps the cohort and leader lists current (a daily timer is set up for you).
 */
const PORTAL_URL = "https://elimuplus.com";
const WEBHOOK_SECRET = "PASTE_THE_SECRET_HERE";
const TEMPLATES = {"0":{"name":"Trainee Facilitator","short":"Trainee","depth":"Short observation report. We want fresh eyes: what you saw, what surprised you, what worried you.","goes_to":"Your supervisor first, then the founders see a summary.","fields":[{"key":"day_number","core":true,"label":"Which training day was this?","type":"number","required":true},{"key":"headcount","core":true,"label":"How many participants were in the room?","type":"number","required":true},{"key":"started_on_time","label":"Did the session start on time?","type":"choice","options":["Yes","Within 15 minutes","Late by more than 15 minutes"],"required":true},{"key":"room_ok","label":"Was the room comfortable and ready?","type":"choice","options":["Yes","Mostly","No"],"required":true},{"key":"engagement","label":"How engaged were the participants?","type":"scale","min":1,"max":5,"minLabel":"Switched off","maxLabel":"Fully engaged","required":true},{"key":"best_moment","label":"What was the best moment of the day?","type":"longtext","required":true},{"key":"surprised_me","label":"What surprised you today, good or bad? Anything we may not have expected.","type":"longtext","required":true,"help":"This is the most valuable question on the form. Say what you actually saw."},{"key":"concern","core":true,"label":"Is there anything we should look at?","type":"choice","options":["No concern","Keep an eye on it","Urgent, someone should call me"],"required":true},{"key":"concern_note","core":true,"label":"If so, what happened?","type":"longtext","required":false}]},"1":{"name":"Associate Facilitator","short":"Associate","depth":"Day report. What you taught, how it went, what is not working yet.","goes_to":"Your supervisor, then the founders see a summary.","fields":[{"key":"day_number","core":true,"label":"Training day number","type":"number","required":true},{"key":"headcount","core":true,"label":"Participants present","type":"number","required":true},{"key":"enrolled","label":"Participants enrolled","type":"number","required":false},{"key":"topics","label":"Topics covered today","type":"longtext","required":true},{"key":"plan_followed","label":"Did you follow the day plan?","type":"choice","options":["Yes","Partly","No"],"required":true},{"key":"plan_change","label":"If not, what changed and why?","type":"longtext","required":false},{"key":"hardest","label":"Which concept was hardest for the group?","type":"longtext","required":true},{"key":"canvas_progress","label":"How far have participants got with their canvas?","type":"choice","options":["Not started","Started","Halfway","Nearly complete","Complete"],"required":true},{"key":"engagement","label":"Participant engagement","type":"scale","min":1,"max":5,"minLabel":"Low","maxLabel":"High","required":true},{"key":"materials_ok","label":"Were materials and equipment enough?","type":"choice","options":["Yes","Short of something"],"required":true},{"key":"materials_note","label":"What was missing?","type":"longtext","required":false},{"key":"surprised_me","label":"Anything unexpected today?","type":"longtext","required":false},{"key":"concern","core":true,"label":"Is there anything we should look at?","type":"choice","options":["No concern","Keep an eye on it","Urgent, someone should call me"],"required":true},{"key":"concern_note","core":true,"label":"If so, what happened?","type":"longtext","required":false}]},"2":{"name":"Certified Facilitator","short":"Certified","depth":"Full delivery report. Numbers, learning evidence, welfare and the plan for tomorrow.","goes_to":"A master trainer and the founders.","fields":[{"key":"day_number","core":true,"label":"Training day number","type":"number","required":true},{"key":"headcount","core":true,"label":"Participants present","type":"number","required":true},{"key":"enrolled","label":"Participants enrolled","type":"number","required":true},{"key":"girls_women","label":"How many present are girls or women?","type":"number","required":true},{"key":"under18","label":"How many present are under 18?","type":"number","required":true},{"key":"late_or_left","label":"Late arrivals or people who left early","type":"number","required":false},{"key":"topics","label":"Topics covered and sessions delivered","type":"longtext","required":true},{"key":"plan_followed","label":"Did you follow the day plan?","type":"choice","options":["Yes","Partly","No"],"required":true},{"key":"plan_change","label":"What changed and why?","type":"longtext","required":false},{"key":"learning_evidence","label":"What evidence did you see that participants learned today?","type":"longtext","required":true},{"key":"hardest","label":"Hardest concepts, and what you will change","type":"longtext","required":true},{"key":"canvas_progress","label":"Canvas progress","type":"choice","options":["Not started","Started","Halfway","Nearly complete","Complete"],"required":true},{"key":"engagement","label":"Participant engagement","type":"scale","min":1,"max":5,"minLabel":"Low","maxLabel":"High","required":true},{"key":"venue_ok","label":"Venue, facilities and safety today","type":"choice","options":["All fine","Minor issues","Serious issue"],"required":true},{"key":"venue_note","label":"Venue issue details","type":"longtext","required":false},{"key":"money_today","label":"Money spent today on the cohort (KES)","type":"number","required":false},{"key":"safeguarding","label":"Any safeguarding or welfare matter?","type":"choice","options":["No","Yes, I have handled it","Yes, I need help"],"required":true},{"key":"voice","label":"One thing a participant said that we should hear","type":"longtext","required":false},{"key":"tomorrow","label":"Plan for tomorrow and help you need","type":"longtext","required":true},{"key":"concern","core":true,"label":"Overall concern level","type":"choice","options":["No concern","Keep an eye on it","Urgent, someone should call me"],"required":true},{"key":"concern_note","core":true,"label":"Concern details","type":"longtext","required":false}]},"3":{"name":"Master Trainer (QA visit)","short":"Master","depth":"Quality visit. Scored observation with a decision.","goes_to":"The founders.","kind":"qa","fields":[{"key":"day_number","core":true,"label":"Training day observed","type":"number","required":true},{"key":"headcount","core":true,"label":"Participants present","type":"number","required":true},{"key":"facilitator_name","label":"Facilitator observed","type":"text","required":true},{"key":"score_preparation","label":"Preparation and materials","type":"scale","min":1,"max":5,"minLabel":"Poor","maxLabel":"Excellent","required":true},{"key":"score_delivery","label":"Delivery and clarity","type":"scale","min":1,"max":5,"minLabel":"Poor","maxLabel":"Excellent","required":true},{"key":"score_participation","label":"Participation and inclusion","type":"scale","min":1,"max":5,"minLabel":"Poor","maxLabel":"Excellent","required":true},{"key":"score_canvas","label":"Quality of canvas work on the walls","type":"scale","min":1,"max":5,"minLabel":"Poor","maxLabel":"Excellent","required":true},{"key":"score_safeguarding","label":"Safeguarding and respect","type":"scale","min":1,"max":5,"minLabel":"Poor","maxLabel":"Excellent","required":true},{"key":"venue_ok","label":"Venue against the readiness checklist","type":"choice","options":["Matches","Minor gaps","Serious gaps"],"required":true},{"key":"strengths","label":"What the facilitator does well","type":"longtext","required":true},{"key":"improve","label":"What to improve before the next day","type":"longtext","required":true},{"key":"decision","label":"Decision","type":"choice","options":["Pass","Pass with actions","Needs another visit","Escalate to founders"],"required":true},{"key":"concern","core":true,"label":"Overall concern level","type":"choice","options":["No concern","Keep an eye on it","Urgent, someone should call me"],"required":true},{"key":"concern_note","core":true,"label":"Concern details","type":"longtext","required":false}]}};
const PHASES = [["training","The training"],["followup_30","30-day follow-up"],["followup_60","60-day follow-up"],["followup_90","90-day follow-up"],["other","Something else"]];
const FOLLOWUP = {"version":1,"identity":[{"key":"business_type","label":"Business type","type":"text"},{"key":"location","label":"Location","type":"text"},{"key":"visited_on","label":"Date of visit","type":"date","required":true},{"key":"days_since","label":"Days since support was given","type":"number"}],"stages":{"30":{"name":"Day 30","title":"Start-up and fixing","question":"Is it working at all, and what needs fixing now?","b":[{"key":"b1_overall","label":"Overall, did the support match what was promised?","type":"choice","options":["Yes","Partly","No"],"help":"Compare with the items promised on the Day 0 form."},{"key":"b1_items","label":"Items promised, whether each was received, and quality or what is missing","type":"longtext"},{"key":"b1_missing","label":"Anything she asked for but did not get","type":"longtext"},{"key":"b2_used","label":"Which parts of the training has she used?","type":"checkbox","options":["Wrote down sales and expenses","Separated business money from home money","Set or checked prices","Asked customers what they want","Used her SEE Canvas or plan","Tried a new way to get customers","None yet"]},{"key":"b2_idea","label":"Which one idea from the training has she used most?","type":"text"},{"key":"b2_first_sale","label":"Date of first sale after support","type":"date"},{"key":"b3_risks","label":"Early risk scan (officer ticks what is seen)","type":"checkbox","options":["Capital used at home","Stock not selling","Few or no customers","Health or childcare","Safety","Location","Permit or licence","Equipment problem","None seen"]},{"key":"b4_fixes","label":"Quick fixes the officer did or advised today","type":"longtext"},{"key":"b4_hope","label":"What does she hope will have changed by the 60-day visit? (her own words)","type":"longtext"}],"a":[{"key":"a1_operating","label":"Is the business operating?","type":"choice","options":["Open normally","Open but irregularly","Closed"],"required":true,"help":"Part A is the same at every visit so progress can be compared. Start with her story and her stock; ask about money last."},{"key":"a1_days_open","label":"Days open in the last 7 days","type":"number"},{"key":"a1_closed_why","label":"If closed: since when and why?","type":"longtext"},{"key":"a2_good_day","label":"Customers on a good day","type":"number"},{"key":"a2_slow_day","label":"Customers on a slow day","type":"number"},{"key":"a2_new_customers","label":"New customers since the last visit","type":"choice","options":["Many","A few","None","Not sure"]},{"key":"a3_stock_list","label":"Stock counted together with her (item, quantity, selling price each; one item per line)","type":"longtext"},{"key":"a3_stock_value","label":"Total stock value (Ksh)","type":"number","help":"Officer calculates: quantity times selling price, added up."},{"key":"a3_stock_level","label":"Stock level overall","type":"choice","options":["Full","Half","Low","Empty"]},{"key":"a3_right_stock","label":"Is it the right kind of stock for what customers ask?","type":"choice","options":["Yes","Partly","No"]},{"key":"a3_missing","label":"Customers ask for, but she does not have","type":"longtext"},{"key":"a4_sales_range","label":"Sales in the last 7 days (money received from customers, before costs)","type":"choice","options":["Under 1,000","1,000 to 2,999","3,000 to 5,999","6,000 to 9,999","10,000 to 19,999","20,000 or more"],"help":"Ask money last. Ranges are fine; do not push."},{"key":"a4_restock_range","label":"Spent on restocking in the last 7 days","type":"choice","options":["None","Under 1,000","1,000 to 2,999","3,000 to 5,999","6,000 or more"]},{"key":"a4_exact_sales","label":"Exact sales, if she can say (Ksh)","type":"number"},{"key":"a4_profit","label":"Rough weekly profit worked out together with her (Ksh)","type":"number"},{"key":"a4_set_aside","label":"Enough set aside for the next restock?","type":"choice","options":["Yes","Not enough"]},{"key":"a4_compare","label":"Compared with before the training, takings are","type":"choice","options":["Higher","About the same","Lower","Not sure"]},{"key":"a5_home_use","label":"Last week, money taken from the business for home needs","type":"choice","options":["None","A little","A lot"]},{"key":"a5_home_use_for","label":"What was it for?","type":"text"},{"key":"a5_pays_self","label":"Does she pay herself?","type":"choice","options":["Regularly","Sometimes","Not yet"]},{"key":"a5_records","label":"Keeps written records?","type":"choice","options":["Daily","Sometimes","No"]},{"key":"a5_records_seen","label":"Notebook or M-Pesa messages seen?","type":"choice","options":["Yes","No"]},{"key":"a6_meal","label":"In the past week, did the household go without a meal or something needed because of money?","type":"choice","options":["No","Sometimes","Often"],"help":"Private. Ask gently."},{"key":"a6_other","label":"Anything else affecting her or the business (health, childcare, safety)?","type":"choice","options":["Nothing","Yes"]},{"key":"a6_other_what","label":"If yes, what?","type":"longtext"},{"key":"a6_referral","label":"Referral needed?","type":"choice","options":["Yes","No"]},{"key":"a6_referred_to","label":"Referred to (name or office)","type":"text"},{"key":"a7_words","label":"The one biggest challenge now, in her own words","type":"longtext"},{"key":"a7_category","label":"Which kind of challenge is it?","type":"choice","options":["Customers","Stock","Capital","Prices","Location","Health","Family","Safety","Licence or permit","Other"]}],"c":[{"key":"c_status","label":"Officer assessment: the business is","type":"choice","options":["Growing","Stable","Struggling","Closed"],"required":true},{"key":"c_urgent","label":"Needs urgent attention?","type":"choice","options":["Yes","No"],"required":true},{"key":"c_why","label":"Why (one line)","type":"text"},{"key":"c_support","label":"What support should be given?","type":"longtext"},{"key":"c_next","label":"Next actions (action required, person responsible, date)","type":"longtext"},{"key":"c_shared","label":"Summary shared with participant?","type":"choice","options":["Yes","No"]}]},"60":{"name":"Day 60","title":"Habits and customers","question":"Are the habits and fixes holding, and are customers coming?","b":[{"key":"habit_records","label":"Writes down sales and expenses daily","type":"choice","options":["Always","Sometimes","Not yet"]},{"key":"habit_separate","label":"Keeps business money separate from home money","type":"choice","options":["Always","Sometimes","Not yet"]},{"key":"habit_pays","label":"Pays herself regularly","type":"choice","options":["Always","Sometimes","Not yet"]},{"key":"habit_prices","label":"Sets prices from her costs","type":"choice","options":["Always","Sometimes","Not yet"]},{"key":"habit_restock","label":"Restocks from profit (not from her capital)","type":"choice","options":["Always","Sometimes","Not yet"]},{"key":"habit_saves","label":"Puts something aside each week","type":"choice","options":["Always","Sometimes","Not yet"]},{"key":"b2_find","label":"How do new customers find her?","type":"checkbox","options":["Walk past","Word of mouth","WhatsApp or social media","Offers or promotions","Regulars bring others","Other"]},{"key":"b2_tried","label":"One thing she tried in the last month to attract customers","type":"text"},{"key":"b2_worked","label":"Did it work?","type":"choice","options":["Yes","A bit","No","Not tried"]},{"key":"b2_different","label":"What makes her business different from others nearby?","type":"longtext"},{"key":"b3_good","label":"Positive signs seen","type":"checkbox","options":["Added stock","Expanded space","New product or service","Hired help","Saving regularly"]},{"key":"b3_warn","label":"Warning signs seen","type":"checkbox","options":["Business closed often","Selling below cost","Borrowing to restock","Relocated","Stock or capital used at home"]},{"key":"b4_support","label":"Support still needed","type":"checkbox","options":["Advice","Training","Stock support","Mentorship","Market linkage","Equipment or tools","Other"]},{"key":"b4_training_topic","label":"If training: which topic?","type":"text"},{"key":"b4_change","label":"If she could change one thing in the business this month, what would it be?","type":"longtext"},{"key":"b4_used","label":"Has the support been used as intended?","type":"choice","options":["Yes","Partly","No"]}],"a":[{"key":"a1_operating","label":"Is the business operating?","type":"choice","options":["Open normally","Open but irregularly","Closed"],"required":true,"help":"Part A is the same at every visit so progress can be compared. Start with her story and her stock; ask about money last."},{"key":"a1_days_open","label":"Days open in the last 7 days","type":"number"},{"key":"a1_closed_why","label":"If closed: since when and why?","type":"longtext"},{"key":"a2_good_day","label":"Customers on a good day","type":"number"},{"key":"a2_slow_day","label":"Customers on a slow day","type":"number"},{"key":"a2_new_customers","label":"New customers since the last visit","type":"choice","options":["Many","A few","None","Not sure"]},{"key":"a3_stock_list","label":"Stock counted together with her (item, quantity, selling price each; one item per line)","type":"longtext"},{"key":"a3_stock_value","label":"Total stock value (Ksh)","type":"number","help":"Officer calculates: quantity times selling price, added up."},{"key":"a3_stock_level","label":"Stock level overall","type":"choice","options":["Full","Half","Low","Empty"]},{"key":"a3_right_stock","label":"Is it the right kind of stock for what customers ask?","type":"choice","options":["Yes","Partly","No"]},{"key":"a3_missing","label":"Customers ask for, but she does not have","type":"longtext"},{"key":"a4_sales_range","label":"Sales in the last 7 days (money received from customers, before costs)","type":"choice","options":["Under 1,000","1,000 to 2,999","3,000 to 5,999","6,000 to 9,999","10,000 to 19,999","20,000 or more"],"help":"Ask money last. Ranges are fine; do not push."},{"key":"a4_restock_range","label":"Spent on restocking in the last 7 days","type":"choice","options":["None","Under 1,000","1,000 to 2,999","3,000 to 5,999","6,000 or more"]},{"key":"a4_exact_sales","label":"Exact sales, if she can say (Ksh)","type":"number"},{"key":"a4_profit","label":"Rough weekly profit worked out together with her (Ksh)","type":"number"},{"key":"a4_set_aside","label":"Enough set aside for the next restock?","type":"choice","options":["Yes","Not enough"]},{"key":"a4_compare","label":"Compared with the last visit, takings are","type":"choice","options":["Higher","About the same","Lower","Not sure"]},{"key":"a5_home_use","label":"Last week, money taken from the business for home needs","type":"choice","options":["None","A little","A lot"]},{"key":"a5_home_use_for","label":"What was it for?","type":"text"},{"key":"a5_pays_self","label":"Does she pay herself?","type":"choice","options":["Regularly","Sometimes","Not yet"]},{"key":"a5_records","label":"Keeps written records?","type":"choice","options":["Daily","Sometimes","No"]},{"key":"a5_records_seen","label":"Notebook or M-Pesa messages seen?","type":"choice","options":["Yes","No"]},{"key":"a6_meal","label":"In the past week, did the household go without a meal or something needed because of money?","type":"choice","options":["No","Sometimes","Often"],"help":"Private. Ask gently."},{"key":"a6_other","label":"Anything else affecting her or the business (health, childcare, safety)?","type":"choice","options":["Nothing","Yes"]},{"key":"a6_other_what","label":"If yes, what?","type":"longtext"},{"key":"a6_referral","label":"Referral needed?","type":"choice","options":["Yes","No"]},{"key":"a6_referred_to","label":"Referred to (name or office)","type":"text"},{"key":"a7_words","label":"The one biggest challenge now, in her own words","type":"longtext"},{"key":"a7_category","label":"Which kind of challenge is it?","type":"choice","options":["Customers","Stock","Capital","Prices","Location","Health","Family","Safety","Licence or permit","Other"]}],"c":[{"key":"c1_actions","label":"Actions agreed at the last visit, and whether each was done (Done, Partly, Not yet), with what helped or got in the way","type":"longtext"},{"key":"c_status","label":"Officer assessment: the business is","type":"choice","options":["Growing","Stable","Struggling","Closed"],"required":true},{"key":"c_urgent","label":"Needs urgent attention?","type":"choice","options":["Yes","No"],"required":true},{"key":"c_why","label":"Why (one line)","type":"text"},{"key":"c_support","label":"What support should be given?","type":"longtext"},{"key":"c_next","label":"Next actions (action required, person responsible, date)","type":"longtext"},{"key":"c_shared","label":"Summary shared with participant?","type":"choice","options":["Yes","No"]}]},"90":{"name":"Day 90","title":"Outcomes and next step","question":"Can the business stand without us, and what is the next step?","b":[{"key":"b1_continue","label":"Could the business continue at this level without more support?","type":"choice","options":["Yes","Probably","Not sure","No"]},{"key":"b1_why","label":"Why?","type":"longtext"},{"key":"b2_d0_good","label":"Then and now: customers on a good day at Day 0 (copy from the baseline form)","type":"number"},{"key":"b2_d0_slow","label":"Customers on a slow day at Day 0","type":"number"},{"key":"b2_d0_days","label":"Days open per week at Day 0","type":"number"},{"key":"b2_d0_sales","label":"Sales in a week at Day 0 (range)","type":"text"},{"key":"b2_d0_records","label":"Kept written records at Day 0?","type":"choice","options":["Daily","Sometimes","No"]},{"key":"b2_d0_separate","label":"Kept business and home money separate at Day 0?","type":"choice","options":["Always","Sometimes","Not yet"]},{"key":"b2_d0_stock_level","label":"Stock level at Day 0","type":"choice","options":["Full","Half","Low","Empty"]},{"key":"b2_d0_stock_value","label":"Stock value at Day 0 (Ksh)","type":"number"},{"key":"b3_household","label":"The household since the training","type":"checkbox","options":["More regular meals","School or other needs easier to meet","Medical or childcare easier","Able to save","No change","Harder than before"]},{"key":"b3_words","label":"In her words","type":"longtext"},{"key":"b4_plans","label":"Plans for the next three months","type":"checkbox","options":["Restock more","Add a product","Hire help","Save","Join a savings group or SACCO","Change location","Not sure","Other"]},{"key":"b4_savings_group","label":"Already in a savings group?","type":"choice","options":["Yes","No"]},{"key":"b4_plan_words","label":"Her plan in her own words","type":"longtext"},{"key":"b5_most","label":"Most useful session","type":"text"},{"key":"b5_least","label":"Least useful session","type":"text"},{"key":"b5_change","label":"One thing to add or change in the training","type":"longtext"},{"key":"b5_recommend","label":"Would she recommend it to a friend?","type":"choice","options":["Yes","No"]},{"key":"b6_story","label":"Willing to share her story","type":"choice","options":["Yes, with her name","Yes, without her name","No"],"help":"Check that her answers match the consent she gave on the Day 0 form."},{"key":"b6_photos","label":"Photos","type":"choice","options":["OK","Not OK"]},{"key":"b6_next","label":"Recommended next step","type":"choice","options":["No further follow-up needed","Link to savings group or SACCO","Further training","Referral","Other"]}],"a":[{"key":"a1_operating","label":"Is the business operating?","type":"choice","options":["Open normally","Open but irregularly","Closed"],"required":true,"help":"Part A is the same at every visit so progress can be compared. Start with her story and her stock; ask about money last."},{"key":"a1_days_open","label":"Days open in the last 7 days","type":"number"},{"key":"a1_closed_why","label":"If closed: since when and why?","type":"longtext"},{"key":"a2_good_day","label":"Customers on a good day","type":"number"},{"key":"a2_slow_day","label":"Customers on a slow day","type":"number"},{"key":"a2_new_customers","label":"New customers since the last visit","type":"choice","options":["Many","A few","None","Not sure"]},{"key":"a3_stock_list","label":"Stock counted together with her (item, quantity, selling price each; one item per line)","type":"longtext"},{"key":"a3_stock_value","label":"Total stock value (Ksh)","type":"number","help":"Officer calculates: quantity times selling price, added up."},{"key":"a3_stock_level","label":"Stock level overall","type":"choice","options":["Full","Half","Low","Empty"]},{"key":"a3_right_stock","label":"Is it the right kind of stock for what customers ask?","type":"choice","options":["Yes","Partly","No"]},{"key":"a3_missing","label":"Customers ask for, but she does not have","type":"longtext"},{"key":"a4_sales_range","label":"Sales in the last 7 days (money received from customers, before costs)","type":"choice","options":["Under 1,000","1,000 to 2,999","3,000 to 5,999","6,000 to 9,999","10,000 to 19,999","20,000 or more"],"help":"Ask money last. Ranges are fine; do not push."},{"key":"a4_restock_range","label":"Spent on restocking in the last 7 days","type":"choice","options":["None","Under 1,000","1,000 to 2,999","3,000 to 5,999","6,000 or more"]},{"key":"a4_exact_sales","label":"Exact sales, if she can say (Ksh)","type":"number"},{"key":"a4_profit","label":"Rough weekly profit worked out together with her (Ksh)","type":"number"},{"key":"a4_set_aside","label":"Enough set aside for the next restock?","type":"choice","options":["Yes","Not enough"]},{"key":"a4_compare","label":"Compared with the last visit, takings are","type":"choice","options":["Higher","About the same","Lower","Not sure"]},{"key":"a5_home_use","label":"Last week, money taken from the business for home needs","type":"choice","options":["None","A little","A lot"]},{"key":"a5_home_use_for","label":"What was it for?","type":"text"},{"key":"a5_pays_self","label":"Does she pay herself?","type":"choice","options":["Regularly","Sometimes","Not yet"]},{"key":"a5_records","label":"Keeps written records?","type":"choice","options":["Daily","Sometimes","No"]},{"key":"a5_records_seen","label":"Notebook or M-Pesa messages seen?","type":"choice","options":["Yes","No"]},{"key":"a6_meal","label":"In the past week, did the household go without a meal or something needed because of money?","type":"choice","options":["No","Sometimes","Often"],"help":"Private. Ask gently."},{"key":"a6_other","label":"Anything else affecting her or the business (health, childcare, safety)?","type":"choice","options":["Nothing","Yes"]},{"key":"a6_other_what","label":"If yes, what?","type":"longtext"},{"key":"a6_referral","label":"Referral needed?","type":"choice","options":["Yes","No"]},{"key":"a6_referred_to","label":"Referred to (name or office)","type":"text"},{"key":"a7_words","label":"The one biggest challenge now, in her own words","type":"longtext"},{"key":"a7_category","label":"Which kind of challenge is it?","type":"choice","options":["Customers","Stock","Capital","Prices","Location","Health","Family","Safety","Licence or permit","Other"]}],"c":[{"key":"c1_actions","label":"Actions agreed at the last visit, and whether each was done (Done, Partly, Not yet), with what helped or got in the way","type":"longtext"},{"key":"c_status","label":"Officer assessment: the business is","type":"choice","options":["Growing","Stable","Struggling","Closed"],"required":true},{"key":"c_urgent","label":"Needs urgent attention?","type":"choice","options":["Yes","No"],"required":true},{"key":"c_why","label":"Why (one line)","type":"text"},{"key":"c_support","label":"What support should be given?","type":"longtext"},{"key":"c_next","label":"Next actions (action required, person responsible, date)","type":"longtext"},{"key":"c_shared","label":"Summary shared with participant?","type":"choice","options":["Yes","No"]}]}}};

const ROUTE_Q = 'Send this report to';
const NAME_Q = 'Your full name';
const PHONE_Q = 'Your phone number (the one you sign in to Elimu+ with)';
const COHORT_Q = 'Which cohort is this about';
const PHASE_Q = 'This report is about';
const P_NAME_Q = 'Participant name';
const P_PHONE_Q = 'Participant phone number';
const STAGE_Q = 'Which follow-up visit is this?';

function createAllForms() {
  const props = PropertiesService.getScriptProperties();
  const ids = JSON.parse(props.getProperty('FORM_IDS') || '{}');
  const lists = fetchLists_();
  const links = [];
  Object.keys(TEMPLATES).forEach(function (level) {
    if (ids[level]) { links.push(TEMPLATES[level].short + ': already created ' + FormApp.openById(ids[level]).getPublishedUrl()); return; }
    const t = TEMPLATES[level];
    const form = FormApp.create('Elimu+ Day Report: ' + t.name);
    form.setDescription(t.depth + '\n\nGoes to: ' + t.goes_to + '\nTake five minutes. Say what you actually saw.');
    form.setCollectEmail(false).setProgressBar(true).setAllowResponseEdits(false).setShowLinkToRespondAgain(true);
    form.setConfirmationMessage('Thank you. Your report has been sent.');

    form.addListItem().setTitle(ROUTE_Q).setHelpText('The person who should read this first.').setChoiceValues(routeLabels_(lists)).setRequired(true);
    form.addTextItem().setTitle(NAME_Q).setRequired(true);
    form.addTextItem().setTitle(PHONE_Q).setRequired(true);
    form.addListItem().setTitle(COHORT_Q).setChoiceValues(cohortLabels_(lists)).setRequired(true);
    form.addListItem().setTitle(PHASE_Q).setChoiceValues(PHASES.map(function (p) { return p[1]; })).setRequired(true);

    t.fields.forEach(function (f) { addQuestion_(form, f); });

    const sheet = SpreadsheetApp.create('Elimu+ Day Reports: ' + t.name + ' (responses)');
    form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
    ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
    ids[level] = form.getId();
    links.push(t.short + ': ' + form.getPublishedUrl() + '   (edit: ' + form.getEditUrl() + ')   responses: ' + sheet.getUrl());
  });
  props.setProperty('FORM_IDS', JSON.stringify(ids));
  installTimers_();
  Logger.log('FORMS READY\n' + links.join('\n'));
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Elimu+ report forms are ready', links.join('\n\n'));
}

function addQuestion_(form, f) {
  var item;
  if (f.type === 'longtext') item = form.addParagraphTextItem();
  else if (f.type === 'number') {
    item = form.addTextItem();
    item.setValidation(FormApp.createTextValidation().requireNumber().build());
  }
  else if (f.type === 'choice') item = form.addMultipleChoiceItem().setChoiceValues(f.options);
  else if (f.type === 'checkbox') item = form.addCheckboxItem().setChoiceValues(f.options);
  else if (f.type === 'date') item = form.addDateItem();
  else if (f.type === 'scale') {
    item = form.addScaleItem().setBounds(f.min || 1, f.max || 5);
    if (f.minLabel || f.maxLabel) item.setLabels(f.minLabel || '', f.maxLabel || '');
  }
  else item = form.addTextItem();
  item.setTitle(f.label).setRequired(!!f.required);
  if (f.help) item.setHelpText(f.help);
}

/* ---------- lists from the portal ---------- */
function fetchLists_() {
  try {
    const r = UrlFetchApp.fetch(PORTAL_URL + '/api/forms/cohorts', { headers: { 'x-forms-secret': WEBHOOK_SECRET }, muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      const j = JSON.parse(r.getContentText());
      PropertiesService.getScriptProperties().setProperty('LISTS', JSON.stringify(j));
      return j;
    }
  } catch (e) { Logger.log('Could not reach the portal: ' + e); }
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('LISTS') || '{"cohorts":[],"leaders":[]}');
}
function cohortLabels_(l) { return l.cohorts.length ? l.cohorts.map(function (c) { return c.label; }).concat(['Not listed here (say which in the report)']) : ['Not listed here (say which in the report)']; }
function routeLabels_(l) { return l.leaders.length ? l.leaders.map(function (x) { return x.label; }) : ['Elimu+ founders']; }

function refreshChoices() {
  const lists = fetchLists_();
  const ids = JSON.parse(PropertiesService.getScriptProperties().getProperty('FORM_IDS') || '{}');
  Object.keys(ids).forEach(function (level) {
    const form = FormApp.openById(ids[level]);
    form.getItems(FormApp.ItemType.LIST).forEach(function (it) {
      const li = it.asListItem();
      if (li.getTitle() === COHORT_Q) li.setChoiceValues(cohortLabels_(lists));
      if (li.getTitle() === ROUTE_Q) li.setChoiceValues(routeLabels_(lists));
    });
  });
  refreshRosters();
}

function installTimers_() {
  const have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('refreshChoices') < 0) ScriptApp.newTrigger('refreshChoices').timeBased().everyDays(1).atHour(5).create();
  if (have.indexOf('pollCohortForms') < 0) ScriptApp.newTrigger('pollCohortForms').timeBased().everyMinutes(5).create();
  if (have.indexOf('retryFailed') < 0) ScriptApp.newTrigger('retryFailed').timeBased().everyHours(1).create();
}

/* ---------- a report is submitted ---------- */
function onFormSubmit(e) {
  const form = e.source;
  const level = levelOf_(form.getId());
  if (level === 'followup') return onFollowUpSubmit_(e);
  if (level === 'register') return onRegisterSubmit_(e);
  const t = TEMPLATES[level];
  const answers = {};
  var routeLabel = '', name = '', phone = '', cohort = '', phaseLabel = '';
  e.response.getItemResponses().forEach(function (ir) {
    const title = ir.getItem().getTitle();
    const v = Array.isArray(ir.getResponse()) ? ir.getResponse().join(', ') : String(ir.getResponse());
    if (title === ROUTE_Q) routeLabel = v;
    else if (title === NAME_Q) name = v;
    else if (title === PHONE_Q) phone = v;
    else if (title === COHORT_Q) cohort = v;
    else if (title === PHASE_Q) phaseLabel = v;
    else answers[title] = v;
  });
  const lists = JSON.parse(PropertiesService.getScriptProperties().getProperty('LISTS') || '{"leaders":[]}');
  const leader = lists.leaders.filter(function (x) { return x.label === routeLabel; })[0];
  const phase = (PHASES.filter(function (p) { return p[1] === phaseLabel; })[0] || ['training'])[0];
  const payload = { level: Number(level), response_id: e.response.getId(), respondent_name: name, respondent_phone: phone, cohort: cohort,
    routed_email: leader ? leader.email : '', phase: phase, answers: answers };

  if (!post_(payload)) {
    PropertiesService.getScriptProperties().setProperty('F_' + payload.response_id, JSON.stringify(payload).slice(0, 8500));
  }
  if (leader && leader.email) {
    const concern = String(answers[concernLabel_(t)] || '');
    const urgent = /^Urgent/i.test(concern);
    MailApp.sendEmail({
      to: leader.email,
      subject: (urgent ? 'URGENT: ' : '') + 'Elimu+ ' + t.short + ' report from ' + name + (cohort ? ' (' + cohort.replace(/ \[.*\]$/, '') + ')' : ''),
      body: [name + ' (' + t.name + ', ' + phone + ') sent a report about ' + phaseLabel + '.', 'Cohort: ' + cohort, '']
        .concat(Object.keys(answers).map(function (k) { return k + '\n   ' + answers[k]; })).join('\n')
        + '\n\nOpen it in the portal to mark it seen: ' + PORTAL_URL + '/portal/reports?show=queue'
    });
  }
}

/* ---------- Day 30, 60 and 90 follow-up visits: one form, the stage is chosen first ---------- */
function createFollowUpForm() {
  const props = PropertiesService.getScriptProperties();
  const ids = JSON.parse(props.getProperty('FORM_IDS') || '{}');
  if (ids.followup) { Logger.log('Follow-up form already created: ' + FormApp.openById(ids.followup).getPublishedUrl()); return; }
  const lists = fetchLists_();
  const form = FormApp.create('Elimu+ Follow-up Visit: Day 30, 60 and 90');
  form.setDescription('Complete this at the business. Part A is the same at every visit so progress can be compared; Part B changes by stage; Part C closes the visit. Start with her story and her stock, and ask about money last.\n\nTell her that her answers will not reduce her support and may increase it.');
  form.setCollectEmail(false).setProgressBar(true).setAllowResponseEdits(false).setShowLinkToRespondAgain(true);
  form.setConfirmationMessage('Thank you. The visit has been recorded.');

  form.addListItem().setTitle(ROUTE_Q).setHelpText('The person who should read this first.').setChoiceValues(routeLabels_(lists)).setRequired(true);
  form.addTextItem().setTitle(NAME_Q).setHelpText('The officer doing the visit.').setRequired(true);
  form.addTextItem().setTitle(PHONE_Q).setRequired(true);
  form.addListItem().setTitle(COHORT_Q).setChoiceValues(cohortLabels_(lists)).setRequired(true);
  form.addTextItem().setTitle(P_NAME_Q).setRequired(true);
  form.addTextItem().setTitle(P_PHONE_Q).setHelpText('The number she is registered with in Elimu+, so the visit links to her record.').setRequired(true);
  FOLLOWUP.identity.forEach(function (f) { addQuestion_(form, f); });
  const stageItem = form.addMultipleChoiceItem().setTitle(STAGE_Q).setRequired(true);

  const firstPage = {};
  ['30', '60', '90'].forEach(function (k) {
    const st = FOLLOWUP.stages[k];
    var last;
    [['A', 'Part A: every visit', st.a, 'Same questions at 30, 60 and 90 days, so progress can be compared.'],
     ['B', 'Part B: ' + st.name + ' only, ' + st.title, st.b, st.question],
     ['C', 'Part C: close the visit', st.c, '']].forEach(function (sec) {
      const pb = form.addPageBreakItem().setTitle(st.name + ' follow-up. ' + sec[1]);
      if (sec[3]) pb.setHelpText(sec[3]);
      if (sec[0] === 'A') firstPage[k] = pb;
      last = pb;
      sec[2].forEach(function (f) { addQuestion_(form, f); });
    });
    last.setGoToPage(FormApp.PageNavigationType.SUBMIT);
  });
  stageItem.setChoices(['30', '60', '90'].map(function (k) { return stageItem.createChoice('Day ' + k, firstPage[k]); }));

  const sheet = SpreadsheetApp.create('Elimu+ Follow-up Visits (responses)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
  ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
  ids.followup = form.getId();
  props.setProperty('FORM_IDS', JSON.stringify(ids));
  installTimers_();
  const msg = 'FOLLOW-UP FORM READY\n' + form.getPublishedUrl() + '\n(edit: ' + form.getEditUrl() + ')\nresponses: ' + sheet.getUrl();
  Logger.log(msg);
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Elimu+ follow-up form is ready', msg);
}

function onFollowUpSubmit_(e) {
  const answers = {};
  var routeLabel = '', officer = '', ophone = '', cohort = '', pname = '', pphone = '', stageLabel = '';
  e.response.getItemResponses().forEach(function (ir) {
    const title = ir.getItem().getTitle();
    const v = Array.isArray(ir.getResponse()) ? ir.getResponse().join(', ') : String(ir.getResponse());
    if (title === ROUTE_Q) routeLabel = v;
    else if (title === NAME_Q) officer = v;
    else if (title === PHONE_Q) ophone = v;
    else if (title === COHORT_Q) cohort = v;
    else if (title === P_NAME_Q) pname = v;
    else if (title === P_PHONE_Q) pphone = v;
    else if (title === STAGE_Q) stageLabel = v;
    else answers[title] = v;
  });
  const stage = Number((/\d+/.exec(stageLabel) || ['0'])[0]);
  const lists = JSON.parse(PropertiesService.getScriptProperties().getProperty('LISTS') || '{"leaders":[]}');
  const leader = lists.leaders.filter(function (x) { return x.label === routeLabel; })[0];
  const payload = { kind: 'followup', stage: stage, response_id: e.response.getId(), officer_name: officer, officer_phone: ophone,
    participant_name: pname, participant_phone: pphone, cohort: cohort, routed_email: leader ? leader.email : '', answers: answers };
  if (!post_(payload)) PropertiesService.getScriptProperties().setProperty('F_' + payload.response_id, JSON.stringify(payload).slice(0, 8500));

  if (leader && leader.email) {
    const st = FOLLOWUP.stages[String(stage)];
    const label = function (key) { const f = st.a.concat(st.b, st.c).filter(function (x) { return x.key === key; })[0]; return f ? answers[f.label] : ''; };
    const urgent = label('c_urgent') === 'Yes';
    MailApp.sendEmail({
      to: leader.email,
      subject: (urgent ? 'URGENT: ' : '') + 'Elimu+ Day ' + stage + ' follow-up: ' + pname + (label('c_status') ? ' (' + label('c_status') + ')' : ''),
      body: [officer + ' (' + ophone + ') visited ' + pname + ' for the Day ' + stage + ' follow-up.', 'Cohort: ' + cohort,
        'Business is: ' + (label('c_status') || 'not stated'), 'Biggest challenge: ' + (label('a7_words') || 'not stated'), 'Support to give: ' + (label('c_support') || 'not stated'), '',
        'Everything she and the officer answered is in the portal under the cohort: ' + PORTAL_URL + '/portal/cohorts'].join('\n')
    });
  }
}

/* ---------- cohort roster, attendance and two-observer notes ---------- */
const REG_BUSINESS = ['I already run a business', 'I want to start one', 'Not sure yet'];
const REG_CONSENT = 'The participant agrees that Elimu+ and the partner organisation may hold these details to run the programme and follow up afterwards';
const NOT_LISTED = 'Not listed here (type its name below)';
const TYPED_COHORT_Q = 'If the cohort is not in the list above, type its name';
const EMAIL_Q = 'Participant email (only if they have one)';
const BUS_Q = 'Business status';
const NOTE_Q = 'What is the business, or the idea they want to start?';
const DAY_Q = 'Which day of the programme is this?';
const DATE_Q = 'Date of this session';
const PRESENT_Q = 'Who was present today?';
const EXTRA_Q = 'Did anyone come today who is not on this list?';
const EXTRA_NAMES_Q = 'Name and phone number of each person who was not listed (one person per line)';
const TOPIC_Q = 'What was taught today?';
const WELFARE_Q = 'Any welfare or safety concern about a participant?';
const WELFARE_WHO_Q = 'If yes, who and what did you see?';
const WELFARE_CHOICES = ['No concern', 'Yes, but it can wait', 'Yes, urgent: someone needs help today'];
const OBS_COLS = ['1 Low', '2', '3', '4', '5 High'];
const OBS_GRIDS = [
  ['Engagement (1 = switched off, 5 = fully engaged)', 'Engagement'],
  ['Understanding (1 = lost, 5 = could teach it back)', 'Understanding'],
  ['Participation (1 = silent, 5 = contributed strongly)', 'Participation']
];
const OBS_TEXT = [
  ['How did the group take in the content today? What did they grasp quickly and where did they get stuck?', true],
  ['How was the group as a whole: energy, teamwork, mood, who they listened to?', true],
  ['Who stood out today, and what exactly did you see?', false],
  ['Who seemed to struggle or may need extra support, and why do you think so?', false],
  ['What should the facilitator repeat, change or watch for tomorrow?', false],
  ['Anything else the founders or the partner organisation should know?', false]
];

function J_(k, d) { const v = PropertiesService.getScriptProperties().getProperty(k); return v ? JSON.parse(v) : d; }
function setJ_(k, v) { PropertiesService.getScriptProperties().setProperty(k, JSON.stringify(v)); }
function ownerEmail_() { return Session.getEffectiveUser().getEmail(); }
function slug_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'unnamed'; }
function cohortKey_(label, typed) {
  const m = /\[([0-9a-f]{8})\]\s*$/.exec(String(label || ''));
  return m ? m[1] : 'x' + slug_(typed || label);
}
function cohortTitle_(label) { return String(label).replace(/\s*\[[0-9a-f]{8}\]\s*$/, ''); }
function lastNine_(p) { return String(p || '').replace(/\D/g, '').slice(-9); }
function dayOf_(v) { return Number((/\d+/.exec(String(v)) || ['0'])[0]); }
function dayChoices_() { const a = []; for (var i = 1; i <= 12; i++) a.push('Day ' + i); return a; }
function rosterOf_(key) { return J_('R_' + key, { l: '', p: [] }); }

function addToRoster_(key, label, name, phone) {
  const r = rosterOf_(key);
  r.l = r.l || label;
  const id = lastNine_(phone);
  const hit = r.p.filter(function (x) { return id ? lastNine_(x[1]) === id : String(x[0]).toLowerCase() === String(name).toLowerCase(); })[0];
  if (hit) { if (name) hit[0] = name; if (id) hit[1] = phone; } else r.p.push([name, phone]);
  const text = JSON.stringify(r);
  if (text.length > 8800) throw new Error('This cohort roster is too large for one list. Split it into two cohorts.');
  PropertiesService.getScriptProperties().setProperty('R_' + key, text);
}

/** One entry per person with a label that is unique, so ticks and grid rows map back to a phone number. */
function labelsOf_(key) {
  const seen = {};
  return rosterOf_(key).p.map(function (x) {
    var lab = x[0] + (lastNine_(x[1]) ? ' (ends ' + lastNine_(x[1]).slice(-3) + ')' : '');
    if (seen[lab]) { seen[lab]++; lab += ' #' + seen[lab]; } else seen[lab] = 1;
    return { label: lab, name: x[0], phone: x[1] };
  });
}
function choiceLabels_(key) {
  const a = labelsOf_(key).map(function (x) { return x.label; });
  return a.length ? a : ['(no one is registered yet)'];
}

function createRegistrationForm() {
  const props = PropertiesService.getScriptProperties();
  const ids = J_('FORM_IDS', {});
  if (ids.register) { Logger.log('Registration form already created: ' + FormApp.openById(ids.register).getPublishedUrl()); return; }
  const lists = fetchLists_();
  const form = FormApp.create('Elimu+ Cohort Registration');
  form.setDescription('Fill this once for every participant when a cohort starts. It records who is in the room, how to reach them, and the business they run or want to start. After you submit, choose "Submit another response" for the next person.');
  form.setCollectEmail(false).setProgressBar(false).setAllowResponseEdits(false).setShowLinkToRespondAgain(true);
  form.setConfirmationMessage('Registered. Choose "Submit another response" to add the next participant.');
  form.addListItem().setTitle(COHORT_Q).setChoiceValues(cohortLabels_(lists).slice(0, -1).concat([NOT_LISTED])).setRequired(true);
  form.addTextItem().setTitle(TYPED_COHORT_Q).setHelpText('Leave blank when the cohort is in the list.');
  form.addTextItem().setTitle(NAME_Q).setHelpText('The person entering the registrations.').setRequired(true);
  form.addTextItem().setTitle(PHONE_Q).setRequired(true);
  form.addTextItem().setTitle(P_NAME_Q).setHelpText('Full name as they want it on their certificate.').setRequired(true);
  form.addTextItem().setTitle(P_PHONE_Q).setHelpText('A number that reaches them directly. It becomes their record and follow-up contact.').setRequired(true);
  form.addTextItem().setTitle(EMAIL_Q).setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
  form.addMultipleChoiceItem().setTitle(BUS_Q).setChoiceValues(REG_BUSINESS).setRequired(true);
  form.addParagraphTextItem().setTitle(NOTE_Q).setHelpText('A few words are enough, for example: sells vegetables at the roadside, or wants to open a salon.');
  form.addCheckboxItem().setTitle('Consent').setChoiceValues([REG_CONSENT]).setRequired(true);
  const sheet = SpreadsheetApp.create('Elimu+ Cohort Registration (responses)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
  ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
  ids.register = form.getId();
  setJ_('FORM_IDS', ids);
  installTimers_();
  const msg = 'REGISTRATION FORM READY\n' + form.getPublishedUrl() + '\n(edit: ' + form.getEditUrl() + ')\nresponses: ' + sheet.getUrl();
  Logger.log(msg);
  MailApp.sendEmail(ownerEmail_(), 'Elimu+ registration form is ready', msg);
}

function onRegisterSubmit_(e) {
  const a = {};
  e.response.getItemResponses().forEach(function (ir) { a[ir.getItem().getTitle()] = Array.isArray(ir.getResponse()) ? ir.getResponse().join(', ') : String(ir.getResponse()); });
  const listed = a[COHORT_Q] && !/^Not listed/.test(a[COHORT_Q]) ? a[COHORT_Q] : '';
  const typed = String(a[TYPED_COHORT_Q] || '').trim();
  const label = listed || typed || 'Unnamed cohort';
  const key = cohortKey_(listed, typed);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    addToRoster_(key, label, String(a[P_NAME_Q] || '').trim(), String(a[P_PHONE_Q] || '').trim());
    ensureCohortForms_(key, label);
  } finally { lock.releaseLock(); }
  if (!listed) {
    MailApp.sendEmail(ownerEmail_(), 'Elimu+ registration: cohort not in the portal', String(a[P_NAME_Q]) + ' was registered for "' + label + '", which is not in the portal list. They are on the Google roster and attendance forms, but not in the portal until that cohort is added under Cohorts in the portal.');
    return;
  }
  postRoster_({ kind: 'register', response_id: e.response.getId(), officer_name: a[NAME_Q], officer_phone: a[PHONE_Q], cohort: listed,
    participant_name: a[P_NAME_Q], participant_phone: a[P_PHONE_Q], email: a[EMAIL_Q] || '', business_status: a[BUS_Q] || '', business_note: a[NOTE_Q] || '' },
    'Registration of ' + a[P_NAME_Q]);
}

/** Sends to the portal; a network failure queues the post for the hourly retry, a rejection is reported to the owner. */
function postRoster_(payload, what) {
  const res = postJson_(payload);
  if (!res) { PropertiesService.getScriptProperties().setProperty('F_' + payload.response_id, JSON.stringify(payload).slice(0, 8500)); return; }
  if (res.ok === false) MailApp.sendEmail(ownerEmail_(), 'Elimu+ could not save to the portal: ' + what, String(res.rejected || 'Unknown reason') + '\n\nThe Google form response itself is safe in its response sheet.');
}

function ensureCohortForms_(key, label) {
  const ids = J_('FORM_IDS', {});
  const made = [];
  if (!ids['att_' + key]) { ids['att_' + key] = makeAttendanceForm_(key, label, made); }
  if (!ids['obs_' + key]) { ids['obs_' + key] = makeObserverForm_(key, label, made); }
  setJ_('FORM_IDS', ids);
  if (made.length) {
    installTimers_();
    MailApp.sendEmail(ownerEmail_(), 'Elimu+ forms ready for ' + cohortTitle_(label), made.join('\n\n') + '\n\nShare the attendance link with whoever takes the register. Give the observer link to two different observers; each fills it alone.');
  } else refreshRosterForms_(key);
}

function sheetFor_(form, title) {
  const sheet = SpreadsheetApp.create(title);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
  return sheet;
}

function makeAttendanceForm_(key, label, made) {
  const form = FormApp.create('Elimu+ Attendance: ' + cohortTitle_(label));
  form.setDescription('Tick everyone who is in the room today. Submit once per session. If someone came who is not on the list, say so on the next page and they will be added to the cohort.');
  form.setCollectEmail(false).setProgressBar(false).setAllowResponseEdits(false).setShowLinkToRespondAgain(false);
  form.setConfirmationMessage('Attendance recorded. Thank you.');
  form.addTextItem().setTitle(NAME_Q).setHelpText('The person taking the register.').setRequired(true);
  form.addTextItem().setTitle(PHONE_Q).setRequired(true);
  form.addListItem().setTitle(DAY_Q).setChoiceValues(dayChoices_()).setRequired(true);
  form.addDateItem().setTitle(DATE_Q).setRequired(true);
  form.addCheckboxItem().setTitle(PRESENT_Q).setChoiceValues(choiceLabels_(key));
  const extra = form.addMultipleChoiceItem().setTitle(EXTRA_Q).setRequired(true);
  const pb = form.addPageBreakItem().setTitle('People who came but were not on the list');
  form.addParagraphTextItem().setTitle(EXTRA_NAMES_Q).setHelpText('Example: Mary Wanjiru 0712345678').setRequired(true);
  extra.setChoices([extra.createChoice('No, everyone who came was listed', FormApp.PageNavigationType.SUBMIT), extra.createChoice('Yes, someone was not listed', pb)]);
  const sheet = sheetFor_(form, 'Elimu+ Attendance: ' + cohortTitle_(label) + ' (responses)');
  made.push('ATTENDANCE: ' + form.getPublishedUrl() + '\n(edit: ' + form.getEditUrl() + ')\nresponses: ' + sheet.getUrl());
  return form.getId();
}

function makeObserverForm_(key, label, made) {
  const form = FormApp.create('Elimu+ Observer Notes: ' + cohortTitle_(label));
  form.setDescription('Fill this on your own, straight after the session and before you compare notes with the other observer. Two observers fill the same form separately so that the view is not shaped by one person. Rate what you saw, not what you hoped to see. Leave a participant blank if you did not see enough.');
  form.setCollectEmail(false).setProgressBar(true).setAllowResponseEdits(false).setShowLinkToRespondAgain(false);
  form.setConfirmationMessage('Thank you. Your notes have been recorded.');
  form.addTextItem().setTitle(NAME_Q).setHelpText('You, the observer.').setRequired(true);
  form.addTextItem().setTitle(PHONE_Q).setRequired(true);
  form.addListItem().setTitle(DAY_Q).setChoiceValues(dayChoices_()).setRequired(true);
  form.addTextItem().setTitle(TOPIC_Q).setRequired(true);
  const names = choiceLabels_(key);
  OBS_GRIDS.forEach(function (g) { form.addGridItem().setTitle(g[0]).setRows(names).setColumns(OBS_COLS).setRequired(false); });
  OBS_TEXT.forEach(function (q) { form.addParagraphTextItem().setTitle(q[0]).setRequired(q[1]); });
  form.addMultipleChoiceItem().setTitle(WELFARE_Q).setChoiceValues(WELFARE_CHOICES).setRequired(true);
  form.addParagraphTextItem().setTitle(WELFARE_WHO_Q);
  const sheet = sheetFor_(form, 'Elimu+ Observer Notes: ' + cohortTitle_(label) + ' (responses)');
  made.push('OBSERVER NOTES: ' + form.getPublishedUrl() + '\n(edit: ' + form.getEditUrl() + ')\nresponses: ' + sheet.getUrl());
  return form.getId();
}

/** Keeps the tick list and the observer grids in step with the roster. */
function refreshRosterForms_(key) {
  const ids = J_('FORM_IDS', {});
  const names = choiceLabels_(key);
  if (ids['att_' + key]) {
    FormApp.openById(ids['att_' + key]).getItems(FormApp.ItemType.CHECKBOX).forEach(function (it) { if (it.getTitle() === PRESENT_Q) it.asCheckboxItem().setChoiceValues(names); });
  }
  if (ids['obs_' + key]) {
    FormApp.openById(ids['obs_' + key]).getItems(FormApp.ItemType.GRID).forEach(function (it) {
      if (OBS_GRIDS.some(function (g) { return g[0] === it.getTitle(); })) it.asGridItem().setRows(names);
    });
  }
}
function refreshRosters() {
  const ids = J_('FORM_IDS', {});
  const keys = {};
  Object.keys(ids).forEach(function (k) { if (/^(att|obs)_/.test(k)) keys[k.slice(4)] = 1; });
  Object.keys(keys).forEach(refreshRosterForms_);
}

/** Per-cohort forms are read on a timer instead of a trigger each, because a script may only hold twenty triggers. */
function pollCohortForms() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const ids = J_('FORM_IDS', {});
    Object.keys(ids).filter(function (k) { return /^(att|obs)_/.test(k); }).forEach(function (k) {
      const form = FormApp.openById(ids[k]);
      const last = props.getProperty('LP_' + k);
      const key = k.slice(4);
      (last ? form.getResponses(new Date(last)) : form.getResponses()).forEach(function (r) {
        try {
          if (k.indexOf('att_') === 0) onAttendanceSubmit_(r, key); else onObserverSubmit_(r, key);
          props.setProperty('LP_' + k, r.getTimestamp().toISOString());
        } catch (err) { Logger.log('Could not process a response on ' + k + ': ' + err); }
      });
    });
  } finally { lock.releaseLock(); }
}

function onAttendanceSubmit_(r, key) {
  const meta = rosterOf_(key);
  const labels = labelsOf_(key);
  const a = {};
  var ticked = [];
  r.getItemResponses().forEach(function (ir) {
    const t = ir.getItem().getTitle();
    if (t === PRESENT_Q) ticked = [].concat(ir.getResponse());
    else a[t] = Array.isArray(ir.getResponse()) ? ir.getResponse().join(', ') : String(ir.getResponse());
  });
  const present = ticked.map(function (l) { return labels.filter(function (x) { return x.label === l; })[0]; })
    .filter(function (x) { return x; }).map(function (x) { return { name: x.name, phone: x.phone }; });
  const day = dayOf_(a[DAY_Q]);
  const newcomers = a[EXTRA_NAMES_Q] || '';
  const hasCohort = /\[[0-9a-f]{8}\]\s*$/.test(meta.l);
  if (hasCohort) {
    postRoster_({ kind: 'attendance', response_id: r.getId(), officer_name: a[NAME_Q], officer_phone: a[PHONE_Q], cohort: meta.l, day: day,
      session_date: a[DATE_Q] || '', present: present, newcomers: newcomers }, 'Attendance for ' + cohortTitle_(meta.l) + ' day ' + day);
  }
  String(newcomers).split(/\r?\n/).forEach(function (line) {
    const t = line.trim();
    if (!t) return;
    const ph = (/(\+?\d[\d\s-]{7,}\d)/.exec(t) || [''])[0];
    const nm = t.replace(ph, '').replace(/[,;|:()-]+\s*$/, '').replace(/^[,;|:()-]+/, '').trim();
    if (nm) addToRoster_(key, meta.l, nm, ph);
  });
  const total = rosterOf_(key).p.length;
  setJ_('LAST_' + key, { day: day, date: a[DATE_Q] || '', n: present.length, total: total });
  const ids = J_('FORM_IDS', {});
  if (ids['att_' + key]) {
    FormApp.openById(ids['att_' + key]).setDescription('Tick everyone who is in the room today. Submit once per session. If someone came who is not on the list, say so on the next page and they will be added to the cohort.\n\nLast register: Day ' + day + ', ' + present.length + ' of ' + total + ' present.');
  }
  refreshRosterForms_(key);
}

function onObserverSubmit_(r, key) {
  const meta = rosterOf_(key);
  const a = {};
  const grid = {};
  const written = [];
  r.getItemResponses().forEach(function (ir) {
    const it = ir.getItem();
    const t = it.getTitle();
    if (it.getType() === FormApp.ItemType.GRID) {
      const gi = OBS_GRIDS.map(function (g) { return g[0]; }).indexOf(t);
      const rows = it.asGridItem().getRows();
      const vals = ir.getResponse() || [];
      rows.forEach(function (row, i) {
        const n = vals[i] ? Number(String(vals[i]).charAt(0)) : 0;
        if (gi >= 0 && n) { grid[row] = grid[row] || [0, 0, 0]; grid[row][gi] = n; }
      });
    } else {
      const v = Array.isArray(ir.getResponse()) ? ir.getResponse().join(', ') : String(ir.getResponse());
      a[t] = v;
      if (t !== NAME_Q && t !== PHONE_Q && t !== DAY_Q && t !== TOPIC_Q) written.push(t + '\n   ' + v);
    }
  });
  const day = dayOf_(a[DAY_Q]);
  const who = String(a[NAME_Q] || 'Observer');
  const title = cohortTitle_(meta.l || key);
  MailApp.sendEmail(ownerEmail_(), 'Elimu+ observer notes: ' + title + ', Day ' + day + ' (' + who + ')',
    who + ' (' + a[PHONE_Q] + ') observed Day ' + day + '. Topic: ' + (a[TOPIC_Q] || '') + '\n\n' + written.join('\n\n') +
    '\n\nRatings are in the response sheet. Paste this into Claude to review the session.');
  if (String(a[WELFARE_Q] || '').indexOf('urgent') >= 0) {
    MailApp.sendEmail(ownerEmail_(), 'URGENT welfare concern: ' + title + ', Day ' + day, who + ' flagged an urgent welfare concern.\n\n' + (a[WELFARE_WHO_Q] || 'No detail given. Phone the observer: ' + a[PHONE_Q]));
  }
  const k = 'O_' + key + '_' + day;
  const all = J_(k, []).filter(function (x) { return x.o.toLowerCase() !== who.toLowerCase(); });
  all.push({ o: who, m: grid });
  setJ_(k, all);
  if (all.length >= 2) compareObservers_(title, day, all[0], all[all.length - 1]);
}

function compareObservers_(title, day, A, B) {
  const dims = OBS_GRIDS.map(function (g) { return g[1]; });
  var same = 0, close = 0, count = 0;
  const flags = [];
  Object.keys(A.m).forEach(function (name) {
    if (!B.m[name]) return;
    dims.forEach(function (d, i) {
      const x = A.m[name][i], y = B.m[name][i];
      if (!x || !y) return;
      count++;
      const diff = Math.abs(x - y);
      if (diff === 0) same++;
      if (diff <= 1) close++;
      if (diff >= 2) flags.push(name + ': ' + d + ' ' + A.o + ' ' + x + ', ' + B.o + ' ' + y);
    });
  });
  const only = function (p, q) { return Object.keys(p.m).filter(function (n) { return !q.m[n]; }); };
  const body = [A.o + ' and ' + B.o + ' both observed ' + title + ', Day ' + day + '.',
    count ? 'Ratings compared: ' + count + '. Same score: ' + Math.round(100 * same / count) + '%. Within one point: ' + Math.round(100 * close / count) + '%.' : 'No participants were rated by both observers.',
    '', flags.length ? 'Where they differ by two points or more (worth talking about):\n' + flags.join('\n') : 'No ratings differ by two points or more.',
    only(A, B).length ? '\nRated only by ' + A.o + ': ' + only(A, B).join(', ') : '', only(B, A).length ? '\nRated only by ' + B.o + ': ' + only(B, A).join(', ') : ''].join('\n');
  MailApp.sendEmail(ownerEmail_(), 'Elimu+ two observers compared: ' + title + ', Day ' + day, body);
}

function allFormLinks() {
  const ids = J_('FORM_IDS', {});
  const out = Object.keys(ids).map(function (k) { return k + ': ' + FormApp.openById(ids[k]).getPublishedUrl(); });
  Logger.log(out.join('\n'));
  return out.join('\n');
}

function levelOf_(formId) {
  const ids = JSON.parse(PropertiesService.getScriptProperties().getProperty('FORM_IDS') || '{}');
  return Object.keys(ids).filter(function (k) { return ids[k] === formId; })[0];
}
function concernLabel_(t) { return t.fields.filter(function (f) { return f.key === 'concern'; })[0].label; }

function postJson_(payload) {
  const path = payload.kind === 'followup' ? '/api/forms/followup' : (payload.kind === 'register' || payload.kind === 'attendance') ? '/api/forms/roster' : '/api/forms/report';
  try {
    const r = UrlFetchApp.fetch(PORTAL_URL + path, { method: 'post', contentType: 'application/json', headers: { 'x-forms-secret': WEBHOOK_SECRET }, payload: JSON.stringify(payload), muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return null;
    try { return JSON.parse(r.getContentText()); } catch (x) { return { ok: true }; }
  } catch (e) { Logger.log('Post failed: ' + e); return null; }
}
function post_(payload) { return !!postJson_(payload); }

/** Reports that could not reach the portal (it was down, or not live yet) are tried again every hour. */
function retryFailed() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).filter(function (k) { return k.indexOf('F_') === 0; }).forEach(function (k) {
    if (post_(JSON.parse(all[k]))) props.deleteProperty(k);
  });
}
