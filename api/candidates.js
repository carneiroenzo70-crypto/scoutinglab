// GET /api/candidates — retourne toutes les candidatures stockées
const { verifyToken, getBearer } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Protège la base CRM : token de session requis
  if (!verifyToken(getBearer(req))) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  const { UPSTASH_URL, UPSTASH_TOKEN } = process.env;
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return res.status(500).json({ error: 'Upstash non configuré' });
  }

  try {
    const upRes = await fetch(
      `${UPSTASH_URL}/lrange/vs_candidates/0/-1`,
      { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } }
    );
    if (!upRes.ok) throw new Error('Upstash error ' + upRes.status);
    const data = await upRes.json();
    const candidates = (data.result || []).map(item => {
      try { return JSON.parse(decodeURIComponent(item)); } catch(_) {
        try { return JSON.parse(item); } catch(_) { return null; }
      }
    }).filter(Boolean);
    return res.status(200).json(candidates);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
