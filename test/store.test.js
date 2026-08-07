const test = require('node:test');
const assert = require('node:assert');

process.env.SESSION_SECRET = 'test-secret';
process.env.UPSTASH_URL = 'https://mock';
process.env.UPSTASH_TOKEN = 'mock';

const { signToken } = require('../api/_auth');
const handler = require('../api/store');

function mockRes() {
  return {
    _status: 0, _json: null,
    setHeader() {}, status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; }, end() { return this; }, send(t) { this._json = t; return this; }
  };
}
// Faux Upstash en mémoire, piloté via global.fetch (comme _auth.upstash)
function mockUpstash(store) {
  global.fetch = async (_url, opts) => {
    const cmd = JSON.parse(opts.body);
    let result = null;
    if (cmd[0] === 'SET') { store[cmd[1]] = cmd[2]; result = 'OK'; }
    else if (cmd[0] === 'MGET') { result = cmd.slice(1).map(k => (store[k] != null ? store[k] : null)); }
    return { ok: true, json: async () => ({ result }) };
  };
}

test('PUT écrit une clé préfixée par le compte, GET la relit', async () => {
  const store = {};
  mockUpstash(store);
  const token = signToken({ u: 'acme' }, 3600);

  let res = mockRes();
  await handler({ method: 'PUT', headers: { authorization: 'Bearer ' + token }, body: { domain: 'crm', data: [{ id: 1 }] } }, res);
  assert.equal(res._status, 200);
  assert.ok(store['vs_data:acme:crm'], 'la clé doit contenir le compte');

  res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + token }, query: { domains: 'crm,fiches' } }, res);
  assert.equal(res._status, 200);
  assert.deepEqual(res._json.crm, [{ id: 1 }]);
  assert.equal(res._json.fiches, null);
});

test('deux comptes sont isolés', async () => {
  const store = {};
  mockUpstash(store);
  const tA = signToken({ u: 'a' }, 3600);
  const tB = signToken({ u: 'b' }, 3600);

  await handler({ method: 'PUT', headers: { authorization: 'Bearer ' + tA }, body: { domain: 'crm', data: ['secretA'] } }, mockRes());
  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + tB }, query: { domains: 'crm' } }, res);
  assert.equal(res._json.crm, null, 'B ne doit rien voir de A');
});

test('refuse sans token', async () => {
  const res = mockRes();
  await handler({ method: 'GET', headers: {}, query: { domains: 'crm' } }, res);
  assert.equal(res._status, 401);
});

test('refuse un domaine inconnu en PUT', async () => {
  mockUpstash({});
  const token = signToken({ u: 'acme' }, 3600);
  const res = mockRes();
  await handler({ method: 'PUT', headers: { authorization: 'Bearer ' + token }, body: { domain: 'hack', data: 1 } }, res);
  assert.equal(res._status, 400);
});

test('deux comptes de la MÊME structure partagent les données', async () => {
  const store = {};
  mockUpstash(store);
  const tEnzo = signToken({ u: 'galions', org: 'galions' }, 3600);
  const tAlan = signToken({ u: 'alan', org: 'galions' }, 3600);

  await handler({ method: 'PUT', headers: { authorization: 'Bearer ' + tEnzo }, body: { domain: 'seasons', data: ['draft'] } }, mockRes());

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + tAlan }, query: { domains: 'seasons' } }, res);
  assert.deepEqual(res._json.seasons, ['draft'], 'Alan doit voir les donnees de sa structure');
});

