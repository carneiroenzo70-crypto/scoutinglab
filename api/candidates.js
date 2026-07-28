// /api/candidates — candidatures par compte (une seule fonction : GET + POST)
//   GET                    → liste des candidatures de la structure du compte connecté
//   POST ?to=<ingestKey>   → ingestion publique depuis le Google Form d'une structure,
//                            routée vers celle-ci (vs_candidates:<structure>)
// Fusionné avec l'ancien /api/candidate pour rester sous la limite de fonctions Vercel.
const { verifyToken, getBearer, upstash, orgOfToken } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── POST : ingestion publique (form propre à une structure), routée par ?to=<ingestKey> ──
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) {} }

    const { pseudo, tag, pays, role, age, rank, experience, contact } = body || {};
    if (!pseudo) return res.status(400).json({ error: 'Pseudo manquant' });

    const to = (req.query && req.query.to) || (body && body.to) || '';
    if (!to) return res.status(400).json({ error: 'Code destinataire manquant' });
    let account = null;
    try {
      const r = await upstash(['GET', 'vs_ingest:' + String(to)]);
      account = r && r.result ? r.result : null;
    } catch (e) { return res.status(500).json({ error: e.message }); }
    if (!account) return res.status(400).json({ error: 'Code destinataire inconnu' });

    const candidate = {
      id: Date.now().toString(),
      addedAt: new Date().toISOString(),
      source: 'Google Form',
      pseudo: pseudo.trim(),
      tag: (tag || 'EUW').trim(),
      pays: (pays || '').trim(),
      role: role || '?',
      age: age ? parseInt(age) : null,
      rank: rank || '?',
      experience: experience || '',
      contact: contact || '',
      statut: 'Nouveau'
    };

    try {
      await upstash(['LPUSH', 'vs_candidates:' + account, JSON.stringify(candidate)]);
      return res.status(200).json({ success: true, id: candidate.id });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── GET : liste de la structure du compte connecté. Une structure ne voit QUE ses
  //    candidatures ; tous ses coachs voient la même liste. ──
  if (req.method === 'GET') {
    const payload = verifyToken(getBearer(req));
    if (!payload || !payload.u) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    try {
      const r = await upstash(['LRANGE', 'vs_candidates:' + orgOfToken(payload), '0', '-1']);
      const candidates = ((r && r.result) || []).map(item => {
        try { return JSON.parse(decodeURIComponent(item)); } catch (_) {
          try { return JSON.parse(item); } catch (_) { return null; }
        }
      }).filter(Boolean);
      return res.status(200).json(candidates);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
