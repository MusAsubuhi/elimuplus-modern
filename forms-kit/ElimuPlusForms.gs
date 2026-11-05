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
const PORTAL_URL = "https://portal.elimuplus.com";
const WEBHOOK_SECRET = "PASTE_THE_SECRET_HERE";
const TEMPLATES = {"0":{"name":"Trainee Facilitator","short":"Trainee","depth":"Short observation report. About two minutes. Say what you actually saw.","goes_to":"Your supervisor first, then the founders see a summary.","fields":[{"key":"day_number","label":"Training day number","type":"number","required":true,"core":true},{"key":"headcount","label":"Participants present","type":"number","required":true,"core":true},{"key":"engagement","label":"Participant engagement","type":"scale","required":true,"min":1,"max":5,"minLabel":"Low","maxLabel":"High"},{"key":"surprised_me","label":"What surprised you today, good or bad?","type":"longtext","required":true,"help":"This is the most valuable question on the form. Say what you actually saw."},{"key":"venue_ok","label":"Room and materials","type":"choice","required":true,"options":["All fine","Minor issue","Serious issue"]},{"key":"venue_note","label":"If there is an issue, what is it?","type":"longtext","required":false},{"key":"concern","label":"Overall concern","type":"choice","required":true,"core":true,"options":["No concern","Keep an eye on it","Urgent, someone should call me"]},{"key":"concern_note","label":"If there is a concern, what happened? If you need help tomorrow, say what.","type":"longtext","required":false,"core":true}]},"1":{"name":"Associate Facilitator","short":"Associate","depth":"Day report. About two minutes.","goes_to":"Your supervisor, then the founders see a summary.","fields":[{"key":"day_number","label":"Training day number","type":"number","required":true,"core":true},{"key":"headcount","label":"Participants present","type":"number","required":true,"core":true},{"key":"plan_followed","label":"Did you follow the day plan?","type":"choice","required":true,"options":["Yes","Partly","No"]},{"key":"plan_change","label":"If not, what changed and why?","type":"longtext","required":false},{"key":"engagement","label":"Participant engagement","type":"scale","required":true,"min":1,"max":5,"minLabel":"Low","maxLabel":"High"},{"key":"canvas_progress","label":"Canvas progress","type":"choice","required":true,"options":["Not started","Started","Halfway","Nearly complete","Complete"]},{"key":"venue_ok","label":"Room and materials","type":"choice","required":true,"options":["All fine","Minor issue","Serious issue"]},{"key":"venue_note","label":"If there is an issue, what is it?","type":"longtext","required":false},{"key":"concern","label":"Overall concern","type":"choice","required":true,"core":true,"options":["No concern","Keep an eye on it","Urgent, someone should call me"]},{"key":"concern_note","label":"If there is a concern, what happened? If you need help tomorrow, say what.","type":"longtext","required":false,"core":true},{"key":"hardest","label":"Which concept was hardest for the group?","type":"longtext","required":true}]},"2":{"name":"Certified Facilitator","short":"Certified","depth":"Day report with learning evidence and welfare. About three minutes.","goes_to":"A master trainer and the founders.","fields":[{"key":"day_number","label":"Training day number","type":"number","required":true,"core":true},{"key":"headcount","label":"Participants present","type":"number","required":true,"core":true},{"key":"plan_followed","label":"Did you follow the day plan?","type":"choice","required":true,"options":["Yes","Partly","No"]},{"key":"plan_change","label":"If not, what changed and why?","type":"longtext","required":false},{"key":"engagement","label":"Participant engagement","type":"scale","required":true,"min":1,"max":5,"minLabel":"Low","maxLabel":"High"},{"key":"canvas_progress","label":"Canvas progress","type":"choice","required":true,"options":["Not started","Started","Halfway","Nearly complete","Complete"]},{"key":"venue_ok","label":"Room and materials","type":"choice","required":true,"options":["All fine","Minor issue","Serious issue"]},{"key":"venue_note","label":"If there is an issue, what is it?","type":"longtext","required":false},{"key":"concern","label":"Overall concern","type":"choice","required":true,"core":true,"options":["No concern","Keep an eye on it","Urgent, someone should call me"]},{"key":"concern_note","label":"If there is a concern, what happened? If you need help tomorrow, say what.","type":"longtext","required":false,"core":true},{"key":"learning_evidence","label":"What evidence did you see that participants learned today?","type":"longtext","required":true},{"key":"safeguarding","label":"Any safeguarding or welfare matter?","type":"choice","required":true,"options":["No","Yes, I have handled it","Yes, I need help"]}]},"3":{"name":"Master Trainer (QA visit)","short":"Master","depth":"Quality visit. Three scores, one improvement, and a decision.","goes_to":"The founders.","kind":"qa","fields":[{"key":"day_number","label":"Training day observed","type":"number","required":true,"core":true},{"key":"headcount","label":"Participants present","type":"number","required":true,"core":true},{"key":"facilitator_name","label":"Facilitator observed","type":"text","required":true},{"key":"score_preparation","label":"Preparation and materials","type":"scale","required":true,"min":1,"max":5,"minLabel":"Poor","maxLabel":"Excellent"},{"key":"score_delivery","label":"Delivery and clarity","type":"scale","required":true,"min":1,"max":5,"minLabel":"Poor","maxLabel":"Excellent"},{"key":"score_participation","label":"Participation and inclusion","type":"scale","required":true,"min":1,"max":5,"minLabel":"Poor","maxLabel":"Excellent"},{"key":"safeguarding","label":"Safeguarding or welfare matter?","type":"choice","required":true,"options":["No","Yes, handled","Yes, needs help"]},{"key":"improve","label":"What should improve before the next day?","type":"longtext","required":true},{"key":"decision","label":"Decision","type":"choice","required":true,"options":["Pass","Pass with actions","Needs another visit","Escalate to founders"]},{"key":"concern","label":"Overall concern","type":"choice","required":true,"core":true,"options":["No concern","Keep an eye on it","Urgent, someone should call me"]},{"key":"concern_note","label":"If there is a concern, what happened? If you need help tomorrow, say what.","type":"longtext","required":false,"core":true}]}};
const PHASES = [["training","The training"],["followup_30","30-day follow-up"],["followup_60","60-day follow-up"],["followup_90","90-day follow-up"],["other","Something else"]];
const FOLLOWUP = {"version":3,"identity":[{"key":"visited_on","label":"Date of visit","type":"date","required":true}],"stages":{"30":{"name":"Day 30","title":"first visit","question":"Is it working, and was the promised support received?","a":[{"key":"a1_operating","label":"Is the business operating?","type":"choice","required":true,"options":["Yes","Yes, but reduced","No"]},{"key":"a1_closed_why","label":"If reduced or not operating, the main reason","type":"checkbox","required":false,"options":["No capital","No stock","Sickness or family","Lost customers","Moved or relocated","Other"]},{"key":"a4_profit_band","label":"About how much profit did the business make last week?","type":"choice","required":true,"help":"Work it out together: sales minus the cost of the stock sold. A range is fine.","options":["No profit, or a loss","Under Ksh 1,000","Ksh 1,000 to 2,000","Ksh 2,000 to 4,000","Over Ksh 4,000"]},{"key":"a4_profit","label":"If she can say a figure, how much was it? (Ksh)","type":"number","required":false},{"key":"a4_compare","label":"Compared with before the training, her weekly income is","type":"choice","required":true,"options":["Increasing","About the same","Decreasing"]},{"key":"a4_compare_why","label":"Why did it change? (one line)","type":"text","required":false},{"key":"a3_stock_level","label":"Does she have enough stock or tools to keep trading?","type":"choice","required":true,"options":["Yes","Partly","No"]},{"key":"a3_missing","label":"If not, what is missing?","type":"text","required":false},{"key":"a3_stock_value","label":"Total business value today, stock plus cash (Ksh)","type":"number","required":true,"help":"Count the stock together with her and add the cash in the business."},{"key":"a7_challenges","label":"Challenges (tick all that apply)","type":"checkbox","required":true,"options":["Security","Health or family","Debt repayment","Not enough stock or capital","Few customers or low sales","Stock costs rising","Rent, licence or location","Transport","Competition","Other","None at the moment"]},{"key":"a7_growth","label":"Signs of growth (tick all that apply)","type":"checkbox","required":true,"options":["More customers","Higher sales","New product added","Stock increased","Saving regularly","Hired help","New location or market","None yet"]},{"key":"a7_risk","label":"Signs of risk (tick all that apply)","type":"checkbox","required":true,"help":"A personal safety concern alerts the founders straight away.","options":["Personal safety concern","Thinking of closing","Health or family problem","Debt rising","Stock running low","Sales falling","Business and household money mixed","None"]},{"key":"a5_records","label":"Does she write down sales and spending?","type":"choice","required":true,"options":["Daily","Sometimes","Not yet"]},{"key":"a5_pays_self","label":"Does she pay herself a set amount?","type":"choice","required":true,"options":["Yes","Sometimes","No"]},{"key":"a5_separate","label":"Does she keep business money apart from home money?","type":"choice","required":true,"options":["Yes","Mostly","No"]},{"key":"a5_used_calc","label":"In the last month, did she use a calculation (cost, price or profit) to make a decision?","type":"choice","required":true,"options":["Yes","No"]},{"key":"a5_used_calc_what","label":"If yes, what was it?","type":"text","required":false},{"key":"a7_confidence","label":"How confident is she about running this business?","type":"scale","required":true,"min":1,"max":5,"minLabel":"Not at all","maxLabel":"Very confident"}],"b":[{"key":"b1_received","label":"Was the support promised received?","type":"choice","required":true,"options":["Fully","Partly","Not yet"]},{"key":"b1_missing","label":"If not, what is missing?","type":"text","required":false}],"c":[{"key":"b4_support","label":"Support still needed","type":"checkbox","required":true,"options":["Stock or capital","Equipment","Mentoring","Market links","Record-keeping help","Health or family referral","Nothing"]},{"key":"c_action","label":"Action taken at this visit (one line)","type":"text","required":true},{"key":"c_status","label":"Result of this visit: the business is","type":"choice","required":true,"options":["Stable","Growing","Struggling","Closed"]},{"key":"c_next","label":"Next action: what needs to happen","type":"text","required":true},{"key":"c_next_who","label":"Next action: who will do it","type":"text","required":true},{"key":"c_next_date","label":"Next action: by when","type":"date","required":true},{"key":"c_impact","label":"What has changed for her income and her family?","type":"longtext","required":false,"help":"One or two sentences. This becomes the impact note in the 30-day report."}]},"60":{"name":"Day 60","title":"second visit","question":"","a":[{"key":"a1_operating","label":"Is the business operating?","type":"choice","required":true,"options":["Yes","Yes, but reduced","No"]},{"key":"a1_closed_why","label":"If reduced or not operating, the main reason","type":"checkbox","required":false,"options":["No capital","No stock","Sickness or family","Lost customers","Moved or relocated","Other"]},{"key":"a4_profit_band","label":"About how much profit did the business make last week?","type":"choice","required":true,"help":"Work it out together: sales minus the cost of the stock sold. A range is fine.","options":["No profit, or a loss","Under Ksh 1,000","Ksh 1,000 to 2,000","Ksh 2,000 to 4,000","Over Ksh 4,000"]},{"key":"a4_profit","label":"If she can say a figure, how much was it? (Ksh)","type":"number","required":false},{"key":"a4_compare","label":"Compared with before the training, her weekly income is","type":"choice","required":true,"options":["Increasing","About the same","Decreasing"]},{"key":"a4_compare_why","label":"Why did it change? (one line)","type":"text","required":false},{"key":"a3_stock_level","label":"Does she have enough stock or tools to keep trading?","type":"choice","required":true,"options":["Yes","Partly","No"]},{"key":"a3_missing","label":"If not, what is missing?","type":"text","required":false},{"key":"a3_stock_value","label":"Total business value today, stock plus cash (Ksh)","type":"number","required":true,"help":"Count the stock together with her and add the cash in the business."},{"key":"a7_challenges","label":"Challenges (tick all that apply)","type":"checkbox","required":true,"options":["Security","Health or family","Debt repayment","Not enough stock or capital","Few customers or low sales","Stock costs rising","Rent, licence or location","Transport","Competition","Other","None at the moment"]},{"key":"a7_growth","label":"Signs of growth (tick all that apply)","type":"checkbox","required":true,"options":["More customers","Higher sales","New product added","Stock increased","Saving regularly","Hired help","New location or market","None yet"]},{"key":"a7_risk","label":"Signs of risk (tick all that apply)","type":"checkbox","required":true,"help":"A personal safety concern alerts the founders straight away.","options":["Personal safety concern","Thinking of closing","Health or family problem","Debt rising","Stock running low","Sales falling","Business and household money mixed","None"]},{"key":"a5_records","label":"Does she write down sales and spending?","type":"choice","required":true,"options":["Daily","Sometimes","Not yet"]},{"key":"a5_pays_self","label":"Does she pay herself a set amount?","type":"choice","required":true,"options":["Yes","Sometimes","No"]},{"key":"a5_separate","label":"Does she keep business money apart from home money?","type":"choice","required":true,"options":["Yes","Mostly","No"]},{"key":"a5_used_calc","label":"In the last month, did she use a calculation (cost, price or profit) to make a decision?","type":"choice","required":true,"options":["Yes","No"]},{"key":"a5_used_calc_what","label":"If yes, what was it?","type":"text","required":false},{"key":"a7_confidence","label":"How confident is she about running this business?","type":"scale","required":true,"min":1,"max":5,"minLabel":"Not at all","maxLabel":"Very confident"}],"b":[],"c":[{"key":"b4_support","label":"Support still needed","type":"checkbox","required":true,"options":["Stock or capital","Equipment","Mentoring","Market links","Record-keeping help","Health or family referral","Nothing"]},{"key":"c_action","label":"Action taken at this visit (one line)","type":"text","required":true},{"key":"c_status","label":"Result of this visit: the business is","type":"choice","required":true,"options":["Stable","Growing","Struggling","Closed"]},{"key":"c_next","label":"Next action: what needs to happen","type":"text","required":true},{"key":"c_next_who","label":"Next action: who will do it","type":"text","required":true},{"key":"c_next_date","label":"Next action: by when","type":"date","required":true},{"key":"c_impact","label":"What has changed for her income and her family?","type":"longtext","required":false,"help":"One or two sentences. This becomes the impact note in the 30-day report."}]},"90":{"name":"Day 90","title":"third visit","question":"","a":[{"key":"a1_operating","label":"Is the business operating?","type":"choice","required":true,"options":["Yes","Yes, but reduced","No"]},{"key":"a1_closed_why","label":"If reduced or not operating, the main reason","type":"checkbox","required":false,"options":["No capital","No stock","Sickness or family","Lost customers","Moved or relocated","Other"]},{"key":"a4_profit_band","label":"About how much profit did the business make last week?","type":"choice","required":true,"help":"Work it out together: sales minus the cost of the stock sold. A range is fine.","options":["No profit, or a loss","Under Ksh 1,000","Ksh 1,000 to 2,000","Ksh 2,000 to 4,000","Over Ksh 4,000"]},{"key":"a4_profit","label":"If she can say a figure, how much was it? (Ksh)","type":"number","required":false},{"key":"a4_compare","label":"Compared with before the training, her weekly income is","type":"choice","required":true,"options":["Increasing","About the same","Decreasing"]},{"key":"a4_compare_why","label":"Why did it change? (one line)","type":"text","required":false},{"key":"a3_stock_level","label":"Does she have enough stock or tools to keep trading?","type":"choice","required":true,"options":["Yes","Partly","No"]},{"key":"a3_missing","label":"If not, what is missing?","type":"text","required":false},{"key":"a3_stock_value","label":"Total business value today, stock plus cash (Ksh)","type":"number","required":true,"help":"Count the stock together with her and add the cash in the business."},{"key":"a7_challenges","label":"Challenges (tick all that apply)","type":"checkbox","required":true,"options":["Security","Health or family","Debt repayment","Not enough stock or capital","Few customers or low sales","Stock costs rising","Rent, licence or location","Transport","Competition","Other","None at the moment"]},{"key":"a7_growth","label":"Signs of growth (tick all that apply)","type":"checkbox","required":true,"options":["More customers","Higher sales","New product added","Stock increased","Saving regularly","Hired help","New location or market","None yet"]},{"key":"a7_risk","label":"Signs of risk (tick all that apply)","type":"checkbox","required":true,"help":"A personal safety concern alerts the founders straight away.","options":["Personal safety concern","Thinking of closing","Health or family problem","Debt rising","Stock running low","Sales falling","Business and household money mixed","None"]},{"key":"a5_records","label":"Does she write down sales and spending?","type":"choice","required":true,"options":["Daily","Sometimes","Not yet"]},{"key":"a5_pays_self","label":"Does she pay herself a set amount?","type":"choice","required":true,"options":["Yes","Sometimes","No"]},{"key":"a5_separate","label":"Does she keep business money apart from home money?","type":"choice","required":true,"options":["Yes","Mostly","No"]},{"key":"a5_used_calc","label":"In the last month, did she use a calculation (cost, price or profit) to make a decision?","type":"choice","required":true,"options":["Yes","No"]},{"key":"a5_used_calc_what","label":"If yes, what was it?","type":"text","required":false},{"key":"a7_confidence","label":"How confident is she about running this business?","type":"scale","required":true,"min":1,"max":5,"minLabel":"Not at all","maxLabel":"Very confident"}],"b":[],"c":[{"key":"b4_support","label":"Support still needed","type":"checkbox","required":true,"options":["Stock or capital","Equipment","Mentoring","Market links","Record-keeping help","Health or family referral","Nothing"]},{"key":"c_action","label":"Action taken at this visit (one line)","type":"text","required":true},{"key":"c_status","label":"Result of this visit: the business is","type":"choice","required":true,"options":["Stable","Growing","Struggling","Closed"]},{"key":"c_next","label":"Next action: what needs to happen","type":"text","required":true},{"key":"c_next_who","label":"Next action: who will do it","type":"text","required":true},{"key":"c_next_date","label":"Next action: by when","type":"date","required":true},{"key":"c_impact","label":"What has changed for her income and her family?","type":"longtext","required":false,"help":"One or two sentences. This becomes the impact note in the 30-day report."}]}}};
const INSTRUMENTS = {"baseline":{"title":"Elimu+ Day 0 Baseline","description":"Complete this once for every participant in the first two days, in person. It takes about five minutes. It records where they start, so the 30, 60 and 90 day visits can show real change. Name, phone, age and gender are already in the roster, so they are not asked again.","common":[],"branch":{"label":"Which group is this participant in?","options":[{"label":"Adult or caregiver","value":"adult","sections":[{"title":"The business","help":"Work out the money together. Ranges are fine.","fields":[{"key":"business_type","label":"What is the business?","type":"choice","required":true,"options":["Sells goods","Food or drink","Service, such as a salon or repairs","Farming or livestock","Making or crafts","Other"]},{"key":"business_stage","label":"How long has it been running?","type":"choice","required":true,"options":["Not started yet (an idea)","Under 6 months","6 to 12 months","1 to 3 years","Over 3 years"]},{"key":"a1_operating","label":"Is it operating now?","type":"choice","required":true,"options":["Yes","Yes, but reduced","No"]},{"key":"a4_profit_band","label":"About how much profit did the business make last week?","type":"choice","required":true,"help":"Work it out together: sales minus the cost of the stock sold. A range is fine.","options":["No profit, or a loss","Under Ksh 1,000","Ksh 1,000 to 2,000","Ksh 2,000 to 4,000","Over Ksh 4,000"]},{"key":"a4_profit","label":"If she can say a figure, how much was it? (Ksh)","type":"number","required":false},{"key":"a3_stock_level","label":"Does she have enough stock or tools to keep trading?","type":"choice","required":true,"options":["Yes","Partly","No"]},{"key":"a3_stock_value","label":"Total business value today, stock plus cash (Ksh)","type":"number","required":true,"help":"Count the stock together with her and add the cash in the business."},{"key":"a7_category","label":"What is her biggest challenge right now?","type":"choice","required":true,"options":["Security","Health or family","Debt repayment","Not enough stock or capital","Few customers or low sales","Stock costs rising","Rent, licence or location","Transport","Competition","Other"]},{"key":"a5_records","label":"Does she write down sales and spending?","type":"choice","required":true,"options":["Daily","Sometimes","Not yet"]},{"key":"a5_pays_self","label":"Does she pay herself a set amount?","type":"choice","required":true,"options":["Yes","Sometimes","No"]},{"key":"a5_separate","label":"Does she keep business money apart from home money?","type":"choice","required":true,"options":["Yes","Mostly","No"]},{"key":"a5_used_calc","label":"In the last month, did she use a calculation (cost, price or profit) to make a decision?","type":"choice","required":true,"options":["Yes","No"]},{"key":"a5_used_calc_what","label":"If yes, what was it?","type":"text","required":false},{"key":"confidence","label":"How confident is she about running this business?","type":"scale","required":true,"min":1,"max":5,"minLabel":"Not at all","maxLabel":"Very confident"}]}]},{"label":"Youth","value":"youth","sections":[{"title":"The young person","help":"Let them answer in their own words. Ranges are fine.","fields":[{"key":"education_status","label":"What is the young person's situation now?","type":"choice","required":true,"options":["In school","Out of school and not working","Doing casual work","Working in a job","Running a small business","Other"]},{"key":"hoped_path","label":"What do they want most from the next year?","type":"choice","required":true,"options":["A job","My own business","Both","To study","Not sure"]},{"key":"skills_have","label":"Which skills do they already have?","type":"checkbox","required":true,"options":["Selling","Handling money","A trade or craft","Computer or phone skills","Cooking","Farming","Talking to customers","None yet","Other"]},{"key":"a7_category","label":"What stops them most from moving forward?","type":"choice","required":true,"options":["No money","No experience","No contacts","No skills certificate","No idea where to start","Family or health","Other"]},{"key":"prior_work","label":"Work experience so far","type":"choice","required":true,"options":["None","Informal or casual","Formal job"]},{"key":"earning_range","label":"Money earned in the last 30 days","type":"choice","required":true,"options":["Nothing yet","Under Ksh 1,000","Ksh 1,000 to 3,000","Ksh 3,000 to 6,000","Over Ksh 6,000"]},{"key":"has_cv","label":"Do they have a CV?","type":"choice","required":true,"options":["Yes","No"]},{"key":"applied_recently","label":"Have they applied for work or started something in the last three months?","type":"choice","required":true,"options":["Yes","No"]},{"key":"can_explain","label":"Can they explain their skill to an employer or customer in a few sentences?","type":"choice","required":true,"options":["Yes","A bit","Not yet"]},{"key":"confidence","label":"How confident are they about their next step?","type":"scale","required":true,"min":1,"max":5,"minLabel":"Not at all","maxLabel":"Very confident"}]}]}]}},"learning":{"title":"Elimu+ Learning Check","description":"Six short questions and one confidence rating, taken on the first day and again on the last day. It is not a pass or fail test. It shows us what the training changes. Please answer alone and do not look at anyone else's paper.","common":[{"key":"stage","label":"When is this check being taken?","type":"choice","required":true,"options":["Start of the programme","End of the programme"],"help":"Everyone does the same short check on the first and the last day. It is not marked against them; it shows what the training changes."},{"key":"q1","label":"A woman sells 20 mandazi at KES 10 each. The flour, oil and charcoal for them cost KES 120. What is her profit?","type":"choice","required":true,"options":["KES 200","KES 120","KES 80","KES 20"],"correct":"KES 80"},{"key":"q2","label":"Which of these is a fixed cost for a small shop (one you pay whether you sell or not)?","type":"choice","required":true,"options":["Rent for the stall","Stock bought each week","Transport for each delivery","Packaging for each sale"],"correct":"Rent for the stall"},{"key":"q3","label":"What does 'break-even' mean?","type":"choice","required":true,"options":["Sales equal total costs, so there is no profit and no loss","The day with the highest sales","All the stock is sold","The business has borrowed money"],"correct":"Sales equal total costs, so there is no profit and no loss"},{"key":"q4","label":"A juice seller sells a bottle for KES 70. The fruit, bottle and ice for that one bottle cost KES 45. How much does each bottle contribute towards the rent and the profit?","type":"choice","required":true,"options":["KES 115","KES 70","KES 45","KES 25"],"correct":"KES 25"},{"key":"q5","label":"Before starting a business, the best first step is to:","type":"choice","required":true,"options":["Buy as much stock as possible","Copy the neighbour's business","Ask possible customers what problem they want solved","Borrow a large loan"],"correct":"Ask possible customers what problem they want solved"},{"key":"q6","label":"A woman buys a KES 6,000 blender once for her juice stall. If she closes the business, she cannot get that money back. This is called a:","type":"choice","required":true,"options":["Sunk cost","Variable cost","Sale","Saving"],"correct":"Sunk cost"},{"key":"confidence","label":"How confident are you that you could work out the profit of a small business? (1 = not at all, 5 = very)","type":"scale","required":true,"min":1,"max":5,"minLabel":"Not at all","maxLabel":"Very"}],"self":true},"exit":{"title":"Elimu+ End of Training Feedback","description":"Completed on the last training day. Six short questions. Your honest answers help us improve the programme.","common":[{"key":"rating","label":"Overall, how was the training?","type":"scale","required":true,"min":1,"max":5,"minLabel":"Poor","maxLabel":"Excellent"},{"key":"clarity","label":"How clear was the facilitator?","type":"scale","required":true,"min":1,"max":5,"minLabel":"Not clear","maxLabel":"Very clear"},{"key":"most_useful","label":"Which topic helped you most?","type":"choice","required":true,"options":["Session 1: Introduction to employability and entrepreneurship","Session 2: Designing your product or personal value proposition","Session 3: Defining your target audience","Session 4: Designing operations","Session 5: Pricing, compensation and workplace culture","Session 6: Hiring, teamwork and relationships"]},{"key":"change_suggestion","label":"What is one thing we should improve?","type":"text","required":true},{"key":"recommend","label":"Would you recommend this training to a friend?","type":"choice","required":true,"options":["Yes","Not sure","No"]},{"key":"confidence","label":"How confident do you feel about starting or improving your business or job search?","type":"scale","required":true,"min":1,"max":5,"minLabel":"Not at all","maxLabel":"Very confident"},{"key":"concern","label":"Did anything happen during the training that was unsafe or unfair?","type":"choice","required":true,"options":["No","Yes"]},{"key":"concern_note","label":"If yes, tell us what you are comfortable sharing","type":"longtext","required":false}],"self":true},"youth_followup":{"title":"Elimu+ Youth Follow-up Visit: Day 30, 60 and 90","description":"Complete this in person with the young person. About ten minutes. Ask about safety and welfare first, and let them say it in their own words.","common":[],"branch":{"label":"Which follow-up visit is this?","options":[{"label":"Day 30","value":"30","sections":[{"title":"Day 30 follow-up. The visit","help":"In person. Ask about safety and welfare first, and let the young person say it in their own words.","fields":[{"key":"visited_on","label":"Date of visit","type":"date","required":true},{"key":"status","label":"What is the young person doing now?","type":"choice","required":true,"options":["Employed","Self-employed","Casual work","Studying","Looking for work","Other"]},{"key":"earning_range","label":"Money earned in the last 30 days","type":"choice","required":true,"options":["Nothing yet","Under Ksh 1,000","Ksh 1,000 to 3,000","Ksh 3,000 to 6,000","Over Ksh 6,000"]},{"key":"earning_figure","label":"If they can say a figure, how much was it? (Ksh)","type":"number","required":false},{"key":"income_vs","label":"Compared with before the training, they earn","type":"choice","required":true,"options":["More","The same","Less"]},{"key":"income_why","label":"Why did it change? (one line)","type":"text","required":false},{"key":"since_training","label":"Since the training (tick all that apply)","type":"checkbox","required":true,"options":["Applied for work or an opportunity","Had an interview","Started a business or side income","Earning from a skill","Updated or written a CV","None yet"]}]},{"title":"Day 30 follow-up. What the officer sees","fields":[{"key":"challenges","label":"Challenges (tick all that apply)","type":"checkbox","required":true,"options":["Family or transport","No money","No work found","No contacts","Health","Lack of confidence","Other","None at the moment"]},{"key":"progress","label":"Signs of progress (tick all that apply)","type":"checkbox","required":true,"options":["New income","New skill used","New contacts","More confident","Saving","None yet"]},{"key":"risks","label":"Risk signs (tick all that apply)","type":"checkbox","required":true,"help":"A safety or welfare concern alerts the founders straight away.","options":["Personal safety or welfare concern","Giving up","Pressure from family","Losing contact","None"]},{"key":"plan_ready","label":"Do they have a written plan or canvas they are using?","type":"choice","required":true,"options":["Yes","Started","No"]},{"key":"cv_status","label":"Do they have a CV ready to send?","type":"choice","required":true,"options":["Yes","In progress","No"]},{"key":"confidence","label":"How confident are they about their next step?","type":"scale","required":true,"min":1,"max":5,"minLabel":"Not at all","maxLabel":"Very confident"}]},{"title":"Day 30 follow-up. Support and result","fields":[{"key":"support_needed","label":"Support needed","type":"checkbox","required":true,"options":["A job lead","Small capital","A skill course","Mentoring","CV or application help","Nothing"]},{"key":"action_taken","label":"Action taken at this visit (one line)","type":"text","required":true},{"key":"officer_view","label":"Result of this visit","type":"choice","required":true,"options":["On track","Stuck","Lost contact"]},{"key":"next_step","label":"Next action: what needs to happen","type":"text","required":true},{"key":"next_who","label":"Next action: who will do it","type":"text","required":true},{"key":"next_date","label":"Next action: by when","type":"date","required":true},{"key":"impact_note","label":"What has changed for the young person and their family?","type":"longtext","required":false}]}]},{"label":"Day 60","value":"60","sections":[{"title":"Day 60 follow-up. The visit","help":"In person. Ask about safety and welfare first, and let the young person say it in their own words.","fields":[{"key":"visited_on","label":"Date of visit","type":"date","required":true},{"key":"status","label":"What is the young person doing now?","type":"choice","required":true,"options":["Employed","Self-employed","Casual work","Studying","Looking for work","Other"]},{"key":"earning_range","label":"Money earned in the last 30 days","type":"choice","required":true,"options":["Nothing yet","Under Ksh 1,000","Ksh 1,000 to 3,000","Ksh 3,000 to 6,000","Over Ksh 6,000"]},{"key":"earning_figure","label":"If they can say a figure, how much was it? (Ksh)","type":"number","required":false},{"key":"income_vs","label":"Compared with before the training, they earn","type":"choice","required":true,"options":["More","The same","Less"]},{"key":"income_why","label":"Why did it change? (one line)","type":"text","required":false},{"key":"since_training","label":"Since the training (tick all that apply)","type":"checkbox","required":true,"options":["Applied for work or an opportunity","Had an interview","Started a business or side income","Earning from a skill","Updated or written a CV","None yet"]}]},{"title":"Day 60 follow-up. What the officer sees","fields":[{"key":"challenges","label":"Challenges (tick all that apply)","type":"checkbox","required":true,"options":["Family or transport","No money","No work found","No contacts","Health","Lack of confidence","Other","None at the moment"]},{"key":"progress","label":"Signs of progress (tick all that apply)","type":"checkbox","required":true,"options":["New income","New skill used","New contacts","More confident","Saving","None yet"]},{"key":"risks","label":"Risk signs (tick all that apply)","type":"checkbox","required":true,"help":"A safety or welfare concern alerts the founders straight away.","options":["Personal safety or welfare concern","Giving up","Pressure from family","Losing contact","None"]},{"key":"plan_ready","label":"Do they have a written plan or canvas they are using?","type":"choice","required":true,"options":["Yes","Started","No"]},{"key":"cv_status","label":"Do they have a CV ready to send?","type":"choice","required":true,"options":["Yes","In progress","No"]},{"key":"confidence","label":"How confident are they about their next step?","type":"scale","required":true,"min":1,"max":5,"minLabel":"Not at all","maxLabel":"Very confident"}]},{"title":"Day 60 follow-up. Support and result","fields":[{"key":"support_needed","label":"Support needed","type":"checkbox","required":true,"options":["A job lead","Small capital","A skill course","Mentoring","CV or application help","Nothing"]},{"key":"action_taken","label":"Action taken at this visit (one line)","type":"text","required":true},{"key":"officer_view","label":"Result of this visit","type":"choice","required":true,"options":["On track","Stuck","Lost contact"]},{"key":"next_step","label":"Next action: what needs to happen","type":"text","required":true},{"key":"next_who","label":"Next action: who will do it","type":"text","required":true},{"key":"next_date","label":"Next action: by when","type":"date","required":true},{"key":"impact_note","label":"What has changed for the young person and their family?","type":"longtext","required":false}]}]},{"label":"Day 90","value":"90","sections":[{"title":"Day 90 follow-up. The visit","help":"In person. Ask about safety and welfare first, and let the young person say it in their own words.","fields":[{"key":"visited_on","label":"Date of visit","type":"date","required":true},{"key":"status","label":"What is the young person doing now?","type":"choice","required":true,"options":["Employed","Self-employed","Casual work","Studying","Looking for work","Other"]},{"key":"earning_range","label":"Money earned in the last 30 days","type":"choice","required":true,"options":["Nothing yet","Under Ksh 1,000","Ksh 1,000 to 3,000","Ksh 3,000 to 6,000","Over Ksh 6,000"]},{"key":"earning_figure","label":"If they can say a figure, how much was it? (Ksh)","type":"number","required":false},{"key":"income_vs","label":"Compared with before the training, they earn","type":"choice","required":true,"options":["More","The same","Less"]},{"key":"income_why","label":"Why did it change? (one line)","type":"text","required":false},{"key":"since_training","label":"Since the training (tick all that apply)","type":"checkbox","required":true,"options":["Applied for work or an opportunity","Had an interview","Started a business or side income","Earning from a skill","Updated or written a CV","None yet"]}]},{"title":"Day 90 follow-up. What the officer sees","fields":[{"key":"challenges","label":"Challenges (tick all that apply)","type":"checkbox","required":true,"options":["Family or transport","No money","No work found","No contacts","Health","Lack of confidence","Other","None at the moment"]},{"key":"progress","label":"Signs of progress (tick all that apply)","type":"checkbox","required":true,"options":["New income","New skill used","New contacts","More confident","Saving","None yet"]},{"key":"risks","label":"Risk signs (tick all that apply)","type":"checkbox","required":true,"help":"A safety or welfare concern alerts the founders straight away.","options":["Personal safety or welfare concern","Giving up","Pressure from family","Losing contact","None"]},{"key":"plan_ready","label":"Do they have a written plan or canvas they are using?","type":"choice","required":true,"options":["Yes","Started","No"]},{"key":"cv_status","label":"Do they have a CV ready to send?","type":"choice","required":true,"options":["Yes","In progress","No"]},{"key":"confidence","label":"How confident are they about their next step?","type":"scale","required":true,"min":1,"max":5,"minLabel":"Not at all","maxLabel":"Very confident"}]},{"title":"Day 90 follow-up. Support and result","fields":[{"key":"support_needed","label":"Support needed","type":"checkbox","required":true,"options":["A job lead","Small capital","A skill course","Mentoring","CV or application help","Nothing"]},{"key":"action_taken","label":"Action taken at this visit (one line)","type":"text","required":true},{"key":"officer_view","label":"Result of this visit","type":"choice","required":true,"options":["On track","Stuck","Lost contact"]},{"key":"next_step","label":"Next action: what needs to happen","type":"text","required":true},{"key":"next_who","label":"Next action: who will do it","type":"text","required":true},{"key":"next_date","label":"Next action: by when","type":"date","required":true},{"key":"impact_note","label":"What has changed for the young person and their family?","type":"longtext","required":false}]}]}]}}};

