// /api/store — stockage par compte des données de l'app (multi-tenant)
//   GET  ?domains=fiches,rosters,crm,structures  → { fiches:<data|null>, …, __versions:{…} }
//   PUT  { domain, data, version }               → { ok:true, version:<n> }
//                                                → 409 { conflit:true, version, data }
// Clé Upstash : vs_data:<structure>:<domaine>. La structure vient du token (jamais du
// client) : tous les comptes coach d'une même structure partagent ces données.
//
// ══ POURQUOI UNE VERSION ══════════════════════════════════════════════════════════
// Le PUT écrivait le domaine EN BLOC, sans rien regarder de ce qui s'y trouvait déjà :
// dernier écrivain gagne. Or le multi-coach par structure est un argument de vente du
// produit. Le scénario coûtait du travail réel, en silence :
//
//     10:00  coach A ouvre le CRM            (il a en mémoire l'état de 10:00)
//     10:05  coach B ajoute un prospect      (le serveur contient A+B)
//     10:06  coach A modifie une fiche       → PUT de SON état de 10:00
//            → le prospect de B disparaît. Aucune erreur, aucun avertissement.
//
// Chaque domaine porte donc un numéro de version, dans une clé voisine `…:v`. Le client
// renvoie la version qu'il a lue ; si elle ne correspond plus, on REFUSE (409) et on lui
// rend l'état courant pour qu'il fusionne. Le point capital n'est pas de gagner le
// conflit — c'est qu'un conflit cesse d'être silencieux.
const { verifyToken, getBearer, upstash, orgOfToken } = require('./_auth');

// `builds` : les builds enregistrés du calculateur de theorycraft. Le domaine doit être
// déclaré ICI aussi — le PUT refuse (400) tout domaine hors liste, et une sauvegarde
// rejetée ne se verrait pas côté client, qui garde son cache local.
const DOMAINS = ['fiches', 'rosters', 'crm', 'structures', 'seasons', 'kpis', 'refbase', 'elite', 'builds'];
const MAX_BYTES = 1024 * 1024; // 1 Mo / domaine

const cleData = (u, d) => 'vs_data:' + u + ':' + d;
const cleVersion = (u, d) => 'vs_data:' + u + ':' + d + ':v';

/* Comparer-et-écrire ATOMIQUE. Sans atomicité, deux PUT simultanés peuvent tous deux
   lire la version 4, tous deux la juger bonne, et tous deux écrire : on aurait déplacé
   la course d'un cran sans la supprimer. Le script s'exécute d'un bloc côté Redis.

   `false` est ce que rend Lua pour une clé absente : une structure encore jamais écrite
   part donc de la version 0, ce qui rend la migration inutile — aucune donnée existante
   n'a besoin d'être touchée. */
const SCRIPT_CAS = [
  "local v = redis.call('GET', KEYS[2])",
  "if v == false then v = '0' end",
  "if ARGV[1] ~= v then",
  "  local actuel = redis.call('GET', KEYS[1])",
  "  if actuel == false then actuel = '' end",
  "  return { 0, v, actuel }",
  "end",
  "redis.call('SET', KEYS[1], ARGV[2])",
  "local suivante = tostring(tonumber(v) + 1)",
  "redis.call('SET', KEYS[2], suivante)",
  "return { 1, suivante, '' }"
].join('\n');

/* Repli NON atomique, si jamais l'exécution de script n'était pas disponible. Il laisse
   une fenêtre de course de quelques millisecondes, donc il ne remplace pas le script —
   mais il attrape le cas réel, qui est deux coachs à quelques secondes d'intervalle, pas
   à quelques microsecondes. La réponse dit lequel des deux chemins a servi : un repli
   silencieux ferait croire à une garantie qu'on n'a pas. */
