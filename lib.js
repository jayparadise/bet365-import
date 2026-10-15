// Shared browser/Node logic for the bet365 -> DST data-entry importer.
// parseBet365Html, buildRows, norm, dice, resolvePlayer, matchFixtures, the seven field names.

export const FIELDS = ['shots', 'shots1_5Price', 'shotsOnGoal0_5Price', 'tackles0_5Price', 'assistPrice', 'cards', 'goals'];
export const FIELD_LABELS = ['Shots', 'Shots $', '0.5 SOT', '1.5 Tkl', 'Assist', 'Cards', 'Goals'];
export const TABS = ['Shots', 'Shots On Target', 'Tackles', 'Score or Assist', 'To Be Booked'];

const clean = s => (s || '').replace(/\s+/g, ' ').trim();
const price = s => (/^\d+\.\d+$/.test(s) ? Number(s) : null);

// Parse one "Webpage, Complete" save of a bet365 Weekend player-props tab.
// Returns { tab, games: [{ title, headers, rows: { bet365Name: [prices] } }] }
export function parseBet365Html(htmlText, Parser) {
  const doc = new Parser().parseFromString(htmlText, 'text/html');
  let tab = '';
  for (const b of doc.querySelectorAll('button[aria-selected="true"]')) {
    const t = clean(b.textContent).replace(/^(.+?)\1$/, '$1'); // label is repeated in two spans
    if (TABS.includes(t)) { tab = t; break; }
  }
  const games = [];
  for (const t of doc.querySelectorAll('div[class*="rrc-709"]')) {
    const title = clean(t.textContent);
    if (!title.includes(' v ')) continue;
    const card = t.closest('div[class*="rrc-e6"]');
    if (!card) continue;
    const rows = {};
    const add = (name, prices) => {
      const old = rows[name];
      if (!old) { rows[name] = prices; return; }
      const n = Math.max(old.length, prices.length);
      rows[name] = Array.from({ length: n }, (_, i) => old[i] ?? prices[i] ?? null);
    };
    const pc40 = card.querySelector('div[class*="rgl-Market-pwidth40"]');
    const pcols = [...card.querySelectorAll('div[class*="rgl-Market-pwidth"]')].filter(d => !String(d.className).includes('pwidth40'));
    const names = pc40 ? [...pc40.querySelectorAll('span[class*="rrd-f0"]')].map(x => clean(x.textContent)) : [];
    if (pcols.length && names.length) {
      const headers = [], cols = [];
      for (const pc of pcols) {
        const cells = [...pc.children];
        headers.push(clean(cells[0]?.textContent));
        cols.push(cells.slice(1).map(c => clean(c.textContent)));
      }
      if (cols.some(c => c.length !== names.length)) throw new Error(`${title}: column/name count mismatch (bet365 markup changed?)`);
      const rung = headers.map(h => /^(\d+)\+$/.exec(h));
      if (rung.every(Boolean)) {
        const width = Math.max(...rung.map(m => Number(m[1])));
        names.forEach((n, i) => {
          const p = Array(width).fill(null);
          rung.forEach((m, j) => { p[Number(m[1]) - 1] = price(cols[j][i]); });
          add(n, p);
        });
      } else {
        names.forEach((n, i) => add(n, cols.map(c => price(c[i]))));
      }
      games.push({ title, headers, rows });
    } else {
      for (const d of card.querySelectorAll('div')) {
        const ns = d.querySelector(':scope > span[class*="rgl-c1e976"]');
        const ps = d.querySelector(':scope > span[class*="rgl-4a5de5"]');
        if (ns && ps) add(clean(ns.textContent), [price(clean(ps.textContent))]);
      }
      games.push({ title, headers: ['booked'], rows });
    }
  }
  // Guess the tab from the headers when the selected button was not found.
  if (!tab && games.length) {
    const h = games[0].headers;
    if (h[0] === 'booked') tab = 'To Be Booked';
    else if (h.includes('Score') || h.includes('Assist')) tab = 'Score or Assist';
  }
  return { tab, games };
}

// Combine parsed tabs into the seven app values per player per game.
// tabs: { 'Shots': games, 'Shots On Target': games, 'Tackles': games, 'Score or Assist': games, 'To Be Booked': games }
export function buildRows(tabs) {
  const byTitle = {};
  const put = (title, name, i, v) => {
    const g = (byTitle[title] ??= {});
    (g[name] ??= Array(7).fill(null))[i] = v ?? null;
  };
  const closestTo188 = prices => {
    let best = null;
    prices.forEach((p, i) => {
      if (p == null) return;
      const d = Math.abs(p - 1.88);
      if (!best || d < best.d) best = { d, i, p };
    });
    return best;
  };
  for (const g of tabs['Shots'] ?? []) for (const [n, p] of Object.entries(g.rows)) {
    const b = closestTo188(p); if (b) { put(g.title, n, 0, b.i + 0.5); put(g.title, n, 1, b.p); }
  }
  for (const g of tabs['Shots On Target'] ?? []) for (const [n, p] of Object.entries(g.rows)) put(g.title, n, 2, p[0]);
  for (const g of tabs['Tackles'] ?? []) for (const [n, p] of Object.entries(g.rows)) put(g.title, n, 3, p[1]);
  for (const g of tabs['Score or Assist'] ?? []) {
    const si = g.headers.indexOf('Score'), ai = g.headers.indexOf('Assist');
    for (const [n, p] of Object.entries(g.rows)) { put(g.title, n, 6, si >= 0 ? p[si] : null); put(g.title, n, 4, ai >= 0 ? p[ai] : null); }
  }
  for (const g of tabs['To Be Booked'] ?? []) for (const [n, p] of Object.entries(g.rows)) put(g.title, n, 5, p[0]);
  return byTitle;
}

