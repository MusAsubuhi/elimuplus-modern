export const ANGLES = [
  { key: 'actionable', label: 'Actionable', hint: 'Here is how: a tip, a step, a simple framework people can use today.' },
  { key: 'analytical', label: 'Analytical', hint: 'Here is a breakdown: a number, a trend, how something works. Confirmed figures only.' },
  { key: 'aspirational', label: 'Aspirational', hint: 'Yes, you can: a lesson, a mistake, a real moment of growth.' },
  { key: 'anthropological', label: 'Anthropological', hint: 'Here is why: culture, meaning, what we notice about how people in Likoni run and think about business.' },
] as const;
export const PLATFORMS = [
  { key: 'whatsapp', label: 'WhatsApp', hint: 'Short and warm, like a message to a friend. Emojis are fine.' },
  { key: 'facebook', label: 'Facebook', hint: 'Conversational, community feel. End with a question people can answer in a sentence.' },
  { key: 'instagram', label: 'Instagram', hint: 'One clear thought, visual, a few hashtags.' },
  { key: 'linkedin', label: 'LinkedIn', hint: 'Lead with an insight; professional; one or two real questions; about three hashtags.' },
] as const;
export const angleLabel = (k: string) => ANGLES.find((a) => a.key === k)?.label ?? k;
