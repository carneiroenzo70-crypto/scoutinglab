// /api/canal — le canal d'équipe (Discord) d'une structure
//   GET     → { configure, libelle, nom, par, le }   ⚠️ JAMAIS l'URL du webhook
//   PUT     { url, libelle }  → vérifie le webhook auprès de Discord, puis l'enregistre
//   DELETE  → oublie le canal
//   POST    { texte, titre }  → publie dans le salon
//
// Clé Upstash : vs_canal:<structure>. Comme les autres données, le canal appartient à la
// STRUCTURE (cf. orgOfToken) : un coach le branche, toute son équipe de staff s'en sert.
//
// ══ POURQUOI L'URL NE REDESCEND JAMAIS AU NAVIGATEUR ═══════════════════════════════
// Une URL de webhook Discord EST le droit d'écrire dans le salon : elle ne porte aucune
// identité, quiconque la détient peut y publier ce qu'il veut, sans limite. La renvoyer
// au client la mettrait dans le HTML, dans l'onglet Réseau, dans un cache de navigateur
// partagé — pour un salon de staff où se discutent des drafts, c'est exactement la donnée
// qu'on ne veut pas voir fuir. Le client n'apprend donc que « c'est configuré, et ça
// s'appelle #staff » ; l'envoi se fait ici, où l'URL ne quitte pas le serveur.
//
// ══ POURQUOI DISCORD SEULEMENT, ET VALIDÉ AUSSI STRICTEMENT ════════════════════════
// Cette route accepte une URL du client et va la chercher depuis le réseau de Vercel.
// Sans filtre, c'est un proxy de requêtes arbitraires offert à n'importe quel compte :
// on lui fait viser http://169.254.169.254/ (métadonnées d'instance), un service interne,
// ou on s'en sert pour frapper un tiers en masquant l'origine. La forme exacte attendue
// est donc imposée — hôte Discord, chemin /api/webhooks/<id>/<jeton> — et tout le reste
// est refusé. Élargir à Slack plus tard = ajouter une entrée à CANAUX, pas assouplir ceci.
const { verifyToken, getBearer, upstash, orgOfToken } = require('./_auth');

const cle = (u) => 'vs_canal:' + u;

// Un webhook Discord : https://discord.com/api/webhooks/<id numérique>/<jeton>
// `discordapp.com` est l'ancien domaine, encore servi et encore copié-collé.
// Pas de port, pas de requête, pas de fragment — la forme est close.
const RE_DISCORD = /^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d{5,25}\/[A-Za-z0-9_-]{30,200}$/;

function urlValide(url) {
  return typeof url === 'string' && url.length < 300 && RE_DISCORD.test(url.trim());
}

/* ── Découpage des messages ──────────────────────────────────────────────────────
   Discord refuse (400) tout `content` de plus de 2000 caractères. Une feuille de route
   à cinq postes, avec les pools et la forme récente, passe cette barre sans effort : sans
   découpage, le coach verrait « envoyé » et rien n'arriverait. On coupe donc sur des fins
   de LIGNE, jamais au milieu d'un mot.

   Le texte part dans un bloc de code : le déroulé de la journée est aligné à l'espace
   (« 14:00  Scrim »), et seule une police à pas fixe conserve ces colonnes. Chaque
   morceau referme donc sa clôture, sinon le premier morceau ouvrirait un bloc que le
   suivant n'aurait pas — Discord afficherait le reste en texte courant, désaligné. */
const LIMITE = 2000;
const CLOTURE = 8;            // "```\n" en tête + "\n```" en pied
const BUDGET = LIMITE - CLOTURE - 20;   // marge : le titre du 1er morceau

function decouper(texte) {
  const lignes = String(texte).split('\n');
  const morceaux = [];
  let bloc = '';
  for (const ligne of lignes) {
    // Une ligne seule plus longue que le budget ne peut pas être préservée : on la tronque
    // plutôt que de fabriquer un morceau que Discord rejettera.
    const l = ligne.length > BUDGET ? ligne.slice(0, BUDGET - 1) + '…' : ligne;
    if (bloc && bloc.length + 1 + l.length > BUDGET) { morceaux.push(bloc); bloc = l; }
    else bloc = bloc ? bloc + '\n' + l : l;
  }
  if (bloc.trim()) morceaux.push(bloc);
  return morceaux;
}

/* Un POST vers Discord, en respectant SON rythme. Discord répond 429 avec `retry_after`
   en secondes ; enchaîner sans attendre ferait perdre la fin de la feuille — le coach
   recevrait un document amputé, ce qui est pire qu'une erreur franche. Une seule reprise :
   au-delà, c'est un vrai problème et il faut le dire. */
async function publier(url, corps) {
  for (let essai = 0; essai < 2; essai++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps)
    });
    if (r.status === 429 && essai === 0) {
      let attente = 1;
      try { const j = await r.json(); if (j && j.retry_after) attente = Math.min(Number(j.retry_after) || 1, 5); } catch (_) {}
      await new Promise(f => setTimeout(f, attente * 1000));
      continue;
    }
    return r;
  }
  return null;
}

