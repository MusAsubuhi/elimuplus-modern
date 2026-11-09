// Vercel serverless function: adds a person to Brevo, but only with explicit consent.
// Setup (done by the site owner in Vercel > Project > Settings > Environment Variables, never in chat or in the repo):
//   BREVO_API_KEY          required. A Brevo API key (v3).
//   BREVO_LIST_NEWSLETTER  optional. List id for the newsletter. Default 3 ("Elimu+ Newsletter").
//   BREVO_LIST_PARTNERS    optional. List id for partner and trainer sign-ups. Falls back to the newsletter list.
const ALLOWED = ['https://elimuplus.com', 'https://www.elimuplus.com'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const okOrigin = ALLOWED.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);
  if (okOrigin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  if (!okOrigin) return res.status(403).json({ ok: false, error: 'origin not allowed' });

  const key = process.env.BREVO_API_KEY;
  if (!key) return res.status(503).json({ ok: false, error: 'not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  if (body.website) return res.status(200).json({ ok: true });            // honeypot: pretend success
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return res.status(400).json({ ok: false, error: 'invalid email' });
  if (body.consent !== 'yes') return res.status(400).json({ ok: false, error: 'consent required' });

  const newsletter = parseInt(process.env.BREVO_LIST_NEWSLETTER || '3', 10);
  const partners = parseInt(process.env.BREVO_LIST_PARTNERS || '', 10);
  const kind = String(body.source || 'newsletter');
  const listId = (kind === 'partner' || kind === 'org' || kind === 'trainer') && partners ? partners : newsletter;

  const first = String(body.name || '').trim().split(/\s+/)[0].slice(0, 60);
  const payload = { email, listIds: [listId], updateEnabled: true };
  if (first) payload.attributes = { FIRSTNAME: first };

  try {
    const r = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload)
    });
    if (r.ok || r.status === 204) return res.status(200).json({ ok: true });
    return res.status(502).json({ ok: false, error: 'brevo ' + r.status });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'network' });
  }
};
