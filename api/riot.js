// /api/riot — proxy authentifié vers l'API Riot (protège la clé RIOT_API_KEY).
//
// Cache : les données d'une partie TERMINÉE sont immuables (match-v5 et sa timeline).
// On les met donc en cache Upstash. Un match servi depuis le cache ne consomme
// AUCUN quota Riot — c'est ce qui rend les ré-imports quasi instantanés et évite
// d'exploser la limite de la clé Personnelle (100 req / 2 min).
const { verifyToken, getBearer, upstash } = require('./_auth');

// .../lol/match/v5/matches/EUW1_123456  (+ éventuellement /timeline) → immuable.
// La liste d'IDs (.../matches/by-puuid/.../ids) ne matche pas : elle, elle change.
const MATCH_RE = /\/lol\/match\/v5\/matches\/([A-Z0-9]+_\d+)(\/timeline)?(?:\?|$)/i;
const CACHE_TTL = 60 * 60 * 24 * 30; // 30 jours

function cacheKeyFor(url) {
  const m = String(url).match(MATCH_RE);
  if (!m) return null;
  return 'vs_match:' + m[1] + (m[2] ? ':tl' : '');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  // permet au client de lire ces en-têtes (cache + délai d'attente réel)
  res.setHeader('Access-Control-Expose-Headers', 'X-VS-Cache, Retry-After');

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

  const target = decodeURIComponent(url);
  const key = cacheKeyFor(target);

  // ── 1) Cache : on sert sans toucher à Riot (donc sans consommer de quota) ──
  if (key) {
    try {
      const hit = await upstash(['GET', key]);
      if (hit && hit.result) {
        res.setHeader('X-VS-Cache', 'hit');
        return res.status(200).send(hit.result);   // déjà du JSON sous forme de texte
      }
    } catch (_) { /* cache indisponible → on continue vers Riot */ }
  }

  // ── 2) Appel Riot ─────────────────────────────────────────────────────────
  try {
    const riotRes = await fetch(target, {
      headers: { 'X-Riot-Token': apiKey }
    });

    const text = await riotRes.text();

    // Rate limit : on relaie le délai RÉEL indiqué par Riot, pour que le client
    // attende juste ce qu'il faut au lieu d'un délai fixe arbitraire.
    if (riotRes.status === 429) {
      const retry = riotRes.headers.get('retry-after') || '10';
      res.setHeader('Retry-After', retry);
      return res.status(429).json({ error: 'rate_limited', retryAfter: parseInt(retry, 10) || 10 });
    }

    // Succès sur une ressource immuable → on met en cache pour la prochaine fois
    if (riotRes.ok && key) {
      try { await upstash(['SET', key, text, 'EX', String(CACHE_TTL)]); } catch (_) { /* non bloquant */ }
    }

    res.setHeader('X-VS-Cache', key ? 'miss' : 'bypass');
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