const ROUTE_Q = 'Send this report to';
const NAME_Q = 'Your full name';
const PHONE_Q = 'Your phone number (the one you sign in to Elimu+ with)';
const COHORT_Q = 'Which cohort is this about';
const PHASE_Q = 'This report is about';
const P_NAME_Q = 'Participant name';
const P_PHONE_Q = 'Participant phone number';
const STAGE_Q = 'Which follow-up visit is this?';

/* ---------- one header for every Elimu+ form ---------- */
const HEADER_LINES = 'ELIMU+  |  Start. Start small. Start to finish.\nPractical employability and entrepreneurship training  ·  Likoni, Mombasa  ·  elimuplus.com';
const HEADER_IMAGE_URL = PORTAL_URL + '/api/forms/header';
function withHeader_(text) { return HEADER_LINES + '\n\n' + String(text || ''); }
/** Puts the Elimu+ banner at the top of a form (the Forms service cannot set the theme banner, so it is added as the first item). Safe to run twice. */
function addHeaderImage_(form) {
  try {
    const first = form.getItems()[0];
    if (first && first.getType() === FormApp.ItemType.IMAGE) return;
    const blob = UrlFetchApp.fetch(HEADER_IMAGE_URL).getBlob();
    const item = form.addImageItem().setImage(blob).setAlignment(FormApp.Alignment.CENTER).setWidth(640);
    try { item.setAltText('Elimu+  Start. Start small. Start to finish.'); } catch (x) {}
    if (form.getItems().length > 1) form.moveItem(form.getItems().length - 1, 0);
  } catch (err) { Logger.log('Header image skipped: ' + err); }
}
function applyHeader_(form, description) {
  form.setDescription(withHeader_(description));
  addHeaderImage_(form);
}
/** Run once: puts the same header on every form that already exists (registration, learning check, attendance, observer forms and the rest). */
function applyHeaderToAllForms() {
  const ids = J_('FORM_IDS', {});
  var n = 0;
  Object.keys(ids).forEach(function (key) {
    try {
      const form = FormApp.openById(ids[key]);
      if (/^OLD /.test(form.getTitle())) return;
      const d = form.getDescription() || '';
      if (d.indexOf('ELIMU+  |') !== 0) form.setDescription(withHeader_(d));
      addHeaderImage_(form);
      n++;
    } catch (err) { Logger.log('Could not update ' + key + ': ' + err); }
  });
  Logger.log('Header applied to ' + n + ' forms.');
}

