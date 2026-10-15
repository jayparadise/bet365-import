import { cookieHeader, SESSION_COOKIE } from './_shared.js';
export default async function handler(req, res) {
  res.setHeader('set-cookie', cookieHeader(SESSION_COOKIE, '', 0));
  res.status(200).json({ ok: true });
}