export const norm = s => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[-'`.]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).join(' ');

export function dice(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bg = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const A = bg(a), B = bg(b); let inter = 0;
  for (const [k, v] of A) if (B.has(k)) inter += Math.min(v, B.get(k));
  return 2 * inter / ((a.length - 1) + (b.length - 1));
}

// roster: [{player:{id,name,isActive}, team:{abbreviation}, ...fields}], aliases: {normBet365Name: playerId}
// Returns { byNorm, counts, resolve(name) -> [entries[], how] }
export function makeResolver(roster, aliases) {
  const byNorm = {}, byId = {}, counts = {};
  for (const p of roster) {
    const k = norm(p.player.name);
    counts[k] = (counts[k] || 0) + 1;
    (byNorm[k] ??= []).push(p);
    byId[p.player.id] = p;
  }
  const resolve = name => {
    const k = norm(name);
    if (aliases && aliases[k] && byId[aliases[k]]) { const p = byId[aliases[k]]; return [byNorm[norm(p.player.name)], 'alias']; }
    if (byNorm[k]) return [byNorm[k], 'exact'];
    const toks = new Set(k.split(' '));
    const hits = Object.keys(byNorm).filter(rn => { const rt = new Set(rn.split(' ')); return [...toks].every(t => rt.has(t)) || [...rt].every(t => toks.has(t)); });
    if (hits.length === 1) return [byNorm[hits[0]], 'token'];
    let best = null, bs = 0;
    for (const rn of Object.keys(byNorm)) { const s = dice(k, rn); if (s > bs) { bs = s; best = rn; } }
    if (bs >= 0.72) return [byNorm[best], 'fuzzy ' + bs.toFixed(2)];
    return [null, 'none'];
  };
  return { byNorm, byId, counts, resolve };
}

// ---- fixture (game title) matching ----
const TEAM_STOP = new Set(['fc', 'cf', 'sc', 'afc', 'cfc', 'club', 'de', 'the', 'rj', 'sp', 'rs', 'mg', 'pr', 'fk', 'sk', 'ac', 'as', 'ss', 'sv', 'fsv', 'bsc', 'rc', 'rcd', 'ud', 'cd', 'ca', 'sd', 'cr', 'se', 'fr', 'ec', 'cs', 'ca', '1', 'calcio', 'football', 'ks', 'nk', 'gnk', 'hnk', 'rsc', 'kv', 'kaa', 'osc', 'sm', 'ogc', 'us', 'ss', 'sa', 'bv', 'tsv', 'vfl', 'vfb', '04', '05', '96', '98', '1899', '1860', 'e.v']);
const TEAM_SUBS = { utd: 'united', st: 'saint', 'man': 'manchester', 'nottm': 'nottingham', 'atl': 'atletico', 'ath': 'athletic', 'psg': 'paris saint germain', 'bmg': 'borussia monchengladbach', 'gladbach': 'monchengladbach', 'wolves': 'wolverhampton wanderers', 'spurs': 'tottenham hotspur', 'ny': 'new york', 'kc': 'kansas city', 'rsl': 'real salt lake', 'rb': 'red bull', 'nyc': 'new york city', 'lafc': 'los angeles football club', 'nycfc': 'new york city', 'skc': 'sporting kansas city', 'rbny': 'new york red bulls', 'cfm': 'cf montreal' };
const tokHit = (t, B) => B.some(b => b === t || (t.length >= 4 && b.startsWith(t)) || (b.length >= 4 && t.startsWith(b)));
export function teamTokens(name) {
  let n = norm(name);
  for (const [a, b] of Object.entries(TEAM_SUBS)) n = n.replace(new RegExp(`(^| )${a}( |$)`, 'g'), `$1${b}$2`);
  return n.split(' ').filter(t => t && !TEAM_STOP.has(t));
}
export function teamScore(a, b) {
  const A = teamTokens(a), B = teamTokens(b);
  if (!A.length || !B.length) return 0;
  const shared = A.filter(t => tokHit(t, B)).length;
  const tok = shared / Math.min(A.length, B.length);
  return 0.7 * tok + 0.3 * dice(A.join(' '), B.join(' '));
}
// fixtures: [{id, homeTeam:{name}, awayTeam:{name}, date, progress:{status}}]; teamAliases: {normBet365Team: appTeamName}
// returns { fixture|null, score, candidates:[{fixture, score}] }
export function matchFixture(title, fixtures, teamAliases) {
  const [h, a] = title.split(' v ').map(s => s.trim());
  const ah = teamAliases?.[norm(h)], aa = teamAliases?.[norm(a)];
  const scored = fixtures.map(f => {
    let s = teamScore(h, f.homeTeam.name) + teamScore(a, f.awayTeam.name);
    if (ah && norm(f.homeTeam.name) === norm(ah)) s += 1;
    if (aa && norm(f.awayTeam.name) === norm(aa)) s += 1;
    return { fixture: f, score: s };
  }).sort((x, y) => y.score - x.score || String(x.fixture.date).localeCompare(String(y.fixture.date)));
  const best = scored[0];
  const ok = best && best.score >= 1.0 && (!scored[1] || best.score - scored[1].score >= 0.25);
  return { fixture: ok ? best.fixture : null, score: best ? best.score : 0, candidates: scored.slice(0, 6) };
}

export const same = (a, b) => Math.abs((a == null ? 0 : Number(a)) - (b == null ? 0 : Number(b))) < 0.006;