function createAllForms() {
  const props = PropertiesService.getScriptProperties();
  const ids = JSON.parse(props.getProperty('FORM_IDS') || '{}');
  const lists = fetchLists_();
  const links = [];
  Object.keys(TEMPLATES).forEach(function (level) {
    if (ids[level]) { links.push(TEMPLATES[level].short + ': already created ' + FormApp.openById(ids[level]).getPublishedUrl()); return; }
    const t = TEMPLATES[level];
    const form = FormApp.create('Elimu+ Day Report: ' + t.name);
    applyHeader_(form, t.depth + '\n\nGoes to: ' + t.goes_to);
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
  try { publishFormLinks(); } catch (err) { Logger.log('Could not report form links: ' + err); }
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
  if (INSTRUMENTS[level]) return onInstrumentSubmit_(e, level);
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
  applyHeader_(form, 'Complete this in person, at the business. About ten minutes. Work out the money together and count the stock with her. The same questions are asked at Day 30, 60 and 90 so progress can be compared.\n\nTell her that her answers will not reduce her support and may increase it.');
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
    [['A', 'The business', st.a.slice(0, 9), 'Work out the money together. A range is fine for profit; stock and business value are counted with her.'],
     ['A2', 'What the officer sees, and the Elimu+ ticks', st.a.slice(9), 'Tick everything that applies.'],
     ['B', 'Support from the programme', st.b, st.question],
     ['C', 'Support and result', st.c, 'Completed by the officer after the visit.']].filter(function (sec) { return sec[2].length; }).forEach(function (sec) {
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
    const urgent = String(label('a7_risk') || '').indexOf('Personal safety concern') >= 0;
    MailApp.sendEmail({
      to: leader.email,
      subject: (urgent ? 'URGENT: ' : '') + 'Elimu+ Day ' + stage + ' follow-up: ' + pname + (label('c_status') ? ' (' + label('c_status') + ')' : ''),
      body: [officer + ' (' + ophone + ') visited ' + pname + ' for the Day ' + stage + ' follow-up.', 'Cohort: ' + cohort,
        'Business is: ' + (label('c_status') || 'not stated'), 'Challenges: ' + (label('a7_challenges') || 'not stated'), 'Risk signs: ' + (label('a7_risk') || 'not stated'), 'Support needed: ' + (label('b4_support') || 'not stated'), 'Next action: ' + (label('c_next') || 'not stated') + (label('c_next_who') ? ' (' + label('c_next_who') + ')' : ''), '',
        'Everything she and the officer answered is in the portal under the cohort: ' + PORTAL_URL + '/portal/cohorts'].join('\n')
    });
  }
}

/* ---------- Day 0 baseline, learning check, exit feedback and youth follow-up ---------- */
/** Creates one form from the definition in INSTRUMENTS: who it is about, the questions, and (when there is a branch) the pages each choice leads to. */
function createInstrumentForm_(key) {
  const props = PropertiesService.getScriptProperties();
  const ids = JSON.parse(props.getProperty('FORM_IDS') || '{}');
  const inst = INSTRUMENTS[key];
  if (ids[key]) { Logger.log(inst.title + ' already created: ' + FormApp.openById(ids[key]).getPublishedUrl()); return ''; }
  const lists = fetchLists_();
  const form = FormApp.create(inst.title);
  applyHeader_(form, inst.description);
  form.setCollectEmail(false).setProgressBar(true).setAllowResponseEdits(false).setShowLinkToRespondAgain(true);
  form.setConfirmationMessage('Thank you. Your answers have been recorded.');
  if (!inst.self) {
    form.addTextItem().setTitle(NAME_Q).setHelpText('The officer or facilitator filling this in.').setRequired(true);
    form.addTextItem().setTitle(PHONE_Q).setRequired(true);
  }
  form.addListItem().setTitle(COHORT_Q).setChoiceValues(cohortLabels_(lists)).setRequired(true);
  form.addTextItem().setTitle(P_NAME_Q).setHelpText(inst.self ? 'Your full name.' : 'Full name, as registered.').setRequired(true);
  form.addTextItem().setTitle(P_PHONE_Q).setHelpText('The number registered in Elimu+, so this links to the right record.').setRequired(true);
  inst.common.forEach(function (f) { addQuestion_(form, f); });
  if (inst.branch) {
    const choice = form.addMultipleChoiceItem().setTitle(inst.branch.label).setRequired(true);
    const firstPage = {};
    inst.branch.options.forEach(function (opt) {
      var last;
      opt.sections.forEach(function (sec, i) {
        const pb = form.addPageBreakItem().setTitle(sec.title);
        if (sec.help) pb.setHelpText(sec.help);
        if (i === 0) firstPage[opt.value] = pb;
        last = pb;
        sec.fields.forEach(function (f) { addQuestion_(form, f); });
      });
      last.setGoToPage(FormApp.PageNavigationType.SUBMIT);
    });
    choice.setChoices(inst.branch.options.map(function (opt) { return choice.createChoice(opt.label, firstPage[opt.value]); }));
  }
  const sheet = SpreadsheetApp.create(inst.title + ' (responses)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
  ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
  ids[key] = form.getId();
  props.setProperty('FORM_IDS', JSON.stringify(ids));
  installTimers_();
  const msg = inst.title.toUpperCase() + ' READY\n' + form.getPublishedUrl() + '\n(edit: ' + form.getEditUrl() + ')\nresponses: ' + sheet.getUrl();
  Logger.log(msg);
  return msg;
}

/** Run once: creates the Day 0 baseline, learning check, exit feedback and youth follow-up forms and emails the links. */
function createAllInstruments() {
  const made = Object.keys(INSTRUMENTS).map(createInstrumentForm_).filter(function (m) { return m; });
  if (made.length) MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Elimu+ baseline, learning, exit and youth forms are ready', made.join('\n\n'));
}
function createBaselineForm() { createInstrumentForm_('baseline'); }
function createLearningForm() { createInstrumentForm_('learning'); }
function createExitForm() { createInstrumentForm_('exit'); }
function createYouthFollowUpForm() { createInstrumentForm_('youth_followup'); }

/** The adult follow-up gained questions (sold in 14 days, break-even, records and more). Run this once to replace the old form with the new one; old responses stay in the portal. */
function recreateFollowUpForm() {
  const props = PropertiesService.getScriptProperties();
  const ids = JSON.parse(props.getProperty('FORM_IDS') || '{}');
  if (ids.followup) {
    const oldId = ids.followup;
    const old = FormApp.openById(oldId);
    old.setTitle('OLD ' + old.getTitle()).setAcceptingResponses(false);
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getTriggerSourceId && t.getTriggerSourceId() === oldId) ScriptApp.deleteTrigger(t); });
    delete ids.followup;
    props.setProperty('FORM_IDS', JSON.stringify(ids));
  }
  createFollowUpForm();
}

/** The learning-check questions were changed. Run this once to close the old learning form and build the new one; past answers stay in the portal. */
function recreateLearningForm() {
  const props = PropertiesService.getScriptProperties();
  const ids = JSON.parse(props.getProperty('FORM_IDS') || '{}');
  if (ids.learning) {
    const oldId = ids.learning;
    const old = FormApp.openById(oldId);
    old.setTitle('OLD ' + old.getTitle()).setAcceptingResponses(false);
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getTriggerSourceId && t.getTriggerSourceId() === oldId) ScriptApp.deleteTrigger(t); });
    delete ids.learning;
    props.setProperty('FORM_IDS', JSON.stringify(ids));
  }
  createInstrumentForm_('learning');
}

