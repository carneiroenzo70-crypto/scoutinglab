module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

  if (req.method === 'HEAD' || req.method === 'OPTIONS') {
    return res.status(200).end();
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
