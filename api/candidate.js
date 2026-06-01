// POST /api/candidate — reçoit une candidature depuis Google Apps Script
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { UPSTASH_URL, UPSTASH_TOKEN } = process.env;
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return res.status(500).json({ error: 'Upstash non configuré' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch(_) {} }

  const { pseudo, tag, pays, role, age, rank, experience, contact } = body || {};
  if (!pseudo) return res.status(400).json({ error: 'Pseudo manquant' });

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
    const upRes = await fetch(
      `${UPSTASH_URL}/lpush/vs_candidates/${encodeURIComponent(JSON.stringify(candidate))}`,
      { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } }
    );
    if (!upRes.ok) throw new Error('Upstash error ' + upRes.status);
    return res.status(200).json({ success: true, id: candidate.id });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