/** Closes one form: it is renamed OLD, stops taking responses, and its submit trigger is removed. Its past answers stay in the portal. */
function closeOldForm_(ids, key) {
  if (!ids[key]) return false;
  const oldId = ids[key];
  try {
    const old = FormApp.openById(oldId);
    if (!/^OLD /.test(old.getTitle())) old.setTitle('OLD ' + old.getTitle());
    old.setAcceptingResponses(false);
  } catch (err) { Logger.log('Could not close ' + key + ': ' + err); }
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getTriggerSourceId && t.getTriggerSourceId() === oldId) ScriptApp.deleteTrigger(t); });
  delete ids[key];
  return true;
}

/**
 * THE SIMPLIFIED FORMS. Run this once. It closes the old facilitator day reports, adult follow-up, Day 0 baseline, exit feedback and youth follow-up
 * (renamed OLD, past answers stay in the portal), builds the new short versions with the Elimu+ header, and puts the same header on every other form.
 * The learning check, registration, attendance and observer forms keep their questions.
 */
function createSimplifiedForms() {
  const props = PropertiesService.getScriptProperties();
  const ids = JSON.parse(props.getProperty('FORM_IDS') || '{}');
  ['0', '1', '2', '3', 'followup', 'baseline', 'exit', 'youth_followup'].forEach(function (k) { closeOldForm_(ids, k); });
  props.setProperty('FORM_IDS', JSON.stringify(ids));
  createAllForms();
  createFollowUpForm();
  createAllInstruments();
  applyHeaderToAllForms();
  try { publishFormLinks(); } catch (err) { Logger.log('Could not report form links: ' + err); }
  Logger.log('Simplified forms are ready. Open the portal Forms page for the links.');
}

