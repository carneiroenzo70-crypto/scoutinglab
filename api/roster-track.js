// POST /api/roster-track — le client enregistre les rosters à suivre (pour le cron)
// Body : { rosters: [ { rosterId, name, players: [ { pseudo, tag, server, role } ] } ] }
const { verifyToken, getBearer, upstash, orgOfToken } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const payload = verifyToken(getBearer(req));
  if (!payload || !payload.u) return res.status(401).json({ error: 'Non authentifié' });
  const u = orgOfToken(payload);   // le cron suit les rosters d'une structure

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
  const rosters = (body && Array.isArray(body.rosters)) ? body.rosters : null;
  if (!rosters) return res.status(400).json({ error: 'rosters manquant' });

  /* Nettoyage : on ne garde que le strict nécessaire (pas de données superflues).
     `leger` distingue le VIVIER de scouting d'un roster : le cron n'y fait que deux
     appels Riot par joueur (rang, LP, winrate) au lieu de neuf, et le parcourt en
     rotation sur plusieurs jours. Un vivier peut donc être long — plafonné à 40, là où
     un roster reste à 5 parce qu'une équipe a cinq postes. Sans ce plafond distinct, le
     vivier serait tronqué à cinq prospects et le suivi n'aurait aucun sens. */
  const clean = rosters.slice(0, 30).map(r => {
    const leger = r.leger === true;
    return {
      rosterId: r.rosterId,
      name: String(r.name || '').slice(0, 80),
      leger: leger,
      players: (Array.isArray(r.players) ? r.players : []).slice(0, leger ? 40 : 5).map(p => ({
        pseudo: String(p.pseudo || '').slice(0, 60),
        tag: String(p.tag || '').slice(0, 10),
        server: String(p.server || 'euw1').slice(0, 8),
        role: String(p.role || '').slice(0, 8)
      })).filter(p => p.pseudo)
    };
  }).filter(r => r.rosterId != null);

  try {
    await upstash(['SET', 'vs_track:' + u, JSON.stringify(clean)]);
    await upstash(['SADD', 'vs_track_users', u]);
    return res.status(200).json({ ok: true, count: clean.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
