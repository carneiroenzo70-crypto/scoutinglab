const test = require('node:test');
const assert = require('node:assert');

process.env.SESSION_SECRET = 'test-secret';
process.env.UPSTASH_URL = 'https://mock';
process.env.UPSTASH_TOKEN = 'mock';

const { signToken, ingestKey } = require('../api/_auth');
const handler = require('../api/session');

function mockRes() {
  return { _status: 0, _json: null, setHeader() {}, status(c){ this._status=c; return this; }, json(o){ this._json=o; return this; }, end(){ return this; } };
}

test('ingestKey est stable et non trivial', () => {
  const k1 = ingestKey('acme');
  const k2 = ingestKey('acme');
  assert.equal(k1, k2);
  assert.equal(k1.length, 16);
  assert.notEqual(ingestKey('acme'), ingestKey('other'));
});

test('/api/session renvoie ingestKey et écrit la correspondance', async () => {
  const store = {};
  global.fetch = async (_url, opts) => {
    const cmd = JSON.parse(opts.body);
    let result = null;
    if (cmd[0] === 'GET') result = store[cmd[1]] != null ? store[cmd[1]] : null;
    else if (cmd[0] === 'SET') { store[cmd[1]] = cmd[2]; result = 'OK'; }
    return { ok: true, json: async () => ({ result }) };
  };
  store['vs_user:acme'] = JSON.stringify({ username: 'acme', label: 'Acme', plan: 'elite', active: true });
  const token = signToken({ u: 'acme', label: 'Acme', plan: 'elite' }, 3600);

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + token } }, res);
  assert.equal(res._status, 200);
  assert.equal(res._json.ingestKey, ingestKey('acme'));
  assert.equal(store['vs_ingest:' + ingestKey('acme')], 'acme');
});
