// POST /api/login — vérifie identifiant + mot de passe, renvoie un token de session
const { verifyPassword, signToken, upstash } = require('./_auth');

// Anti brute-force : compte les échecs par IP dans une fenêtre glissante (clé Upstash, TTL auto).
const RL_MAX_ATTEMPTS = 8;
const RL_WINDOW_SEC = 10 * 60;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.SESSION_SECRET) return res.status(500).json({ error: 'SESSION_SECRET non configuré' });

  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket && req.socket.remoteAddress || 'unknown');
  const rlKey = 'vs_rl:login:' + ip;
  try {
    const r = await upstash(['GET', rlKey]);
    const attempts = r.result ? parseInt(r.result, 10) : 0;
    if (attempts >= RL_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
    }
  } catch (_) { /* Upstash indisponible : on ne bloque pas la connexion pour ça */ }

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
  if (!ok) {
    try {
      const r = await upstash(['INCR', rlKey]);
      if (r && r.result === 1) await upstash(['EXPIRE', rlKey, RL_WINDOW_SEC]);
    } catch (_) {}
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
  }
  try { await upstash(['DEL', rlKey]); } catch (_) {}

  // Compte désactivé (contrat terminé / suspendu) → accès refusé. active absent = actif.
  if (user.active === false) {
    return res.status(403).json({ error: 'Compte désactivé. Contactez VisionScore pour réactiver votre accès.' });
  }

  const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24; // 30 jours ou 1 jour
  const plan = user.plan || 'elite';
  const token = signToken({ u: username, label: user.label || username, plan }, maxAge);
  return res.status(200).json({ token, username, label: user.label || username, plan, expiresIn: maxAge });
};
