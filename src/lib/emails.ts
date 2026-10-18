const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export type Mail = { subject: string; html: string; text: string };

const TEAL = '#0D3B3B', GOLD = '#D4A843', GOLD_DK = '#8C661A', MIST = '#F5FAF8', BORDER = '#E0EDE9', INK = '#1A1A1A', MUTED = '#4A5A56';
const FONT = "Calibri,Lato,Arial,sans-serif";
const SITE = 'https://elimuplus.com';

/** Text-only fallback: strips the letter markup down to readable plain text. */
const plain = (s: string) => s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '').replace(/\[(?:button2?|gold)\s*:\s*([^\]]+)\]\(([^)]+)\)/gi, '$1: $2').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^(##\s+|>\s*|-\s+|stat:\s*)/gm, '');

/** Adds tracking tags to links back to our own website so you can see in analytics what the letters bring. */
const tagged = (u: string) => (/^https:\/\/(www\.)?elimuplus\.com/i.test(u) && !/utm_source=/.test(u) ? `${u}${u.includes('?') ? '&' : '?'}utm_source=newsletter&utm_medium=email&utm_campaign=weekly` : u);

/** Inline formatting: **bold** and [text](link). Input is escaped first, so nothing typed can inject HTML. */
const inline = (s: string) => esc(s)
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, (_m, txt, url) => `<a href="${tagged(url)}" style="color:${TEAL};text-decoration:underline">${txt}</a>`);

