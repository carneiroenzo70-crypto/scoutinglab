const test = require('node:test');
const assert = require('node:assert');

process.env.SESSION_SECRET = 'test-secret';
process.env.UPSTASH_URL = 'https://mock-upstash';
process.env.UPSTASH_TOKEN = 'mock';
process.env.RIOT_API_KEY = 'RGAPI-test';

const { signToken } = require('../api/_auth');
const handler = require('../api/riot');

function mockRes() {
  return {
    _status: 0, _body: null, _headers: {},
    setHeader(k, v) { this._headers[k] = String(v); },
    status(c) { this._status = c; return this; },
    json(o) { this._body = o; return this; },
    send(t) { this._body = t; return this; },
    end() { return this; }
  };
}

// Simule Upstash (commande JSON en POST) ET l'API Riot (GET) sur global.fetch.
// `riotCalls` compte les appels réellement partis chez Riot.
function mockNet(store, riotCalls, riotReply) {
  global.fetch = async (url, opts) => {
    if (String(url).startsWith(process.env.UPSTASH_URL)) {
      const cmd = JSON.parse(opts.body);
      let result = null;
      if (cmd[0] === 'GET') result = store[cmd[1]] != null ? store[cmd[1]] : null;
      else if (cmd[0] === 'SET') { store[cmd[1]] = cmd[2]; result = 'OK'; }
      return { ok: true, json: async () => ({ result }) };
    }
    riotCalls.push(String(url));
    const r = riotReply || { status: 200, body: '{"metadata":{"matchId":"EUW1_1"},"info":{"gameDuration":1800}}' };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => r.body,
      headers: { get: (h) => (r.headers || {})[h.toLowerCase()] || null }
    };
  };
}

const MATCH_URL = 'https://europe.api.riotgames.com/lol/match/v5/matches/EUW1_1';
const auth = () => ({ authorization: 'Bearer ' + signToken({ u: 'acme' }, 3600) });

test('match jamais vu : appelle Riot puis met en cache', async () => {
  const store = {}, riot = [];
  mockNet(store, riot);
  const res = mockRes();
  await handler({ method: 'GET', headers: auth(), query: { url: encodeURIComponent(MATCH_URL) } }, res);
  assert.equal(res._status, 200);
  assert.equal(riot.length, 1, 'un appel Riot attendu');
  assert.equal(res._headers['X-VS-Cache'], 'miss');
  assert.ok(store['vs_match:EUW1_1'], 'le match doit être mis en cache');
});

test('match déjà en cache : ZÉRO appel Riot (donc zéro quota consommé)', async () => {
  const store = { 'vs_match:EUW1_1': '{"metadata":{"matchId":"EUW1_1"}}' };
  const riot = [];
  mockNet(store, riot);
  const res = mockRes();
  await handler({ method: 'GET', headers: auth(), query: { url: encodeURIComponent(MATCH_URL) } }, res);
  assert.equal(res._status, 200);
  assert.equal(riot.length, 0, 'aucun appel Riot ne doit partir');
  assert.equal(res._headers['X-VS-Cache'], 'hit');
  assert.match(String(res._body), /EUW1_1/);
});

test('la timeline est cachée séparément', async () => {
  const store = {}, riot = [];
  mockNet(store, riot);
  const res = mockRes();
  await handler({ method: 'GET', headers: auth(), query: { url: encodeURIComponent(MATCH_URL + '/timeline') } }, res);
  assert.ok(store['vs_match:EUW1_1:tl'], 'clé timeline distincte attendue');
});

test('les données mouvantes ne sont JAMAIS cachées', async () => {
  const store = {}, riot = [];
  mockNet(store, riot);
  // liste d'IDs (change à chaque partie) + entrées de ligue (changent avec le LP)
  for (const u of [
    'https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/abc/ids?count=50',
    'https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/abc'
  ]) {
    const res = mockRes();
    await handler({ method: 'GET', headers: auth(), query: { url: encodeURIComponent(u) } }, res);
    assert.equal(res._headers['X-VS-Cache'], 'bypass');
  }
  assert.deepEqual(Object.keys(store), [], 'rien ne doit être mis en cache');
});

test('429 : relaie le délai réel annoncé par Riot', async () => {
  const store = {}, riot = [];
  mockNet(store, riot, { status: 429, body: '{}', headers: { 'retry-after': '42' } });
  const res = mockRes();
  await handler({ method: 'GET', headers: auth(), query: { url: encodeURIComponent(MATCH_URL) } }, res);
  assert.equal(res._status, 429);
  assert.equal(res._body.retryAfter, 42);
  assert.equal(res._headers['Retry-After'], '42');
  assert.equal(store['vs_match:EUW1_1'], undefined, 'une erreur ne doit pas être cachée');
});

test('refuse sans token', async () => {
  const res = mockRes();
  await handler({ method: 'GET', headers: {}, query: { url: encodeURIComponent(MATCH_URL) } }, res);
  assert.equal(res._status, 401);
});
