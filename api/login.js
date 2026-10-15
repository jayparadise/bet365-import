import { gql, cookieHeader } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    const d = await gql(null, 'Login', { input: { username, password } });
    const { accessToken, user } = d.login;
    res.setHeader('set-cookie', cookieHeader(accessToken, 12 * 3600));
    return res.status(200).json({ user });
  } catch (e) {
    return res.status(401).json({ error: String(e.message || e) });
  }
}
