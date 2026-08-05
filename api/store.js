// /api/store — stockage par compte des données de l'app (multi-tenant)
//   GET  ?domains=fiches,rosters,crm,structures  → { fiches:<data|null>, ... }
//   PUT  { domain, data }                         → { ok:true }
// Clé Upstash : vs_data:<structure>:<domaine>. La structure vient du token (jamais du
// client) : tous les comptes coach d'une même structure partagent ces données.
const { verifyToken, getBearer, upstash, orgOfToken } = require('./_auth');

const DOMAINS = ['fiches', 'rosters', 'crm', 'structures', 'seasons', 'kpis', 'refbase'];
const MAX_BYTES = 1024 * 1024; // 1 Mo / domaine

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const payload = verifyToken(getBearer(req));
  if (!payload || !payload.u) return res.status(401).json({ error: 'Non authentifié' });
  // Les données appartiennent à la STRUCTURE, pas au compte : tous les coachs
  // d'une même organisation voient et modifient le même jeu de données.
  const u = orgOfToken(payload);

  try {
    if (req.method === 'GET') {
      const raw = String(req.query.domains || '');
      const domains = raw.split(',').map(s => s.trim()).filter(d => DOMAINS.includes(d));
      const out = {};
      if (domains.length) {
        const keys = domains.map(d => 'vs_data:' + u + ':' + d);
        const r = await upstash(['MGET'].concat(keys));
        const arr = (r && r.result) || [];
        domains.forEach((d, i) => {
          try { out[d] = arr[i] != null ? JSON.parse(arr[i]) : null; } catch (_) { out[d] = null; }
        });
      }
      return res.status(200).json(out);
    }

    if (req.method === 'PUT') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
      const domain = body && body.domain;
      if (!DOMAINS.includes(domain)) return res.status(400).json({ error: 'domaine invalide' });
      const json = JSON.stringify(body.data === undefined ? null : body.data);
      if (json.length > MAX_BYTES) return res.status(413).json({ error: 'données trop volumineuses' });
      await upstash(['SET', 'vs_data:' + u + ':' + domain, json]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
