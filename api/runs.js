import { requireSession, readJson, writeJson } from './_shared.js';

const PATH = 'runs/index.json';
// GET -> { runs } (newest first, last 200 kept); POST { league, username, summary } -> append
export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  try {
    if (req.method === 'GET') {
      const runs = await readJson(PATH, []);
      return res.status(200).json({ runs: runs.slice(0, 30) });
    }
    if (req.method === 'POST') {
      const { league, username, summary } = req.body || {};
      const runs = await readJson(PATH, []);
      runs.unshift({ id: Date.now(), league, username, summary, created_at: new Date().toISOString() });
      await writeJson(PATH, runs.slice(0, 200));
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'GET/POST' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
