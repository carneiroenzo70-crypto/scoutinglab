// GET /api/candidates — retourne toutes les candidatures stockées
const { verifyToken, getBearer, upstash } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Protège la base CRM : token requis. Chaque compte ne voit QUE ses candidatures.
  const payload = verifyToken(getBearer(req));
  if (!payload || !payload.u) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  try {
    const r = await upstash(['LRANGE', 'vs_candidates:' + payload.u, '0', '-1']);
    const candidates = ((r && r.result) || []).map(item => {
      try { return JSON.parse(decodeURIComponent(item)); } catch (_) {
        try { return JSON.parse(item); } catch (_) { return null; }
      }
    }).filter(Boolean);
    return res.status(200).json(candidates);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
