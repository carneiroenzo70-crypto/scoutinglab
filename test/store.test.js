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
