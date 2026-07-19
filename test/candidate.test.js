const test = require('node:test');
const assert = require('node:assert');

process.env.SESSION_SECRET = 'test-secret';
process.env.UPSTASH_URL = 'https://mock';
process.env.UPSTASH_TOKEN = 'mock';

const { signToken, ingestKey } = require('../api/_auth');
// candidate + candidates fusionnés dans un seul handler (GET liste / POST ingestion)
const handler = require('../api/candidates');
const ingest = handler;
const list = handler;

function mockRes() {
  return { _status: 0, _json: null, setHeader() {}, status(c){ this._status=c; return this; }, json(o){ this._json=o; return this; }, end(){ return this; }, send(t){ this._json=t; return this; } };
}
// Faux Upstash : supporte les URLs REST (candidate.js legacy) ET le POST commande (via _auth)
function mockUpstash(store) {
  global.fetch = async (url, opts) => {
    if (opts && opts.body && opts.body[0] === '[') {
      const cmd = JSON.parse(opts.body);
      let result = null;
      if (cmd[0] === 'GET') result = store[cmd[1]] != null ? store[cmd[1]] : null;
      else if (cmd[0] === 'SET') { store[cmd[1]] = cmd[2]; result = 'OK'; }
      else if (cmd[0] === 'LPUSH') { (store[cmd[1]] = store[cmd[1]] || []).unshift(cmd[2]); result = store[cmd[1]].length; }
      else if (cmd[0] === 'LRANGE') { result = (store[cmd[1]] || []).slice(); }
      return { ok: true, json: async () => ({ result }) };
    }
    const m = String(url).match(/\/(lpush|lrange)\/([^/]+)(?:\/(.*))?$/);
    if (m && m[1] === 'lpush') { const key = decodeURIComponent(m[2]); (store[key] = store[key] || []).unshift(decodeURIComponent(m[3])); return { ok: true, json: async () => ({ result: store[key].length }) }; }
    if (m && m[1] === 'lrange') { const key = decodeURIComponent(m[2]); return { ok: true, json: async () => ({ result: (store[key] || []).slice() }) }; }
    return { ok: true, json: async () => ({ result: null }) };
  };
}

test('une candidature routée par ingestKey n\'atterrit que dans le bon compte', async () => {
  const store = {};
  mockUpstash(store);
  store['vs_ingest:' + ingestKey('acme')] = 'acme';

  const res = mockRes();
  await ingest({ method: 'POST', query: { to: ingestKey('acme') }, body: { pseudo: 'Zed', role: 'Mid' } }, res);
  assert.equal(res._status, 200);
  assert.ok(store['vs_candidates:acme'] && store['vs_candidates:acme'].length === 1);

  const tA = signToken({ u: 'acme' }, 3600);
  const rA = mockRes();
  await list({ method: 'GET', headers: { authorization: 'Bearer ' + tA } }, rA);
  assert.equal(rA._json.length, 1);
  assert.equal(rA._json[0].pseudo, 'Zed');

  const tB = signToken({ u: 'other' }, 3600);
  const rB = mockRes();
  await list({ method: 'GET', headers: { authorization: 'Bearer ' + tB } }, rB);
  assert.equal(rB._json.length, 0);
});

test('ingestion refusée sans code valide', async () => {
  mockUpstash({});
  const res = mockRes();
  await ingest({ method: 'POST', query: {}, body: { pseudo: 'Zed' } }, res);
  assert.equal(res._status, 400);
});
