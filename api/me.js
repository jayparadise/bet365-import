import { requireSession, serviceToken, serviceUsername, isProtected } from './_shared.js';

// GET -> { protected, serviceUser } ; 401 when the team password cookie is missing
export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  try {
    await serviceToken();
    return res.status(200).json({ protected: isProtected(), serviceUser: serviceUsername() });
  } catch (e) {
    return res.status(500).json({ error: 'Data-entry service account login failed: ' + String(e.message || e) });
  }
}
