import { gql, requireToken } from './_shared.js';

// POST { ops: [{ operationName, variables }], concurrency? }  ->  { results: [{ data } | { error }] }
// Runs the operations against the data-entry API in parallel (default 8 at a time).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const token = requireToken(req, res); if (!token) return;
  const body = req.body || {};
  const ops = Array.isArray(body.ops) ? body.ops : [body];
  if (!ops.length || ops.length > 400) return res.status(400).json({ error: '1..400 ops per request' });
  const conc = Math.min(Math.max(Number(body.concurrency) || 8, 1), 16);
  const results = new Array(ops.length);
  let i = 0;
  const worker = async () => {
    while (i < ops.length) {
      const idx = i++;
      const op = ops[idx];
      try { results[idx] = { data: await gql(token, op.operationName, op.variables || {}) }; }
      catch (e) { results[idx] = { error: String(e.message || e) }; }
    }
  };
  await Promise.all(Array.from({ length: conc }, worker));
  const auth = results.find(r => r.error && /unauth|jwt|token|expired/i.test(r.error));
  if (auth && results.every(r => r.error)) return res.status(401).json({ error: 'session expired, log in again' });
  return res.status(200).json({ results });
}
