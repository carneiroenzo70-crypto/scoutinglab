// /api/admin-users — gestion manuelle des comptes (protégée par X-Admin-Secret)
//   GET    → liste les identifiants existants
//   POST   → crée un compte { username, password, label }
//   DELETE → supprime un compte { username }
const { hashPassword, upstash } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.headers['x-admin-secret'] || '';
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) {} }

  try {
    if (req.method === 'GET') {
      const r = await upstash(['SMEMBERS', 'vs_users']);
      return res.status(200).json({ users: r.result || [] });
    }

    if (req.method === 'POST') {
      const username = ((body && body.username) || '').trim().toLowerCase();
      const password = (body && body.password) || '';
      const label = ((body && body.label) || '').trim();
      if (!username || !password) return res.status(400).json({ error: 'username et password requis' });
      if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (min. 8 caractères)' });

      const { salt, hash } = hashPassword(password);
      const user = { username, label: label || username, salt, hash, createdAt: new Date().toISOString() };
      await upstash(['SET', 'vs_user:' + username, JSON.stringify(user)]);
      await upstash(['SADD', 'vs_users', username]);
      return res.status(200).json({ success: true, username, label: user.label });
    }

    if (req.method === 'DELETE') {
      const username = ((body && body.username) || '').trim().toLowerCase();
      if (!username) return res.status(400).json({ error: 'username requis' });
      await upstash(['DEL', 'vs_user:' + username]);
      await upstash(['SREM', 'vs_users', username]);
      return res.status(200).json({ success: true, username });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
