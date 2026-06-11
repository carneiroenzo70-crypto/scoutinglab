// Helpers d'authentification — zéro dépendance (module crypto natif + Upstash REST)
const crypto = require('crypto');

// ── Hash de mot de passe (scrypt) ─────────────────────────
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(test, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── Token de session signé HMAC (format data.signature, base64url) ─
function signToken(payload, maxAgeSec) {
  const SESSION_SECRET = process.env.SESSION_SECRET || '';
  const body = Object.assign({}, payload, { exp: Math.floor(Date.now() / 1000) + maxAgeSec });
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return data + '.' + sig;
}

function verifyToken(token) {
  const SESSION_SECRET = process.env.SESSION_SECRET || '';
  if (!token || typeof token !== 'string' || !SESSION_SECRET) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let body;
  try { body = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')); } catch (_) { return null; }
  if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}

// ── Récupère le token Bearer depuis l'en-tête Authorization ─
function getBearer(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// ── Commande Upstash Redis via REST (POST single-command) ─
async function upstash(cmd) {
  const { UPSTASH_URL, UPSTASH_TOKEN } = process.env;
  if (!UPSTASH_URL || !UPSTASH_TOKEN) throw new Error('Upstash non configuré');
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  if (!res.ok) throw new Error('Upstash ' + res.status);
  return res.json();
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, getBearer, upstash };
