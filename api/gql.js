import { svcGql, requireSession } from './_shared.js';

// POST { ops: [{ operationName, variables }], concurrency? }  ->  { results: [{ data } | { error }] }
// Runs the operations against the data-entry API as the service account, in parallel (default 8 at a time).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!requireSession(req, res)) return;
  const body = req.body || {};
  const ops = Array.isArray(body.ops) ? body.ops : [body];
  if (!ops.length || ops.length > 400) return res.status(400).json({ error: '1..400 ops per request' });
  if (ops.some(o => o.operationName === 'Login')) return res.status(400).json({ error: 'not allowed' });
  const conc = Math.min(Math.max(Number(body.concurrency) || 8, 1), 16);
  const results = new Array(ops.length);
  let i = 0;
  const worker = async () => {
    while (i < ops.length) {
      const idx = i++;
      const op = ops[idx];
      try { results[idx] = { data: await svcGql(op.operationName, op.variables || {}) }; }
      catch (e) { results[idx] = { error: String(e.message || e) }; }
    }
  };
  await Promise.all(Array.from({ length: conc }, worker));
  return res.status(200).json({ results });
}