async function lireCanal(u) {
  const r = await upstash(['GET', cle(u)]);
  if (!r || r.result == null) return null;
  try { return JSON.parse(r.result); } catch (_) { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const payload = verifyToken(getBearer(req));
  if (!payload || !payload.u) return res.status(401).json({ error: 'Non authentifié' });
  const u = orgOfToken(payload);

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }

  try {
    // ── Ce que le staff a le droit de savoir : qu'il y a un canal, et lequel ──
    if (req.method === 'GET') {
      const c = await lireCanal(u);
      if (!c) return res.status(200).json({ configure: false });
      return res.status(200).json({
        configure: true,
        libelle: c.libelle || c.nom || 'Salon Discord',
        nom: c.nom || '',
        par: c.par || '',
        le: c.le || ''
      });
    }

    // ── Brancher le salon ──
    if (req.method === 'PUT') {
      const url = body && typeof body.url === 'string' ? body.url.trim() : '';
      if (!url) return res.status(400).json({ error: 'Colle l\'URL du webhook Discord.' });
      if (!urlValide(url)) {
        return res.status(400).json({
          error: 'Ce n\'est pas une URL de webhook Discord. Elle ressemble à https://discord.com/api/webhooks/… — dans Discord : Paramètres du salon → Intégrations → Webhooks.'
        });
      }
      /* On demande à Discord si ce webhook existe AVANT d'enregistrer. Sans cette
         vérification, une URL périmée (salon supprimé, webhook révoqué) s'installerait
         sans bruit et le coach ne le découvrirait qu'un jour de match, en constatant que
         personne n'a reçu la feuille. Mieux vaut refuser tout de suite. */
      let nom = '';
      try {
        const v = await fetch(url, { method: 'GET' });
        if (v.status === 404) return res.status(400).json({ error: 'Discord ne connaît pas ce webhook — il a été supprimé ou l\'URL est incomplète. Recrée-le dans le salon.' });
        if (!v.ok) return res.status(502).json({ error: 'Discord a répondu ' + v.status + '. Réessaie dans un instant.' });
        const j = await v.json();
        nom = (j && j.name) ? String(j.name).slice(0, 80) : '';
      } catch (_) {
        return res.status(502).json({ error: 'Impossible de joindre Discord pour vérifier le webhook.' });
      }

      const libelle = (body && typeof body.libelle === 'string' ? body.libelle.trim() : '').slice(0, 60);
      await upstash(['SET', cle(u), JSON.stringify({
        url, nom, libelle, par: payload.u, le: new Date().toISOString()
      })]);
      return res.status(200).json({ ok: true, configure: true, libelle: libelle || nom || 'Salon Discord', nom });
    }

    if (req.method === 'DELETE') {
      await upstash(['DEL', cle(u)]);
      return res.status(200).json({ ok: true, configure: false });
    }

    // ── Publier ──
    if (req.method === 'POST') {
      const c = await lireCanal(u);
      if (!c || !c.url) return res.status(409).json({ error: 'Aucun canal branché. Va dans Seasons → Canal d\'équipe.' });
      // Une URL enregistrée avant un durcissement de la validation ne doit pas servir
      // de contournement : on la revérifie à chaque envoi.
      if (!urlValide(c.url)) return res.status(409).json({ error: 'Le canal enregistré est invalide — rebranche-le.' });

      const texte = body && typeof body.texte === 'string' ? body.texte : '';
      if (!texte.trim()) return res.status(400).json({ error: 'Rien à envoyer.' });
      if (texte.length > 40000) return res.status(413).json({ error: 'Feuille trop longue pour un salon Discord.' });
      const titre = (body && typeof body.titre === 'string' ? body.titre.trim() : '').slice(0, 200);

      const morceaux = decouper(texte);
      for (let i = 0; i < morceaux.length; i++) {
        const suffixe = morceaux.length > 1 ? ' (' + (i + 1) + '/' + morceaux.length + ')' : '';
        const entete = (i === 0 && titre) ? ('**' + titre.replace(/[*_`~|]/g, '') + '**' + suffixe + '\n') : (suffixe ? '**' + suffixe.trim() + '**\n' : '');
        const r = await publier(c.url, {
          username: 'VisionScore',
          content: entete + '```\n' + morceaux[i] + '\n```',
          // Une feuille de route n'a aucune raison de sonner chez tout le monde : si le
          // coach veut alerter, il écrit @ lui-même dans le salon.
          allowed_mentions: { parse: [] }
        });
        if (!r) return res.status(429).json({ error: 'Discord limite les envois — réessaie dans quelques secondes.', envoyes: i });
        if (r.status === 404) return res.status(409).json({ error: 'Le webhook n\'existe plus (salon supprimé ?). Rebranche le canal.', envoyes: i });
        if (!r.ok) return res.status(502).json({ error: 'Discord a refusé l\'envoi (' + r.status + ').', envoyes: i });
      }
      return res.status(200).json({ ok: true, morceaux: morceaux.length, libelle: c.libelle || c.nom || '' });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (e) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Exporté pour les tests : ce sont les deux règles qu'on ne veut pas voir se relâcher.
module.exports.urlValide = urlValide;
module.exports.decouper = decouper;
module.exports.LIMITE = LIMITE;
