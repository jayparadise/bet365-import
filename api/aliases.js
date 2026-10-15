import { requireToken, readJson, writeJson } from './_shared.js';

const path = league => `aliases/${league.replace(/[^a-z0-9_-]/gi, '')}.json`;

// GET  ?league=mls  -> { aliases: [{ kind, bet365_name, app_id, app_name, created_by, created_at }] }
// POST { league, kind, bet365Name, appId, appName, createdBy } -> upsert (keyed by kind + bet365 name)
// DELETE { league, kind, bet365Name }
export default async function handler(req, res) {
  const token = requireToken(req, res); if (!token) return;
  try {
    if (req.method === 'GET') {
      const league = String(req.query.league || '');
      if (!league) return res.status(400).json({ error: 'league required' });
      return res.status(200).json({ aliases: await readJson(path(league), []) });
    }
    if (req.method === 'POST' || req.method === 'DELETE') {
      const { league, kind, bet365Name, appId, appName, createdBy } = req.body || {};
      if (!league || !kind || !bet365Name || (req.method === 'POST' && !appId)) return res.status(400).json({ error: 'league, kind, bet365Name, appId required' });
      const list = await readJson(path(league), []);
      const keep = list.filter(a => !(a.kind === kind && a.bet365_name === bet365Name));
      if (req.method === 'POST') keep.push({ kind, bet365_name: bet365Name, app_id: appId, app_name: appName || null, created_by: createdBy || null, created_at: new Date().toISOString() });
      await writeJson(path(league), keep);
      return res.status(200).json({ ok: true, count: keep.length });
    }
    return res.status(405).json({ error: 'GET/POST/DELETE' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
