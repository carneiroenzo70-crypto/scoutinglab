// /api/snapshots — historique des snapshots de roster ET liste des rosters suivis
//   GET  ?roster=<id>            → liste des snapshots du roster
//   POST { rosterId, snapshot }  → ajoute un snapshot (capture manuelle)
//   POST { rosters: [...] }      → enregistre les rosters/viviers à suivre (pour le cron)
//
// ══ POURQUOI DEUX ENDPOINTS N'EN FONT PLUS QU'UN ══════════════════════════════════
// Vercel Hobby plafonne à 12 Serverless Functions et chaque .js de api/ en consomme une.
// On était à 12/12 : le prochain endpoint faisait ÉCHOUER LE BUILD, pas seulement la
// fonctionnalité. `roster-track` partageait déjà tout avec ce fichier — même
// authentification, même structure, même domaine métier — et n'avait d'existence séparée
// que par habitude. Fusionné ici, il rend une place.
//
// L'ancienne URL /api/roster-track reste vivante par une RÉÉCRITURE dans vercel.json :
// elle ne consomme aucune fonction, et un onglet ouvert avant ce déploiement continue de
// pousser son suivi au lieu de tomber sur un 404 silencieux.
//
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

      /* ── Enregistrement des rosters SUIVIS (ex-/api/roster-track) ──────────────────
         Reconnu à la forme du corps : `rosters` est un tableau. Discriminer sur le corps
         plutôt que sur un paramètre d'URL évite d'inventer une convention de plus. */
      if (body && Array.isArray(body.rosters)) {
        /* On ne garde que le strict nécessaire (pas de données superflues). `leger`
           distingue le VIVIER de scouting d'un roster : le cron n'y fait que deux appels
           Riot par joueur au lieu de neuf, et le parcourt en rotation. Un vivier peut donc
           être long — plafonné à 40, là où un roster reste à 5 parce qu'une équipe a cinq
           postes. Sans ce plafond distinct, le vivier serait tronqué à cinq prospects et
           le suivi n'aurait aucun sens. */
        const clean = body.rosters.slice(0, 30).map(r => {
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
        await upstash(['SET', 'vs_track:' + u, JSON.stringify(clean)]);
        await upstash(['SADD', 'vs_track_users', u]);
        return res.status(200).json({ ok: true, count: clean.length });
      }

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
