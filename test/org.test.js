const test = require('node:test');
const assert = require('node:assert');

process.env.SESSION_SECRET = 'test-secret';
process.env.UPSTASH_URL = 'https://mock';
process.env.UPSTASH_TOKEN = 'mock';

const { orgOfUser, orgOfToken } = require('../api/_auth');

test('orgOfUser : repli sur le nom de compte quand org est absent', () => {
  assert.equal(orgOfUser({ username: 'galions' }), 'galions');
});

test('orgOfUser : renvoie org quand il est présent', () => {
  assert.equal(orgOfUser({ username: 'alan', org: 'galions' }), 'galions');
});

test('orgOfToken : repli sur u pour les tokens émis avant la migration', () => {
  assert.equal(orgOfToken({ u: 'galions' }), 'galions');
});

test('orgOfToken : renvoie org quand il est présent', () => {
  assert.equal(orgOfToken({ u: 'alan', org: 'galions' }), 'galions');
});

const { hashPassword, signToken, verifyToken } = require('../api/_auth');
const loginHandler = require('../api/login');

function mockRes() {
  return {
    _status: 0, _json: null,
    setHeader() {}, status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; }, end() { return this; }
  };
}

// Faux Upstash en mémoire, piloté via global.fetch (comme _auth.upstash).
function mockUpstash(store) {
  global.fetch = async (_url, opts) => {
    const cmd = JSON.parse(opts.body);
    const op = cmd[0], key = cmd[1], val = cmd[2];
    let result = null;
    if (op === 'GET') result = store[key] != null ? store[key] : null;
    else if (op === 'SET') { store[key] = val; result = 'OK'; }
    else if (op === 'DEL') { delete store[key]; result = 1; }
    else if (op === 'INCR') { store[key] = String((+store[key] || 0) + 1); result = +store[key]; }
    else if (op === 'EXPIRE') result = 1;
    else if (op === 'SADD') result = 1;
    else if (op === 'SMEMBERS') result = [];
    else if (op === 'MGET') result = cmd.slice(1).map(k => (store[k] != null ? store[k] : null));
    else if (op === 'LPUSH') { (store[key] = store[key] || []).unshift(val); result = store[key].length; }
    else if (op === 'LRANGE') result = store[key] || [];
    return { ok: true, json: async () => ({ result }) };
  };
}

test('le token de connexion porte l\'organisation du compte coach', async () => {
  const store = {};
  mockUpstash(store);
  const { salt, hash } = hashPassword('motdepasse123');
  store['vs_user:alan'] = JSON.stringify({
    username: 'alan', label: 'Alan', plan: 'elite', org: 'galions', salt, hash, active: true
  });

  const res = mockRes();
  await loginHandler(
    { method: 'POST', headers: {}, socket: {}, body: { username: 'alan', password: 'motdepasse123' } },
    res
  );

  assert.equal(res._status, 200);
  const payload = verifyToken(res._json.token);
  assert.equal(payload.u, 'alan', 'le compte reste celui du coach');
  assert.equal(payload.org, 'galions', 'l\'organisation doit être dans le token');
});

test('un compte sans org devient sa propre organisation dans le token', async () => {
  const store = {};
  mockUpstash(store);
  const { salt, hash } = hashPassword('motdepasse123');
  store['vs_user:acme'] = JSON.stringify({ username: 'acme', plan: 'elite', salt, hash, active: true });

  const res = mockRes();
  await loginHandler(
    { method: 'POST', headers: {}, socket: {}, body: { username: 'acme', password: 'motdepasse123' } },
    res
  );

  const payload = verifyToken(res._json.token);
  assert.equal(payload.org, 'acme');
});

const snapshotsHandler = require('../api/snapshots');
const trackHandler = require('../api/roster-track');

test('les snapshots de roster sont partages au sein d\'une structure', async () => {
  const store = {};
  mockUpstash(store);
  const tEnzo = signToken({ u: 'galions', org: 'galions' }, 3600);
  const tAlan = signToken({ u: 'alan', org: 'galions' }, 3600);

  await snapshotsHandler({
    method: 'POST', headers: { authorization: 'Bearer ' + tEnzo }, query: {},
    body: { rosterId: 'r1', snapshot: { date: '2026-07-28T10:00:00Z', players: [{ role: 'Top', pseudo: 'X' }] } }
  }, mockRes());

  assert.ok(store['vs_snaps:galions:r1'], 'la cle doit porter la structure');

  const res = mockRes();
  await snapshotsHandler({ method: 'GET', headers: { authorization: 'Bearer ' + tAlan }, query: { roster: 'r1' } }, res);
  assert.equal(res._json.length, 1, 'Alan doit voir le snapshot de sa structure');
});

test('roster-track enregistre le suivi sous la structure', async () => {
  const store = {};
  mockUpstash(store);
  const tAlan = signToken({ u: 'alan', org: 'galions' }, 3600);

  const res = mockRes();
  await trackHandler({
    method: 'POST', headers: { authorization: 'Bearer ' + tAlan },
    body: { rosters: [{ rosterId: 'r1', name: 'Titulaires', players: [{ pseudo: 'Canna', tag: 'EUW' }] }] }
  }, res);

  assert.equal(res._status, 200);
  assert.ok(store['vs_track:galions'], 'doit etre enregistre sous la structure, pas sous le coach');
});
