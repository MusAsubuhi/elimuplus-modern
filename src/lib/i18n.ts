import type { Lang } from './session';

const D = {
  home: { sw: 'Nyumbani', en: 'Home' },
  myJourney: { sw: 'Safari yangu', en: 'My journey' },
  myCanvas: { sw: 'Turubai langu', en: 'My canvas' },
  print: { sw: 'Chapisha', en: 'Print' },
  save: { sw: 'Hifadhi', en: 'Save' },
  saved: { sw: 'Imehifadhiwa', en: 'Saved' },
  locked: { sw: 'Itafunguliwa darasani', en: 'Unlocks in class' },
  open: { sw: 'Wazi', en: 'Open' },
  done: { sw: 'Imekamilika', en: 'Done' },
  progress: { sw: 'Maendeleo', en: 'Progress' },
  boxesFilled: { sw: 'visanduku vilivyojazwa', en: 'boxes filled' },
  followups: { sw: 'Ufuatiliaji wa siku 30, 60 na 90', en: '30, 60 and 90 day follow-ups' },
  due: { sw: 'Tarehe', en: 'Due' },
  scheduled: { sw: 'Imepangwa', en: 'Scheduled' },
  missed: { sw: 'Imekosekana', en: 'Missed' },
  unreachable: { sw: 'Hajapatikana', en: 'Unreachable' },
  phase1: { sw: 'Ona tatizo', en: 'See the problem' },
  phase2: { sw: 'Buni suluhisho', en: 'Design your solution' },
  phase3: { sw: 'Jitofautishe na lenga vizuri', en: 'Stand out and target smart' },
  phase4: { sw: 'Fanya lifanye kazi', en: 'Make it work' },
  phase5: { sw: 'Fikia, husiana na pima', en: 'Reach, relate and measure' },
  assisted: { sw: 'Imejazwa kwa msaada', en: 'Filled with help' },
  yourAnswer: { sw: 'Jibu lako', en: 'Your answer' },
  next: { sw: 'Inayofuata', en: 'Next' },
  signOut: { sw: 'Toka', en: 'Sign out' },
  directory: { sw: 'Biashara za Elimu+', en: 'Biashara za Elimu+' },
  certificate: { sw: 'Cheti chako', en: 'Your certificate' },
  welcome: { sw: 'Karibu', en: 'Welcome' },
  printHint: { sw: 'Bonyeza Chapisha ili kupata ukurasa wa A4 wa turubai lako.', en: 'Press Print to get an A4 copy of your canvas.' },
} as const;

export type Key = keyof typeof D;
export const t = (lang: Lang, k: Key) => D[k][lang];
export const phaseKey = (n: number): Key => (`phase${n}` as Key);
