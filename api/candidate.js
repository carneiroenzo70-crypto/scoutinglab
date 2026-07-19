// POST /api/candidate — reçoit une candidature depuis Google Apps Script
const { upstash } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch(_) {} }

  const { pseudo, tag, pays, role, age, rank, experience, contact } = body || {};
  if (!pseudo) return res.status(400).json({ error: 'Pseudo manquant' });

  // Routage : ?to=<ingestKey> identifie la structure destinataire (form propre à elle).
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
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
