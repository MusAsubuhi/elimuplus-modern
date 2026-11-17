/** Wording for the mentoring pages, in English and Swahili. Mentees mostly read Swahili, so every question on their side has both. */
export const IMPROVE = ['more_practice', 'clearer_steps', 'more_listening', 'shorter', 'more_time', 'better_place', 'more_examples'];

export const FORM = {
  en: {
    title: 'How was this session?', sub: 'Four quick taps. Only totals are ever shown, and only when at least three people have answered, so nobody can tell who said what.',
    useful: 'How useful was it for you?', useScale: ['Not useful', 'A little', 'Fairly', 'Useful', 'Very useful'],
    clear: 'Do you know your next step?', clearScale: ['Not at all', 'Not really', 'Somewhat', 'Yes', 'Very clearly'],
    pace: 'How was the pace?', paceOpts: { too_slow: 'Too slow', right: 'About right', too_fast: 'Too fast' } as Record<string, string>,
    improve: 'What would make the next session better? (up to three)',
    improveOpts: { more_practice: 'More practice, less talk', clearer_steps: 'Clearer next steps', more_listening: 'More time to be heard', shorter: 'A shorter session', more_time: 'A longer session', better_place: 'A better place to meet', more_examples: 'More real examples' } as Record<string, string>,
    wentWell: 'What went well? (your own note, shown only to the founders)', toImprove: 'What should we change?', send: 'Send my answers', done: 'You answered this session. Thank you.',
  },
  sw: {
    title: 'Kikao hiki kilikuwaje?', sub: 'Chagua majibu manne mafupi. Tunaonyesha jumla tu, na tu pale watu watatu au zaidi wamejibu, hivyo hakuna anayeweza kujua nani alisema nini.',
    useful: 'Kilikusaidia kwa kiasi gani?', useScale: ['Hakikusaidia', 'Kidogo', 'Kiasi', 'Kilisaidia', 'Kilisaidia sana'],
    clear: 'Unajua hatua yako inayofuata?', clearScale: ['Hata kidogo', 'Si sana', 'Kiasi', 'Ndiyo', 'Naijua vizuri'],
    pace: 'Kasi ilikuwaje?', paceOpts: { too_slow: 'Polepole sana', right: 'Sawa', too_fast: 'Haraka sana' } as Record<string, string>,
    improve: 'Nini kingefanya kikao kijacho kiwe bora? (hadi vitatu)',
    improveOpts: { more_practice: 'Mazoezi zaidi, maongezi kidogo', clearer_steps: 'Hatua zinazofuata ziwe wazi zaidi', more_listening: 'Muda zaidi wa kusikilizwa', shorter: 'Kikao kifupi zaidi', more_time: 'Kikao kirefu zaidi', better_place: 'Mahali pazuri zaidi pa kukutana', more_examples: 'Mifano halisi zaidi' } as Record<string, string>,
    wentWell: 'Nini kilienda vizuri? (maoni yako, yanaonekana kwa waanzilishi tu)', toImprove: 'Tubadilishe nini?', send: 'Tuma majibu yangu', done: 'Umejibu kikao hiki. Asante.',
  },
};

export const FOCUS: Record<string, string> = { business: 'Business', employability: 'Work and employability', mixed: 'Business and work' };
export const MENTOR_STATUS: Record<string, string> = { vetting: 'In vetting', active: 'Active', paused: 'Paused', declined: 'Not going ahead', ended: 'Ended' };
export const MENTOR_TONE: Record<string, string> = { vetting: 'gold', active: 'green', paused: 'grey', declined: 'red', ended: 'grey' };
