/**
 * What a shared portal link looks like in WhatsApp, Slack, Facebook, LinkedIn and similar apps.
 * Link previewers cannot sign in, so everything here is generic: the name of the page and what it is for.
 * No names, numbers or records ever appear in a preview. People still have to sign in to see the page itself.
 * This file has no imports so the edge middleware can use it.
 */
export type Share = { title: string; description: string; tag: string };

const BRAND = 'Elimu+ Portal';

// Order matters: the first pattern that matches wins, so put the specific paths before the general ones.
const ROUTES: Array<[RegExp, Share]> = [
  [/^\/portal\/login$/, { tag: 'Sign in', title: 'Sign in', description: 'Sign in to the Elimu+ Portal with the phone number you were invited with.' }],
  [/^\/portal\/set-pin$/, { tag: 'Account', title: 'Choose your PIN', description: 'Choose a PIN for your Elimu+ Portal account.' }],
  [/^\/portal$/, { tag: 'Home', title: 'Home', description: 'Your starting point in the Elimu+ Portal: what needs doing, what is new and where to go next.' }],

  [/^\/portal\/command/, { tag: 'Founders', title: 'Command view', description: 'The whole Elimu+ programme on one page for the founders.' }],
  [/^\/portal\/needs/, { tag: 'Founders', title: 'Needs my decision', description: 'Everything waiting for a founder decision, gathered from every part of the portal.' }],
  [/^\/portal\/alerts/, { tag: 'Founders', title: 'Alerts', description: 'Welfare, urgent and system alerts for the founders.' }],
  [/^\/portal\/approvals/, { tag: 'Founders', title: 'Approvals', description: 'Founder approvals for payments, stories, reports and requests.' }],

  [/^\/portal\/notices/, { tag: 'My work', title: 'My notices', description: 'Trainings you have been put on, and changes to your role on them.' }],
  [/^\/portal\/calendar/, { tag: 'Programme', title: 'Training calendar', description: 'When each Elimu+ training runs, with which trainers, and where trainings overlap.' }],
  [/^\/portal\/cohorts\/[^/]+\/certificates/, { tag: 'Programme', title: 'Cohort certificates', description: 'Issue and check participant certificates for a cohort.' }],
  [/^\/portal\/cohorts\/[^/]+\/outcomes/, { tag: 'Programme', title: 'Cohort outcomes', description: 'Follow-up results for a cohort at 30, 60 and 90 days.' }],
  [/^\/portal\/cohorts\/[^/]+\/participants/, { tag: 'Programme', title: 'Participant record', description: 'A participant’s attendance, canvas and follow-up in one place.' }],
  [/^\/portal\/cohorts\/[^/]+/, { tag: 'Programme', title: 'Cohort', description: 'A cohort: its days, participants, attendance, support given and results.' }],
  [/^\/portal\/cohorts/, { tag: 'Programme', title: 'Cohorts', description: 'The Elimu+ cohorts: who is training, where and when.' }],
  [/^\/portal\/attendance/, { tag: 'Programme', title: 'Daily attendance', description: 'Confirm who came on each day of a programme.' }],
  [/^\/portal\/consent/, { tag: 'Programme', title: 'Consent forms', description: 'Print adult and parent or guardian consent forms, including photo and video permission.' }],
  [/^\/portal\/qa/, { tag: 'Programme', title: 'Quality and reports', description: 'Quality visits, reports and the supervision register.' }],
  [/^\/portal\/impact/, { tag: 'Programme', title: 'Impact', description: 'What Elimu+ cohorts have achieved: businesses started, still trading and growing.' }],
  [/^\/portal\/forms/, { tag: 'Programme', title: 'Forms and responses', description: 'Form links, response counts and sheets for each cohort.' }],
  [/^\/portal\/stories\/new/, { tag: 'Programme', title: 'Add a participant story', description: 'Record a participant’s story with their permission.' }],
  [/^\/portal\/stories/, { tag: 'Programme', title: 'Participant stories', description: 'Collect and read participant stories. Founders approve what is used publicly.' }],
  [/^\/portal\/data/, { tag: 'Programme', title: 'Data completeness', description: 'What we hold for every cohort and what is still missing.' }],
  [/^\/portal\/seminars/, { tag: 'Programme', title: 'Monthly seminars', description: 'Plan monthly seminars, share the sign-in link and see who attended.' }],
  [/^\/portal\/news/, { tag: 'Programme', title: 'News and signals', description: 'News and signals that matter to Elimu+ and the people we serve.' }],
  [/^\/portal\/pathway/, { tag: 'Programme', title: 'Pathway', description: 'The Elimu+ pathway from first session to a running business or a job.' }],
  [/^\/portal\/invite/, { tag: 'Programme', title: 'Invite someone', description: 'Invite a participant, trainer or partner to the Elimu+ Portal.' }],

  [/^\/portal\/crm/, { tag: 'Partners', title: 'Partners: call, visit, check', description: 'Partner contact records: who to call, visit or check on next.' }],
  [/^\/portal\/people/, { tag: 'Partners', title: 'Partner organisations and welfare', description: 'Partner organisations and the welfare of the people we work with.' }],
  [/^\/portal\/preview/, { tag: 'Partners', title: 'Preview partner view', description: 'See exactly what a partner organisation sees in the portal.' }],
  [/^\/portal\/sales/, { tag: 'Partners', title: 'Sales pipeline', description: 'Partner conversations from first contact to a booked cohort.' }],
  [/^\/portal\/directory/, { tag: 'Partners', title: 'Biashara za Elimu+ directory', description: 'The directory of businesses started by Elimu+ graduates.' }],
  [/^\/portal\/partner\/billing/, { tag: 'Partner', title: 'Invoices and payments', description: 'Invoices and payments for your organisation’s Elimu+ cohorts.' }],
  [/^\/portal\/partner\/library/, { tag: 'Partner', title: 'Partner library', description: 'Guides and documents for partner organisations.' }],
  [/^\/portal\/partner\/reports/, { tag: 'Partner', title: 'Reports', description: 'Reports on your organisation’s Elimu+ cohorts and what participants achieved.' }],
  [/^\/portal\/partner\/request/, { tag: 'Partner', title: 'Request training', description: 'Ask Elimu+ to train a group at your organisation.' }],
  [/^\/portal\/partner\/roster/, { tag: 'Partner', title: 'Participant roster', description: 'Add and manage the participants your organisation sends to training.' }],
  [/^\/portal\/partner\/support/, { tag: 'Partner', title: 'Support given', description: 'Record the support your organisation gives participants to start or grow a business.' }],
  [/^\/portal\/partner\/timeline/, { tag: 'Partner', title: 'Timeline', description: 'Your organisation’s cohort timeline: training, follow-up and milestones.' }],
  [/^\/portal\/partner/, { tag: 'Partner', title: 'Partner home', description: 'Your organisation’s home in the Elimu+ Portal: cohorts, roster, reports and invoices.' }],

  [/^\/portal\/newsletter/, { tag: 'Marketing', title: 'Weekly letters', description: 'Write, preview and send the weekly Elimu+ letter.' }],
  [/^\/portal\/social\/calendar/, { tag: 'Marketing', title: 'Social calendar and posting', description: 'The social media calendar: what is planned, drafted and posted.' }],
  [/^\/portal\/social\/insights/, { tag: 'Marketing', title: 'Social insights', description: 'What is working on Elimu+ social channels.' }],
  [/^\/portal\/social/, { tag: 'Marketing', title: 'Social ideas', description: 'Ideas and drafts for Elimu+ social media posts.' }],

  [/^\/portal\/deals/, { tag: 'Money', title: 'Proposals and receipts', description: 'Proposals, invoices and receipts for partner organisations.' }],
  [/^\/portal\/payouts/, { tag: 'Money', title: 'Trainer payments', description: 'Pay trainers for the days they delivered.' }],
  [/^\/portal\/earnings/, { tag: 'Money', title: 'My earnings', description: 'What you have earned from the days you delivered.' }],
  [/^\/portal\/my-pay/, { tag: 'Money', title: 'My pay', description: 'Your payslips and pay history.' }],
  [/^\/portal\/expenses/, { tag: 'Money', title: 'Expenses ledger', description: 'Expense requests, approvals and the ledger.' }],
  [/^\/portal\/finance/, { tag: 'Money', title: 'Finance', description: 'Money in and out of Elimu+, in one place.' }],
  [/^\/portal\/payroll/, { tag: 'Money', title: 'Payroll', description: 'Run and review payroll.' }],
  [/^\/portal\/books/, { tag: 'Money', title: 'Accounts and statements', description: 'Accounts and statements for Elimu+.' }],
  [/^\/portal\/procurement/, { tag: 'Money', title: 'Procurement', description: 'Purchase orders, quotes and supplier approvals.' }],
  [/^\/portal\/reports/, { tag: 'Money', title: 'Reports', description: 'Reports for partners, funders and the founders.' }],
  [/^\/portal\/requests/, { tag: 'Money', title: 'Requests', description: 'Requests waiting to be reviewed.' }],

  [/^\/portal\/hr/, { tag: 'People', title: 'People and HR', description: 'Staff records, contracts and leave.' }],
  [/^\/portal\/team/, { tag: 'People', title: 'Team and people', description: 'The Elimu+ team: who does what.' }],
  [/^\/portal\/suppliers/, { tag: 'People', title: 'Suppliers', description: 'Suppliers Elimu+ buys from, and what we need from them.' }],

  [/^\/portal\/journey/, { tag: 'My work', title: 'My journey', description: 'Your Elimu+ journey: where you are and what comes next.' }],
  [/^\/portal\/me/, { tag: 'My work', title: 'My profile', description: 'Your details and settings in the Elimu+ Portal.' }],
  [/^\/portal\/canvas/, { tag: 'My work', title: 'My SEE Canvas', description: 'Build your SEE Canvas: the problem, the customer, the money and the next step.' }],
  [/^\/portal\/plan/, { tag: 'My work', title: 'Improvement plans', description: 'Goals for getting better at your work, with the help to reach them.' }],
  [/^\/portal\/learn/, { tag: 'My work', title: 'Learning center', description: 'Guides, documents and videos for the people Elimu+ works with.' }],
  [/^\/portal\/book/, { tag: 'My work', title: 'My business book', description: 'Record what you sell and spend, and see your profit.' }],
  [/^\/portal\/recognition/, { tag: 'My work', title: 'Impact milestones', description: 'Milestones reached by the people and partners of Elimu+.' }],

  [/^\/portal\/inventory/, { tag: 'Admin', title: 'Inventory and assets', description: 'What Elimu+ owns and where it is.' }],
  [/^\/portal\/operations/, { tag: 'Admin', title: 'Operations and admin', description: 'Day-to-day operations and administration.' }],
  [/^\/portal\/compliance/, { tag: 'Admin', title: 'Compliance', description: 'Registrations, renewals and the records we must keep.' }],
  [/^\/portal\/permissions/, { tag: 'Admin', title: 'Permissions', description: 'Choose who can see and change each part of the portal.' }],
  [/^\/portal\/audit/, { tag: 'Admin', title: 'Audit log', description: 'A record of who did what in the portal.' }],

  [/^\/verify\//, { tag: 'Verify', title: 'Verify an Elimu+ certificate', description: 'Check that an Elimu+ certificate number is genuine.' }],
  [/^\/seminar\//, { tag: 'Seminar', title: 'Elimu+ seminar sign-in', description: 'Sign in to an Elimu+ monthly seminar.' }],
  [/^\/unsubscribe/, { tag: 'Letters', title: 'Unsubscribe', description: 'Stop receiving the weekly Elimu+ letter.' }],
];

export const DEFAULT_SHARE: Share = {
  tag: 'Portal',
  title: BRAND,
  description: 'Start. Start small. Start to finish. The Elimu+ Portal for participants, trainers, partner organisations and the founding team.',
};

export function shareFor(pathname: string): Share {
  const p = pathname.replace(/\/+$/, '') || '/';
  for (const [re, s] of ROUTES) if (re.test(p)) return s;
  return DEFAULT_SHARE;
}

/** The card title people see: "Learning center · Elimu+ Portal". */
export const cardTitle = (s: Share) => (s.title === BRAND ? BRAND : `${s.title} · ${BRAND}`);

/** True for the link-preview robots of the apps people share links in. */
export const isPreviewBot = (ua: string) =>
  /facebookexternalhit|facebot|whatsapp|twitterbot|linkedinbot|slackbot|slack-imgproxy|telegrambot|discordbot|skypeuripreview|pinterest|embedly|redditbot|applebot|mastodon|signal|viber|line\//i.test(ua);

export const SITE = 'https://portal.elimuplus.com';
