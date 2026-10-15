import { checkPassword, cookieHeader, SESSION_COOKIE, sessionValue, isProtected } from './_shared.js';

// POST { password } -> sets the team-session cookie (30 days)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!isProtected()) return res.status(200).json({ ok: true, protected: false });
  if (!checkPassword((req.body || {}).password)) return res.status(401).json({ error: 'wrong password' });
  res.setHeader('set-cookie', cookieHeader(SESSION_COOKIE, sessionValue(), 30 * 24 * 3600));
  return res.status(200).json({ ok: true, protected: true });
}
