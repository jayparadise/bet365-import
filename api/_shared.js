// Server-side helpers: data-entry GraphQL proxy, cookie handling, Supabase REST.
export const DE_GRAPHQL = process.env.DATA_ENTRY_GRAPHQL || 'https://data-entry.digitalsportstech.com/graphql';
export const COOKIE = 'de_token';

// The only operations the proxy will forward. The query text lives here, so the browser never sends GraphQL.
export const QUERIES = {
  Login: `mutation Login($input: LoginInput!) { login(input: $input) { accessToken user { id username role } } }`,
  Me: `query Me { me { id username role } }`,
  UpcomingFixtures: `query UpcomingFixtures($filter: FixturesFilterInput) { upcomingFixtures(filter: $filter) { total fixtures { id leagueName homeTeam { name } awayTeam { name } date progress { status enteredPlayersCount totalPlayersCount } } } }`,
  GamePlayersDataEntry: `query GamePlayersDataEntry($gameId: String!, $filter: GamePlayersFilterInput) { gamePlayersDataEntry(gameId: $gameId, filter: $filter) { gameId homeTeamName awayTeamName status homeTeamPlayers { player { id name isActive } team { abbreviation } shots shots1_5Price shotsOnGoal0_5Price assistPrice tackles0_5Price cards goals } awayTeamPlayers { player { id name isActive } team { abbreviation } shots shots1_5Price shotsOnGoal0_5Price assistPrice tackles0_5Price cards goals } } }`,
  SavePlayerMarket: `mutation SavePlayerMarket($input: SavePlayerMarketInput!) { savePlayerMarket(input: $input) }`,
  MarkFixtureCompleted: `mutation MarkFixtureCompleted($gameId: String!, $completed: Boolean!) { markFixtureCompleted(gameId: $gameId, completed: $completed) }`,
};

export async function gql(token, operationName, variables) {
  const query = QUERIES[operationName];
  if (!query) throw new Error('operation not allowed: ' + operationName);
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  const r = await fetch(DE_GRAPHQL, { method: 'POST', headers, body: JSON.stringify({ operationName, variables, query }) });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { throw new Error(`data-entry API returned ${r.status}: ${text.slice(0, 120)}`); }
  if (j.errors && j.errors.length) throw new Error(j.errors.map(e => e.message).join('; '));
  return j.data;
}

export function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
export function cookieHeader(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

// ---- team password gate (APP_PASSWORD). Unset = page is open. ----
import { createHmac, timingSafeEqual } from 'node:crypto';
export const SESSION_COOKIE = 'app_session';
export const isProtected = () => Boolean(process.env.APP_PASSWORD);
export const sessionValue = () => createHmac('sha256', process.env.APP_PASSWORD).update('bet365-import-session-v1').digest('hex');
export function checkPassword(pw) {
  const want = Buffer.from(String(process.env.APP_PASSWORD || '')), got = Buffer.from(String(pw || ''));
  return want.length > 0 && want.length === got.length && timingSafeEqual(want, got);
}
export function requireSession(req, res) {
  if (!isProtected()) return true;
  const c = readCookie(req, SESSION_COOKIE);
  const want = sessionValue();
  if (c && c.length === want.length && timingSafeEqual(Buffer.from(c), Buffer.from(want))) return true;
  res.status(401).json({ error: 'team password required' });
  return false;
}

// ---- data-entry service account (DE_USERNAME / DE_PASSWORD), token cached per function instance ----
let svc = { token: null, at: 0, username: null };
export async function serviceToken(force = false) {
  if (!force && svc.token && Date.now() - svc.at < 8 * 3600 * 1000) return svc.token;
  const username = process.env.DE_USERNAME, password = process.env.DE_PASSWORD;
  if (!username || !password) throw new Error('DE_USERNAME / DE_PASSWORD not configured in Vercel');
  const d = await gql(null, 'Login', { input: { username, password } });
  svc = { token: d.login.accessToken, at: Date.now(), username: d.login.user?.username || username };
  return svc.token;
}
export const serviceUsername = () => svc.username || process.env.DE_USERNAME || null;
// Run one data-entry operation as the service account, re-logging in once if the token was rejected.
export async function svcGql(operationName, variables) {
  try { return await gql(await serviceToken(), operationName, variables); }
  catch (e) {
    if (/unauth|jwt|token|expired|forbidden/i.test(String(e.message))) return gql(await serviceToken(true), operationName, variables);
    throw e;
  }
}

import { get, put } from '@vercel/blob';

// Small JSON documents in the project's private Blob store (BLOB_READ_WRITE_TOKEN is injected by Vercel).
export async function readJson(pathname, fallback) {
  try {
    const r = await get(pathname, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200) return fallback;
    const text = await new Response(r.stream).text();
    return text ? JSON.parse(text) : fallback;
  } catch (e) {
    if (e && /not.?found/i.test(String(e.name || e.message))) return fallback;
    throw e;
  }
}
export async function writeJson(pathname, value) {
  await put(pathname, JSON.stringify(value), { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' });
}
