import { requireSession, readJson, writeJson } from './_shared.js';

const path = league => `unmatched/${league.replace(/[^a-z0-9_-]/gi, '')}.json`;

// Names bet365 used that could not be matched, remembered per league so they can be mapped later.
// GET ?league=mls -> { items: [{ name, gameId, game, seen }] }
// POST { league, items: [{ name, gameId, game }] } -> merge (latest game wins)
// DELETE { league, names: [..] } -> remove
export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  try {
    const league = String((req.method === 'GET' ? req.query.league : (req.body || {}).league) || '');
    if (!league) return res.status(400).json({ error: 'league required' });
    if (req.method === 'GET') return res.status(200).json({ items: await readJson(path(league), []) });
    const list = await readJson(path(league), []);
    if (req.method === 'POST') {
      const items = Array.isArray(req.body.items) ? req.body.items : [];
      const by = Object.fromEntries(list.map(x => [x.name, x]));
      for (const it of items) if (it && it.name) by[it.name] = { name: it.name, gameId: it.gameId || null, game: it.game || null, seen: new Date().toISOString() };
      const out = Object.values(by).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 2000);
      await writeJson(path(league), out);
      return res.status(200).json({ ok: true, count: out.length });
    }
    if (req.method === 'DELETE') {
      const names = new Set(Array.isArray(req.body.names) ? req.body.names : []);
      const out = list.filter(x => !names.has(x.name));
      await writeJson(path(league), out);
      return res.status(200).json({ ok: true, count: out.length });
    }
    return res.status(405).json({ error: 'GET/POST/DELETE' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
