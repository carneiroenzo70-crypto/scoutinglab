// /api/admin-users — gestion manuelle des comptes (protégée par X-Admin-Secret)
//   GET    → liste détaillée des comptes (username, label, plan, active, dates)
//   POST   → crée un compte { username, password, label, plan, org }
//            org = structure de rattachement (vide → le compte est sa propre structure)
//   PATCH  → active/désactive un compte { username, active:true|false }
//            (révocation d'accès sans supprimer le compte — contrat suspendu/terminé)
//   DELETE → supprime un compte { username }
const { hashPassword, upstash } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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
      const usernames = r.result || [];
      // Détail de chaque compte (sans le hash/salt)
      const users = [];
      for (const u of usernames) {
        try {
          const ur = await upstash(['GET', 'vs_user:' + u]);
          const rec = ur.result ? JSON.parse(ur.result) : null;
          if (rec) {
            users.push({
              username: rec.username || u,
              label: rec.label || u,
              plan: rec.plan || 'elite',
              org: rec.org || rec.username || u,
              active: rec.active !== false,           // active absent = actif
              createdAt: rec.createdAt || null,
              deactivatedAt: rec.deactivatedAt || null
            });
          } else {
            users.push({ username: u, label: u, plan: 'elite', active: true });
          }
        } catch (_) { users.push({ username: u, label: u, plan: 'elite', active: true }); }
      }
      return res.status(200).json({ users });
    }

    if (req.method === 'POST') {
      const username = ((body && body.username) || '').trim().toLowerCase();
      const password = (body && body.password) || '';
      const label = ((body && body.label) || '').trim();
      let plan = ((body && body.plan) || 'starter').trim().toLowerCase();
      if (!username || !password) return res.status(400).json({ error: 'username et password requis' });
      if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (min. 8 caractères)' });
      if (!['starter', 'pro', 'elite'].includes(plan)) return res.status(400).json({ error: "plan invalide (starter, pro ou elite)" });

      // Rattachement à une structure. Vide → le compte est sa propre structure,
      // ce qui préserve le comportement de tous les comptes existants.
      const org = ((body && body.org) || '').trim().toLowerCase() || username;
      // `org` est concaténé dans les clés Upstash (vs_data:<org>:<domaine>…) : un
      // deux-points ou une espace rendrait la clé ambiguë. On ne restreint QUE ça —
      // les identifiants existants sont des adresses e-mail, une règle plus stricte
      // rejetterait la valeur par défaut (org = identifiant).
      if (/[:\s]/.test(org)) return res.status(400).json({ error: 'structure invalide (ni deux-points ni espace)' });

      const { salt, hash } = hashPassword(password);
      const user = { username, label: label || username, plan, org, salt, hash, active: true, createdAt: new Date().toISOString() };
      await upstash(['SET', 'vs_user:' + username, JSON.stringify(user)]);
      await upstash(['SADD', 'vs_users', username]);
      return res.status(200).json({ success: true, username, label: user.label, plan: user.plan, org, active: true });
    }

    if (req.method === 'PATCH') {
      const username = ((body && body.username) || '').trim().toLowerCase();
      if (!username) return res.status(400).json({ error: 'username requis' });
      if (typeof (body && body.active) !== 'boolean') return res.status(400).json({ error: 'active (true|false) requis' });
      const ur = await upstash(['GET', 'vs_user:' + username]);
      const user = ur.result ? JSON.parse(ur.result) : null;
      if (!user) return res.status(404).json({ error: 'Compte introuvable' });
      user.active = body.active;
      if (body.active) { delete user.deactivatedAt; }
      else { user.deactivatedAt = new Date().toISOString(); }
      await upstash(['SET', 'vs_user:' + username, JSON.stringify(user)]);
      return res.status(200).json({ success: true, username, active: user.active });
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
