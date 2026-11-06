// Wording of the printed consent forms. Plain language, English and Kiswahili. Version it when the wording changes so signed forms can be traced.
export type FormLang = 'en' | 'sw';
export const CONSENT_VERSION = 'v1 (Nov 2026)';
export const CONTACT = 'hello@elimuplus.com';

type Words = {
  org: string; sub: string;
  fields: Record<string, string>;
  yes: string; no: string; optional: string;
  adult: { title: string; intro: string; a: string; aText: string; b: string; bItems: string[]; c: string; cText: string; declare: string; sign: string; read: string };
  minor: { title: string; intro: string; a: string; aText: string; b: string; bItems: string[]; c: string; cText: string; declare: string; childHead: string; childText: string; childNoPhoto: string; sign: string; read: string };
  register: { title: string; cols: string[]; note: string; adult: string; minor: string };
  footer: string;
};

export const WORDS: Record<FormLang, Words> = {
  en: {
    org: 'Elimu+', sub: 'Simply Building Sustainable Businesses',
    fields: { name: 'Full name', phone: 'Phone (optional)', cohort: 'Programme or cohort', venue: 'Venue', date: 'Date', child: 'Child’s full name', age: 'Child’s age', school: 'School (optional)', guardian: 'Parent or guardian’s full name', relation: 'Relationship to the child', gphone: 'Phone', signature: 'Signature or thumbprint', printed: 'Name', witness: 'Witness or trainer (name and signature)', witnessRead: 'If the form was read aloud, name of the person who read it' },
    yes: 'Yes', no: 'No', optional: 'optional',
    adult: {
      title: 'Adult consent form', intro: 'Elimu+ trains people to start and grow businesses and to find work. We keep records of every training, and we sometimes take photos and videos. Please read, or ask to have this read to you, and tick what you agree to. You may say no to any of the photo and video questions and still take part in the training.',
      a: 'A. Taking part and our records', aText: 'I agree that Elimu+ may keep my name, phone number, attendance, canvas and follow-up answers in order to run the training, support my business and follow up with me at 30, 60 and 90 days. I understand this information will be protected and shared only with the partner organisation that arranged this training and with those who fund it, in reports, and where the law requires.',
      b: 'B. Photos and videos (tick Yes or No for each)', bItems: [
        'Elimu+ may take photos and videos of me during the training, for records and for reports to partners and funders only.',
        'Elimu+ may also use them in public: social media, the website, printed materials and presentations.',
        'Elimu+ may use my first name next to my photo or story. If I say No, no name is used.',
        'Elimu+ may share my story or my own words about the training.'],
      c: 'C. My rights', cText: `I may change my mind at any time by telling the trainer or writing to ${CONTACT}. Pictures already published will be taken down as far as possible. Saying No does not affect my place in the training.`,
      declare: 'I am 18 years old or older. I have read this form, or it was read to me, and I understand it.', sign: 'Participant', read: 'Read aloud to the participant by',
    },
    minor: {
      title: 'Parent or guardian consent form', intro: 'Your child has been invited to an Elimu+ training on business and work skills. To protect children, we need a parent or guardian to agree before the child takes part, and before any photo or video is taken. Please read, or ask to have this read to you, and tick what you agree to. You may say no to any of the photo and video questions and your child can still take part.',
      a: 'A. Taking part and our records', aText: 'I agree that my child may take part in the training. Elimu+ will keep my child’s name, age, attendance and work in order to run the training and follow up. This information will be protected and shared only with the partner organisation that arranged the training and with those who fund it, in reports, and where the law requires.',
      b: 'B. Photos and videos (tick Yes or No for each)', bItems: [
        'Elimu+ may take photos and videos of my child during the training, for records and for reports to partners and funders only.',
        'Elimu+ may also use them in public: social media, the website, printed materials and presentations.',
        'Elimu+ may use my child’s first name only next to a photo. Full name, school and home place are never shown with a photo.'],
      c: 'C. Rights and welfare', cText: `I may withdraw this consent at any time by telling the trainer or writing to ${CONTACT}. Saying No to photos does not affect my child’s place in the training. A child who does not want to be photographed will not be, even if I agree. If a trainer is worried about my child’s safety or welfare, Elimu+ may speak to me and to the partner organisation.`,
      declare: 'I am the parent or legal guardian of this child. I have read this form, or it was read to me, and I understand it.',
      childHead: 'The child’s own agreement', childText: 'I understand what the training is and I want to take part.', childNoPhoto: 'I do not want to be photographed or filmed.', sign: 'Parent or guardian', read: 'Read aloud to the parent or guardian by',
    },
    register: { title: 'Consent register', cols: ['No.', 'Participant', 'Age group', 'Form signed', 'Photos for records', 'Photos in public', 'Notes'], note: 'Tick the signed forms and file them with the cohort pack. Take no photo or video of anyone whose public-use box is not ticked.', adult: 'Adult', minor: 'Under 18' },
    footer: 'Keep the signed form. A copy is given to the person on request.',
  },
  sw: {
    org: 'Elimu+', sub: 'Tunajenga Biashara Endelevu',
    fields: { name: 'Jina kamili', phone: 'Simu (si lazima)', cohort: 'Mafunzo au kundi', venue: 'Mahali', date: 'Tarehe', child: 'Jina kamili la mtoto', age: 'Umri wa mtoto', school: 'Shule (si lazima)', guardian: 'Jina kamili la mzazi au mlezi', relation: 'Uhusiano na mtoto', gphone: 'Simu', signature: 'Sahihi au alama ya kidole', printed: 'Jina', witness: 'Shahidi au mkufunzi (jina na sahihi)', witnessRead: 'Kama fomu ilisomwa kwa sauti, jina la aliyeisoma' },
    yes: 'Ndiyo', no: 'Hapana', optional: 'si lazima',
    adult: {
      title: 'Fomu ya idhini ya mtu mzima', intro: 'Elimu+ inawafundisha watu kuanzisha na kukuza biashara na kupata kazi. Tunatunza kumbukumbu za kila mafunzo, na wakati mwingine tunapiga picha na video. Tafadhali soma, au omba usomewe, kisha weka alama kwa yale unayokubali. Unaweza kukataa swali lolote la picha na video na bado ukashiriki mafunzo.',
      a: 'A. Kushiriki na kumbukumbu zetu', aText: 'Ninakubali Elimu+ itunze jina langu, nambari ya simu, mahudhurio, turubai yangu na majibu ya ufuatiliaji ili kuendesha mafunzo, kusaidia biashara yangu na kunifuatilia siku ya 30, 60 na 90. Naelewa kwamba taarifa hizi zitalindwa na zitashirikiwa tu na shirika lililoandaa mafunzo haya na wafadhili wake, kupitia ripoti, na pale sheria inapohitaji.',
      b: 'B. Picha na video (weka alama ya Ndiyo au Hapana kwa kila moja)', bItems: [
        'Elimu+ inaweza kunipiga picha na video wakati wa mafunzo, kwa ajili ya kumbukumbu na ripoti kwa washirika na wafadhili pekee.',
        'Elimu+ inaweza pia kuzitumia hadharani: mitandao ya kijamii, tovuti, nyenzo zilizochapishwa na mawasilisho.',
        'Elimu+ inaweza kutumia jina langu la kwanza pamoja na picha au hadithi yangu. Nikikataa, hakuna jina litakalotumika.',
        'Elimu+ inaweza kushiriki hadithi yangu au maneno yangu kuhusu mafunzo.'],
      c: 'C. Haki zangu', cText: `Naweza kubadili nia wakati wowote kwa kumwambia mkufunzi au kuandika kwa ${CONTACT}. Picha ambazo tayari zimechapishwa zitaondolewa kadri inavyowezekana. Kukataa hakuathiri nafasi yangu katika mafunzo.`,
      declare: 'Nina umri wa miaka 18 au zaidi. Nimesoma fomu hii, au nimesomewa, na nimeielewa.', sign: 'Mshiriki', read: 'Imesomwa kwa mshiriki na',
    },
    minor: {
      title: 'Fomu ya idhini ya mzazi au mlezi', intro: 'Mtoto wako amealikwa kushiriki mafunzo ya Elimu+ kuhusu biashara na ujuzi wa kazi. Ili kuwalinda watoto, tunahitaji mzazi au mlezi akubali kabla mtoto hajashiriki, na kabla ya picha au video yoyote kupigwa. Tafadhali soma, au omba usomewe, kisha weka alama kwa yale unayokubali. Unaweza kukataa swali lolote la picha na video na mtoto wako bado ataweza kushiriki.',
      a: 'A. Kushiriki na kumbukumbu zetu', aText: 'Ninakubali mtoto wangu ashiriki mafunzo. Elimu+ itatunza jina la mtoto, umri, mahudhurio na kazi zake ili kuendesha mafunzo na kumfuatilia. Taarifa hizi zitalindwa na zitashirikiwa tu na shirika lililoandaa mafunzo na wafadhili wake, kupitia ripoti, na pale sheria inapohitaji.',
      b: 'B. Picha na video (weka alama ya Ndiyo au Hapana kwa kila moja)', bItems: [
        'Elimu+ inaweza kumpiga mtoto wangu picha na video wakati wa mafunzo, kwa ajili ya kumbukumbu na ripoti kwa washirika na wafadhili pekee.',
        'Elimu+ inaweza pia kuzitumia hadharani: mitandao ya kijamii, tovuti, nyenzo zilizochapishwa na mawasilisho.',
        'Elimu+ inaweza kutumia jina la kwanza pekee la mtoto wangu pamoja na picha. Jina kamili, shule na mahali anapoishi havitawekwa kamwe pamoja na picha.'],
      c: 'C. Haki na ustawi', cText: `Naweza kuondoa idhini hii wakati wowote kwa kumwambia mkufunzi au kuandika kwa ${CONTACT}. Kukataa picha hakuathiri nafasi ya mtoto wangu katika mafunzo. Mtoto asiyetaka kupigwa picha hatapigwa, hata nikikubali. Mkufunzi akiwa na wasiwasi kuhusu usalama au ustawi wa mtoto wangu, Elimu+ inaweza kuzungumza nami na na shirika mshirika.`,
      declare: 'Mimi ni mzazi au mlezi halali wa mtoto huyu. Nimesoma fomu hii, au nimesomewa, na nimeielewa.',
      childHead: 'Makubaliano ya mtoto mwenyewe', childText: 'Nimeelewa mafunzo haya ni ya nini na ninataka kushiriki.', childNoPhoto: 'Sitaki kupigwa picha au kurekodiwa video.', sign: 'Mzazi au mlezi', read: 'Imesomwa kwa mzazi au mlezi na',
    },
    register: { title: 'Daftari la idhini', cols: ['Na.', 'Mshiriki', 'Kundi la umri', 'Fomu imesainiwa', 'Picha za kumbukumbu', 'Picha hadharani', 'Maelezo'], note: 'Weka alama kwa fomu zilizosainiwa na zihifadhiwe pamoja na faili la kundi. Usimpige picha wala video mtu ambaye kisanduku chake cha matumizi ya hadharani hakijawekwa alama.', adult: 'Mtu mzima', minor: 'Chini ya miaka 18' },
    footer: 'Hifadhi fomu iliyosainiwa. Nakala hutolewa kwa mhusika akiomba.',
  },
};
