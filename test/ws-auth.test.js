const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const SECRET = 'test-secret';

// Fabrique un token au format exact de api/_auth.js : base64url(JSON).base64url(HMAC)
function signToken(payload, maxAgeSec) {
  const body = Object.assign({}, payload, { exp: Math.floor(Date.now() / 1000) + maxAgeSec });
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return data + '.' + sig;
}

test('un token valide est accepte et rend compte et structure', async () => {
  const { verifyToken } = await import('../ws-server/src/auth.js');
  const p = await verifyToken(signToken({ u: 'alan', org: 'galions' }, 3600), SECRET);
  assert.equal(p.u, 'alan');
  assert.equal(p.org, 'galions');
});

test('une signature falsifiee est refusee', async () => {
  const { verifyToken } = await import('../ws-server/src/auth.js');
  const t = signToken({ u: 'alan', org: 'galions' }, 3600);
  const falsifie = t.slice(0, -4) + 'aaaa';
  assert.equal(await verifyToken(falsifie, SECRET), null);
});

test('un token signe avec un autre secret est refuse', async () => {
  const { verifyToken } = await import('../ws-server/src/auth.js');
  assert.equal(await verifyToken(signToken({ u: 'alan' }, 3600), 'mauvais-secret'), null);
});

test('un token expire est refuse', async () => {
  const { verifyToken } = await import('../ws-server/src/auth.js');
  assert.equal(await verifyToken(signToken({ u: 'alan' }, -10), SECRET), null);
});

test('un token malforme est refuse sans lever d\'exception', async () => {
  const { verifyToken } = await import('../ws-server/src/auth.js');
  assert.equal(await verifyToken('nimporte-quoi', SECRET), null);
  assert.equal(await verifyToken('', SECRET), null);
  assert.equal(await verifyToken(null, SECRET), null);
});

test('orgOfToken applique le meme repli que l\'API', async () => {
  const { orgOfToken } = await import('../ws-server/src/auth.js');
  assert.equal(orgOfToken({ u: 'acme' }), 'acme');
  assert.equal(orgOfToken({ u: 'alan', org: 'galions' }), 'galions');
});
