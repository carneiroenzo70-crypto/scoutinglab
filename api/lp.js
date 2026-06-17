// GET /api/lp?url=<URL Leaguepedia encodée> — proxy + cache Redis pour l'API Cargo
// Évite le rate-limit côté navigateur : une requête identique est servie depuis le cache (6 h).
const { verifyToken, getBearer } = require('./_auth');

const CACHE_TTL = 21600; // 6 h — les rosters/équipes changent rarement
const ALLOWED_HOST = 'lol.fandom.com';

function cacheKey(url) {
  return 'lp:' + Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 120);
}

async function redisGet(base, token, key) {
  try {
    const r = await fetch(`${base}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.result ? JSON.parse(j.result) : null;
  } catch (_) { return null; }
}

async function redisSet(base, token, key, value) {
  try {
    await fetch(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', key, JSON.stringify(value), 'EX', String(CACHE_TTL)])
    });
  } catch (_) {}
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'HEAD' || req.method === 'OPTIONS') return res.status(200).end();

  if (!verifyToken(getBearer(req))) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Paramètre url manquant' });

  let target;
  try { target = new URL(decodeURIComponent(url)); }
  catch (_) { return res.status(400).json({ error: 'URL invalide' }); }
  if (target.hostname !== ALLOWED_HOST) {
    return res.status(400).json({ error: 'Hôte non autorisé' });
  }
  const clean = target.toString();

  const { UPSTASH_URL, UPSTASH_TOKEN } = process.env;
  const hasCache = UPSTASH_URL && UPSTASH_TOKEN;
  const key = cacheKey(clean);

  // 1) Cache
  if (hasCache) {
    const cached = await redisGet(UPSTASH_URL, UPSTASH_TOKEN, key);
    if (cached) {
      res.setHeader('X-VS-Cache', 'HIT');
      return res.status(200).json(cached);
    }
  }

  // 2) Leaguepedia avec retry serveur sur rate-limit (corps HTTP 200 + {error})
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const lpRes = await fetch(clean);
      if (lpRes.ok) {
        const data = await lpRes.json();
        if (!data.error) {
          if (hasCache) await redisSet(UPSTASH_URL, UPSTASH_TOKEN, key, data);
          res.setHeader('X-VS-Cache', 'MISS');
          return res.status(200).json(data);
        }
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
  }
  res.setHeader('X-VS-Cache', 'FAIL');
  return res.status(503).json({ error: 'Leaguepedia indisponible (rate-limit)' });
};
