import { requireSession, readJson, writeJson } from './_shared.js';

const INDEX = 'runs/index.json';
const detailPath = id => `runs/${id}.json`;
// GET                -> { runs } (summaries, newest first, last 30)
// GET ?id=<run id>   -> { run } full detail (every row written)
// GET ?q=<name>&league=<optional>&limit=<runs to scan, default 40> -> { hits: [...] } rows whose bet365 or app name contains q
// POST { league, username, summary, detail } -> store summary in the index and the detail in its own file
export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  try {
    if (req.method === 'GET') {
      const { id, q, league } = req.query;
      if (id) return res.status(200).json({ run: await readJson(detailPath(String(id).replace(/[^0-9]/g, '')), null) });
      const index = await readJson(INDEX, []);
      if (q) {
        const needle = String(q).toLowerCase();
        const limit = Math.min(Number(req.query.limit) || 40, 200);
        const runs = index.filter(r => !league || r.league === league).slice(0, limit);
        const hits = [];
        for (const r of runs) {
          const d = await readJson(detailPath(r.id), null);
          if (!d || !d.rows) continue;
          for (const row of d.rows) {
            if (String(row.bet365 || '').toLowerCase().includes(needle) || String(row.player || '').toLowerCase().includes(needle)) hits.push({ runId: r.id, at: r.created_at, league: r.league, username: r.username, ...row });
          }
          if (hits.length > 500) break;
        }
        return res.status(200).json({ hits });
      }
      return res.status(200).json({ runs: index.slice(0, 30) });
    }
    if (req.method === 'POST') {
      const { league, username, summary, detail } = req.body || {};
      const id = Date.now();
      const index = await readJson(INDEX, []);
      index.unshift({ id, league, username, summary, created_at: new Date().toISOString() });
      await writeJson(INDEX, index.slice(0, 500));
      if (detail) await writeJson(detailPath(id), { id, league, username, created_at: new Date().toISOString(), ...detail });
      return res.status(200).json({ ok: true, id });
    }
    return res.status(405).json({ error: 'GET/POST' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