async function ecrireAvecRepli(u, domain, json, version) {
  try {
    const r = await upstash(['EVAL', SCRIPT_CAS, 2, cleData(u, domain), cleVersion(u, domain),
                             String(version), json]);
    if (r && !r.error && Array.isArray(r.result)) {
      const [ok, v, actuel] = r.result;
      return { atomique: true, ok: Number(ok) === 1, version: String(v), actuel: actuel || '' };
    }
  } catch (_) { /* on tombe dans le repli ci-dessous */ }

  const lu = await upstash(['GET', cleVersion(u, domain)]);
  const courante = (lu && lu.result != null) ? String(lu.result) : '0';
  if (String(version) !== courante) {
    const d = await upstash(['GET', cleData(u, domain)]);
    return { atomique: false, ok: false, version: courante, actuel: (d && d.result) || '' };
  }
  const suivante = String(Number(courante) + 1);
  await upstash(['SET', cleData(u, domain), json]);
  await upstash(['SET', cleVersion(u, domain), suivante]);
  return { atomique: false, ok: true, version: suivante, actuel: '' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const payload = verifyToken(getBearer(req));
  if (!payload || !payload.u) return res.status(401).json({ error: 'Non authentifié' });
  // Les données appartiennent à la STRUCTURE, pas au compte : tous les coachs
  // d'une même organisation voient et modifient le même jeu de données.
  const u = orgOfToken(payload);

  try {
    if (req.method === 'GET') {
      const raw = String(req.query.domains || '');
      const domains = raw.split(',').map(s => s.trim()).filter(d => DOMAINS.includes(d));
      const out = {};
      if (domains.length) {
        /* Données ET versions dans le MÊME MGET : deux appels séparés pourraient voir
           une écriture s'intercaler entre les deux, et le client repartirait avec une
           version qui ne décrit pas les données qu'il vient de recevoir — soit
           exactement le conflit qu'on cherche à détecter, mais fabriqué par nous. */
        const keys = domains.map(d => cleData(u, d)).concat(domains.map(d => cleVersion(u, d)));
        const r = await upstash(['MGET'].concat(keys));
        const arr = (r && r.result) || [];
        const versions = {};
        domains.forEach((d, i) => {
          try { out[d] = arr[i] != null ? JSON.parse(arr[i]) : null; } catch (_) { out[d] = null; }
          const v = arr[domains.length + i];
          versions[d] = v != null ? String(v) : '0';
        });
        out.__versions = versions;
      }
      return res.status(200).json(out);
    }

    if (req.method === 'PUT') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
      const domain = body && body.domain;
      if (!DOMAINS.includes(domain)) return res.status(400).json({ error: 'domaine invalide' });
      const json = JSON.stringify(body.data === undefined ? null : body.data);
      if (json.length > MAX_BYTES) return res.status(413).json({ error: 'données trop volumineuses' });

      /* TRANSITION — à retirer quand plus aucun onglet ouvert avant le 26/08/2026 ne
         tourne. Un client d'avant ne connaît pas les versions et n'en enverra jamais ;
         le refuser le ferait échouer en silence, ce qui n'est pas mieux que le défaut
         qu'on corrige. On écrit donc à l'aveugle ET on incrémente la version, pour que
         les clients à jour voient bien que quelque chose a bougé. */
      if (body.version === undefined || body.version === null || body.version === '') {
        await upstash(['SET', cleData(u, domain), json]);
        const inc = await upstash(['INCR', cleVersion(u, domain)]);
        return res.status(200).json({ ok: true, sansVersion: true,
                                      version: String((inc && inc.result) != null ? inc.result : 1) });
      }

      const r = await ecrireAvecRepli(u, domain, json, String(body.version));
      if (!r.ok) {
        let actuel = null;
        try { actuel = r.actuel ? JSON.parse(r.actuel) : null; } catch (_) { actuel = null; }
        /* 409 avec l'état COURANT joint : sans lui le client devrait relire, et pourrait
           relire un état encore différent. On lui rend exactement ce contre quoi sa
           version a été refusée. */
        return res.status(409).json({ conflit: true, version: r.version, data: actuel,
                                      atomique: r.atomique });
      }
      return res.status(200).json({ ok: true, version: r.version, atomique: r.atomique });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
