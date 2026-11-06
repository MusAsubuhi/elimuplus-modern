export const PAID_FROM: Record<string, string> = {
  to_be_paid: 'Not yet paid (needs paying)',
  own_pocket: 'Own money (to reimburse)',
  bank: 'Elimu+ bank account',
  cash: 'Elimu+ cash',
  mpesa: 'Elimu+ M-Pesa',
};
/** The choices on the form. "ahead" is a request for money; the rest record money already spent. */
export const HOW: { k: string; label: string; hint: string }[] = [
  { k: 'ahead', label: 'I need money for something coming up', hint: 'A founder approves, then pays you.' },
  { k: 'own_pocket', label: 'I already paid with my own money', hint: 'A founder checks the receipt and reimburses you.' },
  { k: 'bank', label: 'Paid from the Elimu+ bank account', hint: 'Recorded once the other founder confirms it.' },
  { k: 'mpesa', label: 'Paid from the Elimu+ M-Pesa', hint: 'Recorded once the other founder confirms it.' },
  { k: 'cash', label: 'Paid from Elimu+ cash', hint: 'Recorded once the other founder confirms it.' },
];
