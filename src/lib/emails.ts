const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export type Mail = { subject: string; html: string; text: string };

const TEAL = '#0D3B3B', GOLD = '#D4A843', GOLD_DK = '#8C661A', MIST = '#F5FAF8', BORDER = '#E0EDE9', INK = '#1A1A1A';
const SERIF = "Georgia,'Times New Roman',serif", SANS = "Arial,Helvetica,sans-serif";

/** One shared look for every automatic email, in the website's colours: a deep teal header with a gold stripe, a large headline, readable body text and a quiet footer. */
function wrap(opts: { greeting: string; headline: string; kicker?: string; paragraphs: string[]; button?: { label: string; url: string }; unsubscribeUrl?: string }): Pick<Mail, 'html' | 'text'> {
  const { greeting, headline, kicker, paragraphs, button, unsubscribeUrl } = opts;
  const body = paragraphs.map((p) => `<p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:${INK}">${esc(p)}</p>`).join('');
  const btn = button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px"><tr><td style="background:${TEAL};border-radius:8px"><a href="${button.url}" style="display:inline-block;padding:14px 28px;font:700 15px ${SANS};color:#ffffff;text-decoration:none">${esc(button.label)} &rarr;</a></td></tr></table>` : '';
  const foot = unsubscribeUrl
    ? `You are receiving this because you agreed to hear from Elimu+.<br><a href="${unsubscribeUrl}" style="color:${GOLD_DK}">Unsubscribe</a> at any time, in one click.`
    : 'You are receiving this because you registered with Elimu+.';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:${MIST}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MIST}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td style="background:${TEAL};border-radius:12px 12px 0 0;padding:30px 36px 26px">
<div style="font:700 28px ${SERIF};color:${GOLD};letter-spacing:.5px">Elimu+</div>
<div style="font:13px ${SANS};color:#cfe3de;margin-top:6px;letter-spacing:.4px">Start. Start small. Start to finish.</div></td></tr>
<tr><td style="background:${GOLD};height:5px;line-height:5px;font-size:0">&nbsp;</td></tr>
<tr><td style="background:#ffffff;border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};padding:34px 36px 30px;font-family:${SANS}">
${kicker ? `<div style="font:700 12px ${SANS};color:${GOLD_DK};letter-spacing:1.6px;text-transform:uppercase;margin-bottom:10px">${esc(kicker)}</div>` : ''}
<h1 style="margin:0 0 22px;font:700 27px/1.25 ${SERIF};color:${TEAL}">${esc(headline)}</h1>
<p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:${INK}">${esc(greeting)}</p>
${body}${btn}
<p style="margin:26px 0 0;font-size:16px;line-height:1.6;color:${INK}">Karibu sana,<br><b style="color:${TEAL}">The Elimu+ team</b></p></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${BORDER};border-top:0;border-radius:0 0 12px 12px;padding:0 36px 22px"><div style="border-top:1px solid ${BORDER};padding-top:16px;font:12px/1.6 ${SANS};color:#5b6b68">${foot}<br>Elimu+ &middot; Likoni, Mombasa, Kenya &middot; <a href="mailto:hello@elimuplus.com" style="color:#5b6b68">hello@elimuplus.com</a></div></td></tr>
</table></td></tr></table></body></html>`;
  const text = [headline, '', greeting, '', ...paragraphs.flatMap((p) => [p, '']), ...(button ? [`${button.label}: ${button.url}`, ''] : []), 'Karibu sana,', 'The Elimu+ team', '', unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : ''].join('\n');
  return { html, text };
}

/** Always the first name only, so "Hello Wanjiru," and never a full name or an organisation. */
const first = (name?: string) => name?.trim().split(/\s+/)[0];
const hi = (name?: string) => (first(name) ? `Hello ${first(name)},` : 'Hello,');

export function welcomeEmail(name: string | undefined, unsubscribeUrl: string): Mail {
  const paragraphs = [
    'Thank you for joining the Elimu+ newsletter. Elimu+ is a practical employability and entrepreneurship programme that helps young people turn skills, ideas and effort into real value, clear income thinking and simple systems for action.',
    'Every so often we will send you something short and useful: what we are learning with participants, how to think about work and income, and news of our monthly seminars. If a message is not useful to you, you can unsubscribe with one click at the bottom of any email.',
    'You can reply to this email at any time; it comes straight to the team.',
  ];
  return { subject: 'Welcome to Elimu+', ...wrap({ greeting: hi(name), headline: first(name) ? `Karibu, ${first(name)}. You are on the list.` : 'Karibu. You are on the list.', kicker: 'Welcome', paragraphs, button: { label: 'Visit elimuplus.com', url: 'https://elimuplus.com' }, unsubscribeUrl }) };
}

export function orgConfirmEmail(name: string | undefined, organisation: string | undefined): Mail {
  const who = organisation?.trim() ? ` for ${organisation.trim()}` : '';
  const paragraphs = [
    `Thank you for registering your interest${who} with Elimu+. We have received your details.`,
    'One of our team will review them and be in touch within a few working days to talk about the next step. If anything changes in the meantime, simply reply to this email.',
  ];
  return { subject: 'We have received your Elimu+ registration', ...wrap({ greeting: hi(name), headline: 'We have received your registration', kicker: 'Organisation registration', paragraphs }) };
}

export function trainerConfirmEmail(name: string | undefined): Mail {
  const paragraphs = [
    'Thank you for your interest in training with Elimu+. We have received your expression of interest.',
    'We review every one carefully and will be in touch. If you would like to add anything, simply reply to this email.',
  ];
  return { subject: 'We have received your Elimu+ trainer interest', ...wrap({ greeting: hi(name), headline: 'Thank you for your interest in training', kicker: 'Trainer interest', paragraphs }) };
}

/** A weekly letter written in the portal: the body is plain text and a blank line starts a new paragraph. */
export function letterEmail(subject: string, body: string, name: string | undefined, unsubscribeUrl: string): Mail {
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return { subject, ...wrap({ greeting: hi(name), headline: subject.replace(/^\[Test\]\s*/, ''), kicker: 'Elimu+ weekly letter', paragraphs, unsubscribeUrl }) };
}
