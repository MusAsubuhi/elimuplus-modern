/** Choices for the system feedback form. Plain data so both the form and the results page can use it. */
export type Audience = 'partner' | 'trainer' | 'founder' | 'participant';

export const VALUABLE: Record<Audience, string[]> = {
  participant: [
    'My journey and progress', 'My canvas', 'My business book', 'My improvement plan',
    'The learning centre', 'Recognition and badges', 'My story', 'Biashara za Elimu+',
  ],
  founder: [
    'Command view and alerts', 'Cohorts, attendance and follow-up', 'Partners, quotes and deals', 'Invoices, payments and money',
    'Reports and impact numbers', 'Team, trainers and permissions', 'Marketing, social and news', 'Data completeness and evidence',
  ],
  partner: [
    'Seeing every cohort and its progress', 'Follow-up results at 30, 60 and 90 days', 'Reports and documents in one place',
    'Invoices and payments', 'Requesting or changing a training', 'Adding participants', 'Certificates', 'The learning centre',
  ],
  trainer: [
    'Daily attendance', 'Day reports', 'Cohort and participant lists', 'The training calendar',
    'My earnings', 'My pathway and level', 'Forms and follow-up', 'The learning centre',
  ],
};
export const FRUSTRATIONS = [
  'Nothing, it works well', 'It is slow to load', 'Hard to find things', 'Too many steps', 'Hard to use on my phone',
  'Sign-in or PIN trouble', 'Wording is unclear', 'Information I need is missing',
];
export const MISSING = [
  'Nothing, I have what I need', 'WhatsApp or SMS reminders', 'More Swahili', 'Working with a weak connection', 'More downloads and reports',
  'A simpler phone layout', 'Paying through M-Pesa', 'Something else',
];
export const EASE_FACES = ['😣', '😕', '😐', '🙂', '😄'];
export const EASE_WORDS = ['Very hard', 'Hard', 'Okay', 'Easy', 'Very easy'];

/** Swahili display text. The English string is what gets stored, so totals stay comparable across languages. */
export const SW: Record<string, string> = {
  'Very hard': 'Ngumu sana', 'Hard': 'Ngumu', 'Okay': 'Wastani', 'Easy': 'Rahisi', 'Very easy': 'Rahisi sana',
  'My journey and progress': 'Safari yangu na maendeleo', 'My canvas': 'Canvas yangu', 'My business book': 'Kitabu changu cha biashara', 'My improvement plan': 'Mpango wangu wa kujiboresha',
  'The learning centre': 'Kituo cha kujifunza', 'Recognition and badges': 'Utambuzi na beji', 'My story': 'Hadithi yangu', 'Biashara za Elimu+': 'Biashara za Elimu+',
  'Seeing every cohort and its progress': 'Kuona kila kundi na maendeleo yake', 'Follow-up results at 30, 60 and 90 days': 'Matokeo ya ufuatiliaji wa siku 30, 60 na 90',
  'Reports and documents in one place': 'Ripoti na nyaraka mahali pamoja', 'Invoices and payments': 'Ankara na malipo', 'Requesting or changing a training': 'Kuomba au kubadilisha mafunzo',
  'Adding participants': 'Kuongeza washiriki', 'Certificates': 'Vyeti',
  'Daily attendance': 'Mahudhurio ya kila siku', 'Day reports': 'Ripoti za siku', 'Cohort and participant lists': 'Orodha za makundi na washiriki', 'The training calendar': 'Kalenda ya mafunzo',
  'My earnings': 'Mapato yangu', 'My pathway and level': 'Njia na ngazi yangu', 'Forms and follow-up': 'Fomu na ufuatiliaji',
  'Nothing, it works well': 'Hakuna, inafanya kazi vizuri', 'It is slow to load': 'Inachelewa kufunguka', 'Hard to find things': 'Ni vigumu kupata vitu', 'Too many steps': 'Hatua nyingi mno',
  'Hard to use on my phone': 'Ni ngumu kutumia kwenye simu yangu', 'Sign-in or PIN trouble': 'Shida ya kuingia au PIN', 'Wording is unclear': 'Maneno hayaeleweki', 'Information I need is missing': 'Taarifa ninayohitaji haipo',
  'Nothing, I have what I need': 'Hakuna, nina ninachohitaji', 'WhatsApp or SMS reminders': 'Vikumbusho vya WhatsApp au SMS', 'More Swahili': 'Kiswahili zaidi', 'Working with a weak connection': 'Kufanya kazi mtandao ukiwa dhaifu',
  'More downloads and reports': 'Upakuaji na ripoti zaidi', 'A simpler phone layout': 'Muundo rahisi zaidi wa simu', 'Paying through M-Pesa': 'Kulipa kupitia M-Pesa', 'Something else': 'Kitu kingine',
};
export const tr = (lang: string, v: string) => (lang === 'sw' ? SW[v] ?? v : v);
export const UI = {
  en: { q1: '1. How easy is the portal to use?', q2: '2. How likely are you to recommend the Elimu+ portal to someone like you?', lo: 'Not at all likely', hi: 'Extremely likely', q3: '3. What do you find most valuable?', up3: 'Pick up to three.',
    q4: '4. What gets in your way the most?', q5: '5. What one thing would help you most next?', send: 'Send my answers', need: 'Answer questions 1 and 2 to send.',
    title: 'How is the portal working for you?', sub: 'Five quick questions, all taps. We only ever see the combined picture of everyone who answers, never who said what.',
    nudge: 'Two minutes, five taps.', nudge2: 'Tell us how the portal is working for you. Your answers are only ever shown to us as totals.', give: 'Give feedback', later: 'Not now' },
  sw: { q1: '1. Je, portal ni rahisi kutumia kiasi gani?', q2: '2. Una uwezekano gani wa kupendekeza portal ya Elimu+ kwa mtu kama wewe?', lo: 'Hapana kabisa', hi: 'Kabisa kabisa', q3: '3. Unaona nini chenye thamani zaidi?', up3: 'Chagua hadi vitatu.',
    q4: '4. Nini kinakukwamisha zaidi?', q5: '5. Ni kitu gani kimoja kingekusaidia zaidi baadaye?', send: 'Tuma majibu yangu', need: 'Jibu swali la 1 na la 2 ili kutuma.',
    title: 'Portal inakufanyia kazi vipi?', sub: 'Maswali matano mafupi, ni kubofya tu. Tunaona picha ya jumla ya wote wanaojibu, hatuoni nani alisema nini.',
    nudge: 'Dakika mbili, kubofya tano.', nudge2: 'Tuambie portal inakufanyia kazi vipi. Majibu yako yanaonyeshwa kwetu kama jumla tu.', give: 'Toa maoni', later: 'Si sasa' },
} as const;