/** One submitted baseline, learning check, exit form or youth visit goes to the portal as: the instrument, the chosen branch, and the answers by question text. */
function onInstrumentSubmit_(e, key) {
  const inst = INSTRUMENTS[key];
  const answers = {};
  var officer = '', ophone = '', cohort = '', pname = '', pphone = '', branch = '';
  e.response.getItemResponses().forEach(function (ir) {
    const title = ir.getItem().getTitle();
    const v = Array.isArray(ir.getResponse()) ? ir.getResponse().join(', ') : String(ir.getResponse());
    if (title === NAME_Q) officer = v;
    else if (title === PHONE_Q) ophone = v;
    else if (title === COHORT_Q) cohort = v;
    else if (title === P_NAME_Q) pname = v;
    else if (title === P_PHONE_Q) pphone = v;
    else if (inst.branch && title === inst.branch.label) branch = v;
    else answers[title] = v;
  });
  postRoster_({ kind: 'instrument', instrument: key, branch: branch, response_id: e.response.getId(), officer_name: officer, officer_phone: ophone,
    participant_name: pname, participant_phone: pphone, cohort: cohort, answers: answers }, inst.title + ' for ' + pname);
}

/* ---------- cohort roster, attendance and two-observer notes ---------- */
const REG_BUSINESS = ['I already run a business', 'I want to start one', 'Not sure yet'];
const REG_CONSENT = 'The participant agrees that Elimu+ and the partner organisation may hold these details to run the programme and follow up afterwards';
const NOT_LISTED = 'Not listed here (type its name below)';
const TYPED_COHORT_Q = 'If the cohort is not in the list above, type its name';
const EMAIL_Q = 'Participant email (only if they have one)';
const NEWS_Q = 'Newsletter';
const NEWS_YES = 'Yes, send the participant the Elimu+ newsletter by email (needs an email above; they can unsubscribe any time)';
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
  applyHeader_(form, 'Fill this once for every participant when a cohort starts. It records who is in the room, how to reach them, and the business they run or want to start. After you submit, choose "Submit another response" for the next person.');
  form.setCollectEmail(false).setProgressBar(false).setAllowResponseEdits(false).setShowLinkToRespondAgain(true);
  form.setConfirmationMessage('Registered. Choose "Submit another response" to add the next participant.');
  form.addListItem().setTitle(COHORT_Q).setChoiceValues(cohortLabels_(lists).slice(0, -1).concat([NOT_LISTED])).setRequired(true);
  form.addTextItem().setTitle(TYPED_COHORT_Q).setHelpText('Leave blank when the cohort is in the list.');
  form.addTextItem().setTitle(NAME_Q).setHelpText('The person entering the registrations.').setRequired(true);
  form.addTextItem().setTitle(PHONE_Q).setRequired(true);
  form.addTextItem().setTitle(P_NAME_Q).setHelpText('Full name as they want it on their certificate.').setRequired(true);
  form.addTextItem().setTitle(P_PHONE_Q).setHelpText('A number that reaches them directly. It becomes their record and follow-up contact.').setRequired(true);
  form.addTextItem().setTitle(EMAIL_Q).setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
  form.addCheckboxItem().setTitle(NEWS_Q).setChoiceValues([NEWS_YES]);
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
    participant_name: a[P_NAME_Q], participant_phone: a[P_PHONE_Q], email: a[EMAIL_Q] || '', newsletter: a[NEWS_Q] ? 'yes' : '', business_status: a[BUS_Q] || '', business_note: a[NOTE_Q] || '' },
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
  applyHeader_(form, 'Tick everyone who is in the room today. Submit once per session. If someone came who is not on the list, say so on the next page and they will be added to the cohort.');
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
  applyHeader_(form, 'Fill this on your own, straight after the session and before you compare notes with the other observer. Two observers fill the same form separately so that the view is not shaped by one person. Rate what you saw, not what you hoped to see. Leave a participant blank if you did not see enough.');
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
    FormApp.openById(ids['att_' + key]).setDescription(withHeader_('Tick everyone who is in the room today. Submit once per session. If someone came who is not on the list, say so on the next page and they will be added to the cohort.\n\nLast register: Day ' + day + ', ' + present.length + ' of ' + total + ' present.'));
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
  const path = payload.kind === 'links' ? '/api/forms/links' : payload.kind === 'followup' ? '/api/forms/followup' : payload.kind === 'instrument' ? '/api/forms/instrument' : (payload.kind === 'register' || payload.kind === 'attendance') ? '/api/forms/roster' : '/api/forms/report';
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
    try { if (post_(JSON.parse(all[k]))) props.deleteProperty(k); } catch (err) { Logger.log('Skipped an unreadable queued report ' + k + ': ' + err); }
  });
  try { publishFormLinks(); } catch (err) { Logger.log('Could not report form links: ' + err); }
}

