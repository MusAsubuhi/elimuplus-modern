/** Choices for the system feedback form. Plain data so both the form and the results page can use it. */
export type Audience = 'partner' | 'trainer';

export const VALUABLE: Record<Audience, string[]> = {
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