const P = (s: string) => `<tr><td class="pad" style="padding:0 32px 14px 32px;font-size:16px;line-height:1.6;color:${INK}">${inline(s)}</td></tr>`;
const BTN: Record<string, string> = {
  button: `background:${TEAL};color:#FFFFFF;padding:11px 20px;border:0`,
  gold: `background:${GOLD};color:${TEAL};padding:11px 20px;border:0`,
  button2: `background:#FFFFFF;color:${TEAL};padding:9px 18px;border:2px solid ${TEAL}`,
};
const btn = (kind: string, label: string, url: string) => `<a href="${tagged(url)}" style="display:inline-block;${BTN[kind] ?? BTN.button};font-weight:bold;font-size:15px;text-decoration:none;border-radius:4px;margin:0 8px 8px 0">${esc(label)}</a>`;
const BTN_RE = /^\[(button2?|gold)\s*:\s*([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/i;
const IMG_RE = /^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/;

/**
 * Turns a letter written in plain text into the branded email body. What you can write:
 *   blank line            new paragraph            ## Heading             a section heading
 *   ![caption](image url)  a full-width picture (the first one becomes the banner under the header)
 *   [text](link)  **bold**  - bullet point
 *   [button: Label](link)  [gold: Label](link)  [button2: Label](link)   buttons (teal, gold, outlined); lines next to each other sit side by side
 *   stat: 8 of 10 | businesses operating    up to three in a row make number cards
 *   > Title / > text / > [gold: Label](link)   a dark highlight box
 */
function render(src: string): { hero: string; rows: string } {
  const blocks = src.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  let hero = '';
  const rows: string[] = [];
  blocks.forEach((block, bi) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const first = lines[0];
    if (lines.length === 1 && IMG_RE.test(first)) {
      const [, cap, url] = first.match(IMG_RE)!;
      const img = `<img src="${url}" width="600" alt="${esc(cap)}" style="width:100%;height:auto;display:block;border:0">`;
      if (bi === 0 && !hero) { hero = `<tr><td>${img}</td></tr>` + (cap ? `<tr><td class="pad" style="padding:6px 32px 0 32px;font-size:12px;color:#6B7B77">${esc(cap)}</td></tr>` : ''); return; }
      rows.push(`<tr><td style="padding:6px 0 0 0">${img}</td></tr>` + (cap ? `<tr><td class="pad" style="padding:6px 32px 14px 32px;font-size:12px;color:#6B7B77">${esc(cap)}</td></tr>` : ''));
    } else if (first.startsWith('## ')) {
      rows.push(`<tr><td class="pad" style="padding:18px 32px 8px 32px"><h2 style="margin:0;font-size:22px;color:${TEAL}">${esc(first.slice(3))}</h2></td></tr>`);
      lines.slice(1).forEach((l) => rows.push(P(l)));
    } else if (lines.every((l) => BTN_RE.test(l))) {
      rows.push(`<tr><td class="pad" style="padding:6px 32px 18px 32px">${lines.map((l) => { const m = l.match(BTN_RE)!; return btn(m[1].toLowerCase(), m[2], m[3]); }).join('')}</td></tr>`);
    } else if (lines.every((l) => /^stat:/i.test(l))) {
      const cells = lines.slice(0, 3).map((l, i, arr) => { const [num, ...rest] = l.replace(/^stat:\s*/i, '').split('|'); return `<td class="stat" width="${Math.floor(100 / arr.length)}%" valign="top" style="padding:0 ${i < arr.length - 1 ? 6 : 0}px 0 ${i ? 6 : 0}px"><div style="background:${MIST};border:1px solid ${BORDER};border-radius:6px;padding:14px"><div style="font-size:26px;font-weight:bold;color:${TEAL}">${esc(num.trim())}</div><div style="font-size:13px;line-height:1.4;color:${MUTED}">${esc(rest.join('|').trim())}</div></div></td>`; }).join('');
      rows.push(`<tr><td class="pad" style="padding:6px 32px 18px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table></td></tr>`);
    } else if (lines.every((l) => l.startsWith('>'))) {
      const inner = lines.map((l) => l.replace(/^>\s?/, ''));
      const last = inner[inner.length - 1], hasBtn = BTN_RE.test(last);
      const bodyLines = inner.slice(1, hasBtn ? -1 : undefined);
      const m = hasBtn ? last.match(BTN_RE)! : null;
      rows.push(`<tr><td class="pad" style="padding:8px 32px 18px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${TEAL};border-radius:6px"><tr><td style="padding:20px 22px"><div style="font-size:18px;font-weight:bold;color:#FFFFFF;margin-bottom:6px">${esc(inner[0])}</div>${bodyLines.map((l) => `<div style="font-size:15px;line-height:1.55;color:#CFE3DE;margin-bottom:10px">${esc(l)}</div>`).join('')}${m ? btn('gold', m[2], m[3]) : ''}</td></tr></table></td></tr>`);
    } else if (lines.every((l) => /^-\s+/.test(l))) {
      rows.push(`<tr><td class="pad" style="padding:0 32px 14px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:16px;line-height:1.55;color:${INK}">${lines.map((l) => `<tr><td valign="top" width="26" style="color:${GOLD};font-size:20px;line-height:1.3">&#9679;</td><td style="padding-bottom:8px">${inline(l.replace(/^-\s+/, ''))}</td></tr>`).join('')}</table></td></tr>`);
    } else {
      rows.push(P(lines.join(' ')));
    }
  });
  return { hero, rows: rows.join('\n') };
}

/** One shared look for every automatic email, matching the Elimu+ newsletter: teal header with the logo, gold stripe, optional banner picture, headline, body, dark footer. */
function wrap(opts: { greeting: string; headline: string; kicker?: string; body: string; banner?: { image: string; alt: string }; button?: { label: string; url: string }; unsubscribeUrl?: string }): Pick<Mail, 'html' | 'text'> {
  const { greeting, headline, kicker, body, button, unsubscribeUrl, banner } = opts;
  const r = render(body);
  const rows = r.rows;
  const hero = r.hero || (banner ? `<tr><td><img src="${SITE}/images/${banner.image}" width="600" alt="${esc(banner.alt)}" style="width:100%;height:auto;display:block;border:0"></td></tr>` : '');
  const month = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Africa/Nairobi' });
  const foot = unsubscribeUrl
    ? `You are receiving this because you joined the Elimu+ mailing list. We use your details only to send you our letters.<br><a href="${unsubscribeUrl}" style="color:${GOLD}">Unsubscribe</a> in one click &middot; <a href="${SITE}/privacy.html" style="color:${GOLD}">Privacy notice</a>`
    : `You are receiving this because you registered with Elimu+.<br><a href="${SITE}/privacy.html" style="color:${GOLD}">Privacy notice</a>`;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(headline)}</title>
<style>body{margin:0;padding:0;background:${MIST}}img{border:0;outline:none;text-decoration:none;display:block}a{color:${TEAL}}@media only screen and (max-width:620px){.wrap{width:100%!important}.pad{padding-left:20px!important;padding-right:20px!important}.stat{display:block!important;width:100%!important;padding:0 0 12px 0!important}h1{font-size:26px!important}}</style></head>
<body style="margin:0;padding:0;background:${MIST}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MIST}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#FFFFFF;border-radius:6px;overflow:hidden;font-family:${FONT};color:${INK}">
<tr><td class="pad" style="background:${TEAL};padding:22px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="56" valign="middle"><img src="${SITE}/images/logo-elimu-white.png" width="52" alt="Elimu+" style="width:52px;height:auto"></td>
<td valign="middle" style="padding-left:10px"><div style="font-size:22px;font-weight:bold;color:#FFFFFF;letter-spacing:.5px">Elimu<span style="color:${GOLD}">+</span></div><div style="font-size:13px;color:#CFE3DE">Likoni, Mombasa &middot; ${month}</div></td></tr></table></td></tr>
<tr><td style="background:${GOLD};height:4px;line-height:4px;font-size:4px">&nbsp;</td></tr>
${hero}
<tr><td class="pad" style="padding:22px 32px 6px 32px">${kicker ? `<div style="font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:${GOLD_DK};font-weight:bold">${esc(kicker)}</div>` : ''}<h1 style="margin:6px 0 14px 0;font-size:30px;line-height:1.2;color:${TEAL}">${esc(headline)}</h1><p style="margin:0;font-size:16px;line-height:1.6">${esc(greeting)}</p></td></tr>
<tr><td style="font-size:0;line-height:10px">&nbsp;</td></tr>
${rows}
${button ? `<tr><td class="pad" style="padding:4px 32px 18px 32px">${btn('button', button.label, button.url)}</td></tr>` : ''}
<tr><td class="pad" style="padding:14px 32px 30px 32px"><p style="margin:0;font-size:16px;line-height:1.6">Karibu sana,<br><b style="color:${TEAL}">The Elimu+ team</b></p></td></tr>
<tr><td class="pad" style="background:${TEAL};padding:22px 32px;font-size:13px;line-height:1.6;color:#CFE3DE"><div style="color:#FFFFFF;font-weight:bold;margin-bottom:4px">Elimu+ &middot; Simply Building Sustainable Businesses</div>Likoni, Mombasa, Kenya &middot; <a href="mailto:hello@elimuplus.com" style="color:${GOLD}">hello@elimuplus.com</a> &middot; <a href="https://wa.me/254798639546" style="color:${GOLD}">WhatsApp +254 798 639 546</a><br><br>${foot}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [headline, '', greeting, '', plain(body), '', ...(button ? [`${button.label}: ${button.url}`, ''] : []), 'Karibu sana,', 'The Elimu+ team', '', unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : ''].join('\n');
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
  return { subject: 'Welcome to Elimu+', ...wrap({ greeting: hi(name), headline: first(name) ? `Karibu, ${first(name)}. You are on the list.` : 'Karibu. You are on the list.', kicker: 'Welcome', banner: { image: 'home-community.jpg', alt: 'The Elimu+ community in Likoni' }, body: paragraphs.join('\n\n'), button: { label: 'Visit elimuplus.com', url: 'https://elimuplus.com' }, unsubscribeUrl }) };
}

export function orgConfirmEmail(name: string | undefined, organisation: string | undefined): Mail {
  const who = organisation?.trim() ? ` for ${organisation.trim()}` : '';
  const paragraphs = [
    `Thank you for registering your interest${who} with Elimu+. We have received your details.`,
    'One of our team will review them and be in touch within a few working days to talk about the next step. If anything changes in the meantime, simply reply to this email.',
  ];
  return { subject: 'We have received your Elimu+ registration', ...wrap({ greeting: hi(name), headline: 'We have received your registration', kicker: 'Organisation registration', banner: { image: 'partner-church-hall.jpg', alt: 'Elimu+ training in a community hall' }, body: paragraphs.join('\n\n') }) };
}

export function trainerConfirmEmail(name: string | undefined): Mail {
  const paragraphs = [
    'Thank you for your interest in training with Elimu+. We have received your expression of interest.',
    'We review every one carefully and will be in touch. If you would like to add anything, simply reply to this email.',
  ];
  return { subject: 'We have received your Elimu+ trainer interest', ...wrap({ greeting: hi(name), headline: 'Thank you for your interest in training', kicker: 'Trainer interest', banner: { image: 'trainer-coaching.jpg', alt: 'An Elimu+ trainer coaching participants' }, body: paragraphs.join('\n\n') }) };
}

/** A weekly letter written in the portal: the body is plain text and a blank line starts a new paragraph. */
export function letterEmail(subject: string, body: string, name: string | undefined, unsubscribeUrl: string): Mail {
  return { subject, ...wrap({ greeting: hi(name), headline: subject.replace(/^\[Test\]\s*/, ''), kicker: 'Elimu+ weekly letter', body, unsubscribeUrl }) };
}
