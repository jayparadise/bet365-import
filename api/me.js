import { gql, readCookie } from './_shared.js';
export default async function handler(req, res) {
  const token = readCookie(req);
  if (!token) return res.status(401).json({ error: 'not logged in' });
  try {
    const d = await gql(token, 'Me', {});
    return res.status(200).json({ user: d.me });
  } catch (e) {
    return res.status(401).json({ error: String(e.message || e) });
  }
}
