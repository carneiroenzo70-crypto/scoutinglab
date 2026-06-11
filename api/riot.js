const { verifyToken, getBearer } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'HEAD' || req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Protège la clé API Riot : token de session requis
  if (!verifyToken(getBearer(req))) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Paramètre url manquant' });
  }

  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Clé API Riot non configurée' });
  }

  try {
    const riotRes = await fetch(decodeURIComponent(url), {
      headers: { 'X-Riot-Token': apiKey }
    });

    const text = await riotRes.text();
    res.status(riotRes.status);

    try {
      return res.json(JSON.parse(text));
    } catch (_) {
      return res.send(text);
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
