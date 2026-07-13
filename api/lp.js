// GET /api/lp?url=<URL Leaguepedia encodée> — proxy + cache Redis pour l'API Cargo
// Évite le rate-limit côté navigateur : une requête identique est servie depuis le cache (6 h).
const { verifyToken, getBearer } = require('./_auth');
const crypto = require('crypto');

const CACHE_TTL = 21600; // 6 h — les rosters/équipes changent rarement
const ALLOWED_HOST = 'lol.fandom.com';

// SHA1 de l'URL complète : aucune collision, aucune troncature (le nom d'équipe
// est en fin d'URL — l'ancienne clé base64 tronquée confondait les sous-équipes).
function cacheKey(url) {
  return 'lp:' + crypto.createHash('sha1').update(url).digest('hex');
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

  // req.query.url est déjà décodé une fois par Vercel → ne PAS re-décoder
  // (le 2e decode transformait les %XX internes de la requête Cargo en caractères
  //  littéraux et corrompait l'URL). On l'utilise tel quel.
  let target;
  try { target = new URL(url); }
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

  // En-têtes exigés par la politique d'API MediaWiki/Fandom. SANS User-Agent
  // identifiant, Fandom throttle les requêtes en priorité → c'était la cause
  // principale des « Leaguepedia surchargé ». On ajoute aussi maxlag (étiquette
  // MediaWiki) pour laisser le serveur nous répondre proprement plutôt que couper.
  const LP_HEADERS = {
    'User-Agent': 'VisionScore/1.0 (https://visionscore.gg; contact@visionscore.gg) roster-lookup',
    'Api-User-Agent': 'VisionScore/1.0 (https://visionscore.gg; contact@visionscore.gg)',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip'
  };
  const withMaxlag = clean + (clean.indexOf('?') >= 0 ? '&' : '?') + 'maxlag=5';

  // 2) Leaguepedia avec retry serveur sur rate-limit (HTTP 429/5xx ou corps 200 + {error})
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const lpRes = await fetch(withMaxlag, { headers: LP_HEADERS });
      if (lpRes.ok) {
        const data = await lpRes.json();
        if (!data.error) {
          // On ne met en cache que les résultats NON vides : un cargoquery vide
          // (souvent dû à un throttle partiel) ne doit pas empoisonner le cache 6 h.
          const nonEmpty = Array.isArray(data.cargoquery) && data.cargoquery.length > 0;
          if (hasCache && nonEmpty) await redisSet(UPSTASH_URL, UPSTASH_TOKEN, key, data);
          res.setHeader('X-VS-Cache', nonEmpty ? 'MISS' : 'MISS-EMPTY');
          return res.status(200).json(data);
        }
      }
      // Si le serveur indique explicitement un délai (429/503), on le respecte.
      const ra = parseInt(lpRes.headers.get('retry-after') || '', 10);
      if (ra > 0 && ra <= 10) { await new Promise(r => setTimeout(r, ra * 1000)); continue; }
    } catch (_) {}
    // Backoff exponentiel + jitter pour ne pas se resynchroniser sur le throttle.
    await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt) + Math.random() * 300));
  }
  res.setHeader('X-VS-Cache', 'FAIL');
  return res.status(503).json({ error: 'Leaguepedia indisponible (rate-limit)' });
};
