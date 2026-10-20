import type { Lang } from './session';

// Every word on the business book screens, in English and Kiswahili. Plain and short: these are read on a phone, often outdoors.
const D = {
  title: ['My business book', 'Kitabu cha Biashara Yangu'],
  tabToday: ['Today', 'Leo'], tabWeek: ['Week', 'Wiki'], tabMonth: ['Month', 'Mwezi'], tabSetup: ['Setup', 'Mipangilio'],
  intro: ['Write down what you sold and spent. The book does the sums and shows you where your money goes.', 'Andika ulichouza na ulichotumia. Kitabu kinahesabu na kukuonyesha pesa zako zinaenda wapi.'],

  // setup
  startTitle: ['Set up your book once', 'Andaa kitabu chako mara moja'], startHint: ['Takes about five minutes. You can change everything later.', 'Inachukua dakika tano hivi. Unaweza kubadilisha kila kitu baadaye.'],
  businessName: ['Business name', 'Jina la biashara'], whatISell: ['What I sell', 'Ninauza nini'], whereITrade: ['Where I trade', 'Mahali pa biashara'],
  daysPerWeek: ['Days I trade each week', 'Siku ninazofanya biashara kwa wiki'], daysPerMonth: ['Days I trade each month', 'Siku ninazofanya biashara kwa mwezi'],
  openingCash: ['Cash I have today for the business (KES)', 'Pesa nilizonazo leo za biashara (KES)'], openingOwed: ['Money customers already owe me (KES)', 'Pesa wateja wananidai tayari (KES)'],
  goal: ['What I want to achieve in the next 30 days', 'Ninachotaka kufikia katika siku 30 zijazo'], goalHint: ['A good goal has a number.', 'Lengo zuri lina nambari.'],
  modeTitle: ['How do you want to record sales?', 'Unataka kuandika mauzo vipi?'],
  modeSimple: ['Simple: one total for the day', 'Rahisi: jumla moja ya siku'], modeSimpleHint: ['Best if you sell many small things. You tell us roughly how much of each sale is left after the cost.', 'Bora kama unauza vitu vingi vidogo. Unatuambia takriban ni kiasi gani kinabaki baada ya gharama.'],
  modeItems: ['By item: count what you sold', 'Kwa bidhaa: hesabu ulichouza'], modeItemsHint: ['Best if you have a few main items. The book works out exactly what you earn on each.', 'Bora kama una bidhaa chache kuu. Kitabu kinahesabu hasa unachopata kwa kila moja.'],
  marginLabel: ['Of every KES 100 I sell, about how much is left after the cost of the item?', 'Kila KES 100 ninayouza, takriban ni kiasi gani kinabaki baada ya gharama ya bidhaa?'], marginHint: ['If an item costs you 60 and you sell it for 100, 40 is left.', 'Kama bidhaa inakugharimu 60 na unaiuza 100, 40 inabaki.'],
  itemsTitle: ['My items and prices', 'Bidhaa na bei zangu'], itemsHint: ['Name, what it costs me, what I sell it for.', 'Jina, inanigharimu kiasi gani, naiuza kwa kiasi gani.'],
  itemName: ['Item', 'Bidhaa'], itemUnit: ['Per (cup, kg, job)', 'Kwa (kikombe, kilo, kazi)'], itemCost: ['Costs me', 'Inanigharimu'], itemPrice: ['I sell at', 'Naiuza'], removeItem: ['Remove', 'Ondoa'],
  fixedTitle: ['Costs I pay whether I sell or not', 'Gharama ninazolipa nikiuza au nisiuze'], fixedHint: ['Rent, licence, airtime, a loan repayment. If you pay daily, count the month.', 'Kodi, leseni, muda wa maongezi, malipo ya mkopo. Ukilipa kila siku, hesabu mwezi mzima.'],
  costName: ['Cost', 'Gharama'], costAmount: ['Amount (KES)', 'Kiasi (KES)'], costTimes: ['Times a month', 'Mara kwa mwezi'],
  shareTitle: ['Share my numbers', 'Shiriki namba zangu'], shareLabel: ['Let my trainer and the Elimu+ team see my business numbers', 'Mshauri wangu na timu ya Elimu+ waone namba za biashara yangu'],
  shareHint: ['They use them at your 30, 60 and 90 day visits. You can switch this off at any time. Partner organisations never see your name or numbers.', 'Wanazitumia katika ziara za siku 30, 60 na 90. Unaweza kuzima wakati wowote. Mashirika washirika hayaoni jina wala namba zako.'],
  startBtn: ['Start my book', 'Anza kitabu changu'], saveBtn: ['Save', 'Hifadhi'], saveDay: ['Save today', 'Hifadhi leo'],
  needName: ['Give your business a name.', 'Weka jina la biashara.'],

  // hub
  todayPage: ['Today’s page', 'Ukurasa wa leo'], notYet: ['Not filled in yet', 'Haujajazwa bado'], filled: ['Filled in', 'Umejazwa'], fillNow: ['Fill in today', 'Jaza leo'], seeToday: ['See today', 'Ona leo'],
  last7: ['The last 7 days', 'Siku 7 zilizopita'], tapDay: ['Tap a day to fill it in or see it.', 'Gusa siku kuijaza au kuiona.'],
  thisWeek: ['This week', 'Wiki hii'], sales: ['Sales', 'Mauzo'], contribution: ['Left after item cost', 'Kinachobaki baada ya gharama ya bidhaa'], profit: ['Profit', 'Faida'],
  daysAtBE: ['Days at break-even', 'Siku nilizofikia kivunja gharama'], saved: ['Saved', 'Akiba'], owed: ['Customers owe me', 'Wateja wananidai'], cashNow: ['Cash in my business', 'Pesa kwenye biashara'],
  beNeeded: ['To cover fixed costs today', 'Kufidia gharama zisizobadilika leo'], chartTitle: ['What I earned each day against what I needed', 'Nilichopata kila siku dhidi ya nilichohitaji'],
  needed: ['Needed', 'Kinachohitajika'], earned: ['Earned', 'Kilichopatikana'],
  notYetBook: ['No book yet', 'Bado hakuna kitabu'], noBookBody: ['Start your book to begin.', 'Anza kitabu chako ili uanze.'],
  viewingOther: ['You are looking at their numbers. They chose to share them with you. You can read but not change anything.', 'Unaangalia namba zao. Wamechagua kuzishiriki nawe. Unaweza kusoma lakini si kubadilisha.'],
  notShared: ['Not shared with you', 'Hazijashirikiwa nawe'], notSharedBody: ['This person has not shared their business numbers. Ask them to switch on sharing in their book if they are happy for you to see them.', 'Mtu huyu hajashiriki namba za biashara yake. Mwombe awashe kushiriki kwenye kitabu chake kama anakubali uzione.'],

  // day
  dayTitle: ['My day', 'Siku yangu'], tradingToday: ['I traded today', 'Nimefanya biashara leo'], dayOff: ['Not trading today', 'Sifanyi biashara leo'],
  soldTitle: ['What I sold', 'Nilichouza'], cashSales: ['Sold for cash (KES)', 'Mauzo ya pesa taslimu (KES)'], creditSales: ['Sold on credit (KES)', 'Mauzo ya mkopo (KES)'],
  qtyCash: ['Sold for cash', 'Za pesa taslimu'], qtyCredit: ['On credit', 'Kwa mkopo'], pricedAt: ['at', 'kwa'],
  debtsIn: ['Debts customers paid me today (KES)', 'Madeni wateja waliyonilipa leo (KES)'],
  paidTitle: ['Money I paid out today', 'Pesa nilizotumia leo'], stockPaid: ['Stock', 'Mzigo'], stallFee: ['Stall fee', 'Ada ya kibanda'], transport: ['Transport', 'Nauli'], mpesa: ['M-Pesa fees and charges', 'Ada za M-Pesa'], other: ['Anything else', 'Mengine'], repaid: ['Debts I repaid', 'Madeni niliyolipa'],
  moreTitle: ['A little more', 'Zaidi kidogo'], customers: ['Customers today', 'Wateja leo'], savedToday: ['Money I set aside as savings (KES)', 'Pesa nilizoweka akiba (KES)'], counted: ['Cash I counted at the end of the day (KES)', 'Pesa nilizohesabu mwisho wa siku (KES)'], countedHint: ['Optional. The book shows if it matches what it worked out.', 'Si lazima. Kitabu kinaonyesha kama inalingana na hesabu yake.'],
  noticed: ['What I noticed today', 'Nilichogundua leo'],
  stallNote: ['Your stall fee is already in your fixed costs, so it only changes your cash here.', 'Ada ya kibanda iko tayari kwenye gharama zisizobadilika, kwa hiyo hapa inabadilisha pesa taslimu tu.'],
  resultTitle: ['How today went', 'Siku ya leo ilivyokwenda'], reached: ['You reached break-even', 'Umefikia kivunja gharama'], below: ['Below break-even', 'Chini ya kivunja gharama'], unknownBE: ['Add how much is left after item cost in Setup to see break-even.', 'Weka kiasi kinachobaki baada ya gharama ya bidhaa kwenye Mipangilio ili uone kivunja gharama.'],
  aboveBy: ['above what you needed', 'zaidi ya ulichohitaji'], belowBy: ['short of what you needed', 'pungufu ya ulichohitaji'],
  openingCashShort: ['Cash at start', 'Pesa mwanzo'], closingCashShort: ['Cash at end', 'Pesa mwisho'], difference: ['Difference from your count', 'Tofauti na hesabu yako'], matches: ['Matches what you counted', 'Inalingana na ulichohesabu'],
  vsYesterday: ['Compared with your last page', 'Ikilinganishwa na ukurasa wako uliopita'], up: ['up', 'juu'], down: ['down', 'chini'], same: ['about the same', 'karibu sawa'],
  paidOutShort: ['Paid out', 'Zilizotumika'], fixedShare: ['Today’s share of fixed costs', 'Sehemu ya leo ya gharama zisizobadilika'],
  unitsToBE: ['To break even today you need about', 'Ili ufikie kivunja gharama leo unahitaji takriban'], futureDay: ['That day has not happened yet.', 'Siku hiyo bado haijafika.'], beforeStart: ['That date is too long ago to fill in.', 'Tarehe hiyo imepita muda mrefu mno kuijaza.'],
  numbersOnly: ['Please use numbers only, with no minus sign.', 'Tafadhali tumia nambari tu, bila alama ya kutoa.'],
  noBookFirst: ['Set up your book first.', 'Andaa kitabu chako kwanza.'],

  // week and month
  weekTitle: ['Weekly summary', 'Muhtasari wa wiki'], monthTitle: ['Monthly review', 'Mapitio ya mwezi'], prev: ['Earlier', 'Iliyopita'], next: ['Later', 'Inayofuata'], thisW: ['This week', 'Wiki hii'], lastW: ['Last week', 'Wiki iliyopita'], thisM: ['This month', 'Mwezi huu'], lastM: ['Last month', 'Mwezi uliopita'], trendLabel: ['Trend', 'Mwelekeo'],
  fixedCosts: ['Fixed costs', 'Gharama zisizobadilika'], otherCosts: ['Other costs and M-Pesa fees', 'Gharama nyingine na ada za M-Pesa'], daysTraded: ['Days I traded', 'Siku nilizofanya biashara'], pagesFilled: ['Pages filled', 'Kurasa zilizojazwa'],
  learned: ['What I learned', 'Nilichojifunza'], nextStep: ['Next time I will', 'Wakati ujao nitafanya'],
  bestAndWeakest: ['Best and weakest weekday', 'Siku bora na dhaifu ya wiki'], best: ['Best', 'Bora'], weakest: ['Weakest', 'Dhaifu'],
  streams: ['Where my sales came from', 'Mauzo yangu yalitoka wapi'], units: ['Units', 'Idadi'], share: ['Share', 'Sehemu'],
  credit: ['Credit', 'Mkopo'], creditGiven: ['Sold on credit', 'Mauzo ya mkopo'], cash: ['Cash', 'Pesa taslimu'], canvasCheck: ['Does my canvas still describe my business?', 'Je, ramani yangu bado inaelezea biashara yangu?'],
  stillTrue: ['Still true', 'Bado ni kweli'], changed: ['It has changed', 'Imebadilika'], cProblem: ['Problem and customers', 'Tatizo na wateja'], cSolution: ['Solution and value', 'Suluhisho na thamani'], cPrices: ['Prices, costs, break-even', 'Bei, gharama, kivunja gharama'], cPartners: ['Partners and activities', 'Washirika na shughuli'],
  canvasLink: ['Open my canvas', 'Fungua ramani yangu'], notEnough: ['Not enough pages yet', 'Kurasa hazitoshi bado'], profitNote: ['Fixed costs are counted only on days you traded.', 'Gharama zisizobadilika zinahesabiwa siku ulizofanya biashara tu.'],
  profitUnknown: ['Add how much is left after item cost in Setup to see profit.', 'Weka kiasi kinachobaki baada ya gharama ya bidhaa kwenye Mipangilio ili uone faida.'],
  weekdays: ['Mon,Tue,Wed,Thu,Fri,Sat,Sun', 'Jtt,Jnn,Jtn,Alh,Ijm,Jms,Jpl'],
  privacyNote: ['Your numbers are yours. Only you can change them.', 'Namba zako ni zako. Wewe pekee ndiye unayeweza kuzibadilisha.'],
} as const;

export type BKey = keyof typeof D;
export const bt = (lang: Lang) => (k: BKey): string => D[k][lang === 'sw' ? 1 : 0];
export const weekdayNames = (lang: Lang): string[] => D.weekdays[lang === 'sw' ? 1 : 0].split(',');