// Le domaine 'kpis' porte le choix des indicateurs suivis (boite a outils de
// l'analyse avancee). Sans son ajout a la liste blanche de store.js, le reglage
// serait accepte en local mais rejete en 400 par le serveur : il ne suivrait pas
// le coach d'un appareil a l'autre, en silence.
test('le domaine kpis est accepte et partage par structure', async () => {
  const store = {};
  mockUpstash(store);
  const tEnzo = signToken({ u: 'enzo', org: 'galions' }, 3600);
  const tAlan = signToken({ u: 'alan', org: 'galions' }, 3600);
  const prefs = { Mid: ['soloKills', 'laneMinions10'] };

  const put = mockRes();
  await handler({ method: 'PUT', headers: { authorization: 'Bearer ' + tEnzo }, body: { domain: 'kpis', data: prefs } }, put);
  assert.equal(put._status, 200, 'le domaine kpis doit etre accepte');

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + tAlan }, query: { domains: 'kpis' } }, res);
  assert.deepEqual(res._json.kpis, prefs, 'le reglage doit suivre la structure');
});

// Le domaine 'refbase' porte l'echantillon de joueurs servant a calibrer les
// metriques en centiles. Il doit etre partage par la structure : sinon chaque coach
// noterait sur sa propre reference et deux fiches du meme staff ne seraient pas
// comparables. Sans l'ajout a la liste blanche de store.js, le PUT partirait en 400
// et la base ne grossirait jamais au-dela du navigateur courant.
test('le domaine refbase est accepte et partage par structure', async () => {
  const store = {};
  mockUpstash(store);
  const tEnzo = signToken({ u: 'enzo', org: 'galions' }, 3600);
  const tAlan = signToken({ u: 'alan', org: 'galions' }, 3600);
  const base = { Mid: { keys: ['soloKills'], ids: ['p1'], rows: [[1.2]] } };

  const put = mockRes();
  await handler({ method: 'PUT', headers: { authorization: 'Bearer ' + tEnzo }, body: { domain: 'refbase', data: base } }, put);
  assert.equal(put._status, 200, 'le domaine refbase doit etre accepte');

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + tAlan }, query: { domains: 'refbase' } }, res);
  assert.deepEqual(res._json.refbase, base, 'la base de reference doit suivre la structure');
});

// Le domaine 'elite' porte les seuils de notation recalcules sur des joueurs de tres
// haut niveau. Il doit etre partage par la structure : deux coachs qui noteraient sur
// des bornes differentes produiraient des fiches incomparables.
test('le domaine elite est accepte et partage par structure', async () => {
  const store = {};
  mockUpstash(store);
  const tEnzo = signToken({ u: 'enzo', org: 'galions' }, 3600);
  const tAlan = signToken({ u: 'alan', org: 'galions' }, 3600);
  const seuils = { date: '2026-08-07', joueurs: 240, seuils: { ADC: { chal_team_dmg_pct: [18, 24, 28, 33] } } };

  const put = mockRes();
  await handler({ method: 'PUT', headers: { authorization: 'Bearer ' + tEnzo }, body: { domain: 'elite', data: seuils } }, put);
  assert.equal(put._status, 200, 'le domaine elite doit etre accepte');

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + tAlan }, query: { domains: 'elite' } }, res);
  assert.deepEqual(res._json.elite, seuils, 'les seuils doivent suivre la structure');
});

test('deux structures differentes restent isolees', async () => {
  const store = {};
  mockUpstash(store);
  const tGalions = signToken({ u: 'alan', org: 'galions' }, 3600);
  const tAutre = signToken({ u: 'bob', org: 'autre-club' }, 3600);

  await handler({ method: 'PUT', headers: { authorization: 'Bearer ' + tGalions }, body: { domain: 'seasons', data: ['secret'] } }, mockRes());

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + tAutre }, query: { domains: 'seasons' } }, res);
  assert.equal(res._json.seasons, null, 'une autre structure ne doit rien voir');
});

test('un ancien token sans org reste rattache a son propre compte', async () => {
  const store = {};
  mockUpstash(store);
  const ancien = signToken({ u: 'acme' }, 3600);   // token emis avant la migration

  await handler({ method: 'PUT', headers: { authorization: 'Bearer ' + ancien }, body: { domain: 'crm', data: [1] } }, mockRes());
  assert.ok(store['vs_data:acme:crm'], 'la cle doit rester vs_data:acme:crm');
});