/** Tells the portal where every form and its response sheet live and how many responses Google holds, so the portal's Forms and responses page is always current. Runs every hour. */
function linkTitle_(key) {
  const L = { followup: 'Adult follow-up (Day 30, 60, 90)', youth_followup: 'Youth follow-up (Day 30, 60, 90)', baseline: 'Day 0 baseline', learning: 'Learning check', exit: 'Exit feedback', register: 'Participant registration' };
  if (L[key]) return L[key];
  if (key.indexOf('att_') === 0) return 'Attendance register (' + key.slice(4) + ')';
  if (key.indexOf('obs_') === 0) return 'Observer form (' + key.slice(4) + ')';
  if (TEMPLATES[key]) return TEMPLATES[key].name + ' day report';
  return key;
}

function publishFormLinks() {
  const ids = J_('FORM_IDS', {});
  const forms = [];
  Object.keys(ids).forEach(function (key) {
    try {
      const form = FormApp.openById(ids[key]);
      const rs = form.getResponses();
      var sheet = '';
      try { sheet = 'https://docs.google.com/spreadsheets/d/' + form.getDestinationId() + '/edit'; } catch (x) { sheet = ''; }
      const kind = key === 'followup' || key === 'youth_followup' ? 'followup' : (key === 'baseline' || key === 'learning' || key === 'exit') ? 'start_end'
        : (key === 'register' || key.indexOf('att_') === 0 || key.indexOf('obs_') === 0) ? 'cohort' : /^[0-9]$/.test(key) ? 'report' : 'other';
      forms.push({ key: key, title: form.getTitle() || linkTitle_(key), kind: kind, fill_url: form.getPublishedUrl(), edit_url: form.getEditUrl(), sheet_url: sheet,
        google_responses: rs.length, last_response_at: rs.length ? rs[rs.length - 1].getTimestamp().toISOString() : null });
    } catch (err) { Logger.log('Could not read form ' + key + ': ' + err); }
  });
  if (forms.length) postJson_({ kind: 'links', forms: forms });
  return forms.length;
}

