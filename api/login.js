// POST /api/login — vérifie identifiant + mot de passe, renvoie un token de session
const { verifyPassword, signToken, upstash } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.SESSION_SECRET) return res.status(500).json({ error: 'SESSION_SECRET non configuré' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) {} }

  const username = ((body && body.username) || '').trim().toLowerCase();
  const password = (body && body.password) || '';
  const remember = !!(body && body.remember);
  if (!username || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis' });

  let user = null;
  try {
    const r = await upstash(['GET', 'vs_user:' + username]);
    user = r.result ? JSON.parse(r.result) : null;
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const ok = user && verifyPassword(password, user.salt, user.hash);
  if (!ok) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });

  const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24; // 30 jours ou 1 jour
  const token = signToken({ u: username, label: user.label || username }, maxAge);
  return res.status(200).json({ token, username, label: user.label || username, expiresIn: maxAge });
};
