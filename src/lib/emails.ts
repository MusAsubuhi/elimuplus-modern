const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export type Mail = { subject: string; html: string; text: string };

/** One shared look for every automatic email: plain, readable on a phone, with the unsubscribe link in the footer when one applies. */
function wrap(opts: { greeting: string; paragraphs: string[]; button?: { label: string; url: string }; unsubscribeUrl?: string }): Pick<Mail, 'html' | 'text'> {
  const { greeting, paragraphs, button, unsubscribeUrl } = opts;
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.6">${esc(p)}</p>`).join('');
  const btn = button ? `<p style="margin:24px 0"><a href="${button.url}" style="background:#0b3d2e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block;font-weight:600">${esc(button.label)}</a></p>` : '';
  const foot = unsubscribeUrl
    ? `You are receiving this because you agreed to hear from Elimu+. <a href="${unsubscribeUrl}" style="color:#6b7280">Unsubscribe</a> at any time.`
    : 'You are receiving this because you registered with Elimu+.';
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:Arial,Helvetica,sans-serif;color:#1f2933"><div style="max-width:560px;margin:0 auto;padding:28px 20px"><p style="font-size:20px;font-weight:700;color:#0b3d2e;margin:0 0 20px">Elimu+</p><div style="background:#fff;border-radius:8px;padding:28px"><p style="margin:0 0 16px">${esc(greeting)}</p>${body}${btn}<p style="margin:0">The Elimu+ team</p></div><p style="font-size:12px;color:#6b7280;line-height:1.5;margin:16px 4px 0">${foot}<br>Elimu+, Kenya &middot; hello@elimuplus.com</p></div></body></html>`;
  const text = [greeting, '', ...paragraphs.flatMap((p) => [p, '']), ...(button ? [`${button.label}: ${button.url}`, ''] : []), 'The Elimu+ team', '', unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : ''].join('\n');
  return { html, text };
}

const hi = (name?: string) => (name?.trim() ? `Hello ${name.trim()},` : 'Hello,');

export function welcomeEmail(name: string | undefined, unsubscribeUrl: string): Mail {
  const paragraphs = [
    'Thank you for joining the Elimu+ newsletter. Elimu+ is a practical employability and entrepreneurship programme that helps young people turn skills, ideas and effort into real value, clear income thinking and simple systems for action.',
    'Every so often we will send you something short and useful: what we are learning with participants, how to think about work and income, and news of our monthly seminars. If a message is not useful to you, you can unsubscribe with one click at the bottom of any email.',
    'You can reply to this email at any time; it comes straight to the team.',
  ];
  return { subject: 'Welcome to Elimu+', ...wrap({ greeting: hi(name), paragraphs, button: { label: 'Visit elimuplus.com', url: 'https://elimuplus.com' }, unsubscribeUrl }) };
}

export function orgConfirmEmail(name: string | undefined, organisation: string | undefined): Mail {
  const who = organisation?.trim() ? ` for ${organisation.trim()}` : '';
  const paragraphs = [
    `Thank you for registering your interest${who} with Elimu+. We have received your details.`,
    'One of our team will review them and be in touch within a few working days to talk about the next step. If anything changes in the meantime, simply reply to this email.',
  ];
  return { subject: 'We have received your Elimu+ registration', ...wrap({ greeting: hi(name), paragraphs }) };
}

export function trainerConfirmEmail(name: string | undefined): Mail {
  const paragraphs = [
    'Thank you for your interest in training with Elimu+. We have received your expression of interest.',
    'We review every one carefully and will be in touch. If you would like to add anything, simply reply to this email.',
  ];
  return { subject: 'We have received your Elimu+ trainer interest', ...wrap({ greeting: hi(name), paragraphs }) };
}

/** A weekly letter written in the portal: the body is plain text and a blank line starts a new paragraph. */
export function letterEmail(subject: string, body: string, name: string | undefined, unsubscribeUrl: string): Mail {
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return { subject, ...wrap({ greeting: hi(name), paragraphs, unsubscribeUrl }) };
}
