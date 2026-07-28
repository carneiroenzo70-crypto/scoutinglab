// /api/snapshots — historique des snapshots de roster (côté serveur, par structure)
//   GET  ?roster=<id>            → liste des snapshots du roster
//   POST { rosterId, snapshot }  → ajoute un snapshot (capture manuelle)
// Snapshot = { date, players:[{ role, pseudo, tier, lp, wr, kda, cs, vision }] }
const { verifyToken, getBearer, upstash, orgOfToken } = require('./_auth');

const CAP = 90;

async function readSnaps(u, rosterId) {
  const r = await upstash(['GET', 'vs_snaps:' + u + ':' + rosterId]);
  if (!r || r.result == null) return [];
  try { return JSON.parse(r.result) || []; } catch (_) { return []; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const payload = verifyToken(getBearer(req));
  if (!payload || !payload.u) return res.status(401).json({ error: 'Non authentifié' });
  const u = orgOfToken(payload);   // les snapshots appartiennent à la structure

  try {
    if (req.method === 'GET') {
      const rosterId = req.query.roster;
      if (rosterId == null || rosterId === '') return res.status(400).json({ error: 'roster manquant' });
      const snaps = await readSnaps(u, rosterId);
      return res.status(200).json(snaps);
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
      const rosterId = body && body.rosterId;
      const snapshot = body && body.snapshot;
      if (rosterId == null || !snapshot || !Array.isArray(snapshot.players)) {
        return res.status(400).json({ error: 'rosterId/snapshot invalide' });
      }
      const snaps = await readSnaps(u, rosterId);
      snaps.push({ date: snapshot.date || new Date().toISOString(), players: snapshot.players });
      if (snaps.length > CAP) snaps.splice(0, snaps.length - CAP);
      await upstash(['SET', 'vs_snaps:' + u + ':' + rosterId, JSON.stringify(snaps)]);
      return res.status(200).json({ ok: true, count: snaps.length });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
