// GET /api/cron-snapshot — collecte quotidienne (déclenchée par le cron Vercel)
// Protégé par CRON_SECRET. Parcourt les rosters suivis, récupère les stats Solo Q
// brutes (throttlé) et stocke un snapshot du jour par roster.
const { upstash } = require('./_auth');

const PLATFORM_TO_REGIONAL = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
  kr: 'asia', jp1: 'asia', oc1: 'sea', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea'
};
const TIER_IDX = { IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4, EMERALD: 5, DIAMOND: 6, MASTER: 7, GRANDMASTER: 8, CHALLENGER: 9 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const THROTTLE = 220; // ms entre appels Riot (clé personnelle)

/* ══ LE BUDGET D'APPELS, et pourquoi il manquait ══════════════════════════════════
   La clé Riot est PERSONNELLE : 100 requêtes / 2 min (cf. CLAUDE.md). Or ce cron émet
   une requête toutes les 220 ms, soit 4,5/s — 545 sur deux minutes. Il dépassait donc
   le quota d'un facteur cinq, et le dépassait EN SILENCE : `if (!r.ok) return null`
   traite un 429 exactement comme une absence de données, et le joueur est simplement
   sauté sans laisser de trace.

   Chiffré : 9 appels par joueur (compte + league + liste + 6 matchs), soit 45 pour un
   roster de cinq. Le budget de 100 est épuisé après ~22 s, c'est-à-dire 11 joueurs.
   Deux rosters passent encore ; trois, non. Ajouter les prospects du CRM par-dessus,
   sans rien changer, aurait donc dégradé aussi le suivi des rosters — on aurait cassé
   ce qui marchait pour ajouter ce qui ne marcherait pas.

   D'où trois changements : un budget compté et respecté, un mode LÉGER à 2 appels pour
   les prospects (le rang et le winrate viennent de l'entrée de ligue, sans lire un seul
   match), et un compte-rendu qui DIT ce qui a été collecté et ce qui a été refusé. */
const BUDGET_DEFAUT = 90;             // sous les 100/2 min, avec de la marge
const compteur = { appels: 0, refus429: 0, budget: BUDGET_DEFAUT };

async function riot(url, key) {
  if (compteur.appels >= compteur.budget) return null;   // budget épuisé : on n'insiste pas
  compteur.appels++;
  try {
    const r = await fetch(url, { headers: { 'X-Riot-Token': key } });
    if (r.status === 429) { compteur.refus429++; return null; }
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}
const budgetRestant = () => Math.max(0, compteur.budget - compteur.appels);

/* Relevé LÉGER : deux appels, et rien d'autre. Le rang, les LP et le winrate sortent
   directement de l'entrée de ligue — lire six matchs pour les recalculer coûterait sept
   appels de plus par prospect, pour des chiffres qu'on a déjà. Un pipeline de trente
   prospects tient ainsi dans 60 appels au lieu de 270. */
async function fetchProspectLeger(pseudo, tag, server, key) {
  const regional = PLATFORM_TO_REGIONAL[server] || 'europe';
  const acc = await riot('https://' + regional + '.api.riotgames.com/riot/account/v1/accounts/by-riot-id/' +
                         encodeURIComponent(pseudo) + '/' + encodeURIComponent(tag || 'EUW'), key);
  await sleep(THROTTLE);
  if (!acc || !acc.puuid) return null;
  const league = await riot('https://' + server + '.api.riotgames.com/lol/league/v4/entries/by-puuid/' + acc.puuid, key);
  await sleep(THROTTLE);
  const entries = Array.isArray(league) ? league : (league && league.entries) || [];
  const soloQ = entries.find(e => e.queueType === 'RANKED_SOLO_5x5');
  if (!soloQ) return { tier: null, lp: 0, wr: null };
  const n = (soloQ.wins || 0) + (soloQ.losses || 0);
  return {
    tier: soloQ.tier || null,
    lp: soloQ.leaguePoints || 0,
    wr: n > 0 ? Math.round((soloQ.wins || 0) / n * 100) : null
  };
}

// Récupère les stats brutes Solo Q d'un joueur (les entrées de calcProspectScore)
async function fetchPlayerRaw(pseudo, tag, server, key) {
  const regional = PLATFORM_TO_REGIONAL[server] || 'europe';
  const acc = await riot('https://' + regional + '.api.riotgames.com/riot/account/v1/accounts/by-riot-id/' + encodeURIComponent(pseudo) + '/' + encodeURIComponent(tag || 'EUW'), key);
  await sleep(THROTTLE);
  if (!acc || !acc.puuid) return null;
  const league = await riot('https://' + server + '.api.riotgames.com/lol/league/v4/entries/by-puuid/' + acc.puuid, key);
  await sleep(THROTTLE);
  const entries = Array.isArray(league) ? league : (league && league.entries) || [];
  const soloQ = entries.find(e => e.queueType === 'RANKED_SOLO_5x5');
  const tier = soloQ ? soloQ.tier : null;
  const lp = soloQ ? (soloQ.leaguePoints || 0) : 0;
  const ids = await riot('https://' + regional + '.api.riotgames.com/lol/match/v5/matches/by-puuid/' + acc.puuid + '/ids?queue=420&count=8&type=ranked', key);
  await sleep(THROTTLE);
  let n = 0, w = 0, kS = 0, dS = 0, aS = 0, csT = 0, durT = 0, visT = 0, dmgT = 0, kp = 0;
  if (Array.isArray(ids)) {
    for (const mid of ids.slice(0, 6)) {
      const m = await riot('https://' + regional + '.api.riotgames.com/lol/match/v5/matches/' + mid, key);
      await sleep(THROTTLE);
      const info = m && m.info; if (!info) continue;
      const p = (info.participants || []).find(x => x.puuid === acc.puuid); if (!p) continue;
      const dur = (info.gameDuration || 0) / 60; if (dur < 5) continue;
      const team = (info.participants || []).filter(x => x.teamId === p.teamId);
      const tk = team.reduce((s, x) => s + (x.kills || 0), 0);
      const td = team.reduce((s, x) => s + (x.totalDamageDealtToChampions || 0), 0);
      n++; if (p.win) w++; kS += p.kills || 0; dS += p.deaths || 0; aS += p.assists || 0;
      csT += (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0); durT += dur;
      visT += (p.visionScore || 0) / dur;
      dmgT += td ? (p.totalDamageDealtToChampions || 0) / td * 100 : 0;
      kp += tk ? ((p.kills || 0) + (p.assists || 0)) / tk * 100 : 0;
    }
  }
  // WR : préférer le ranked officiel (wins/losses) sinon les matchs analysés
  let wr = null;
  if (soloQ && (soloQ.wins != null) && (soloQ.losses != null) && (soloQ.wins + soloQ.losses) > 0) {
    wr = Math.round(soloQ.wins / (soloQ.wins + soloQ.losses) * 100);
  } else if (n) { wr = Math.round(w / n * 100); }
  return {
    tier: tier, lp: lp, wr: wr,
    kda: n ? +((kS + aS) / Math.max(1, dS)).toFixed(2) : null,
    csMin: durT ? +(csT / durT).toFixed(2) : null,
    visMin: n ? +(visT / n).toFixed(2) : null,
    killPart: n ? +(kp / n).toFixed(1) : null,
    dmgShare: n ? +(dmgT / n).toFixed(1) : null
  };
}

function todayUTC() { return new Date().toISOString().slice(0, 10); }

module.exports = async function handler(req, res) {
  // Authentification du cron
  const secret = process.env.CRON_SECRET || '';
  const auth = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : (req.query && req.query.secret) || '';
  if (!secret || provided !== secret) return res.status(401).json({ error: 'Non autorisé' });

  const key = process.env.RIOT_API_KEY;
  if (!key) return res.status(500).json({ error: 'RIOT_API_KEY non configurée' });

  /* ⚠ REMISE À ZÉRO OBLIGATOIRE. `compteur` vit au niveau du module, et une fonction
     serverless réutilise son module d'une invocation à l'autre (démarrage « à chaud ») :
     sans cette ligne, le deuxième passage du cron démarrerait avec un budget déjà épuisé
     et ne collecterait plus rien — en répondant `ok: true`, qui plus est. */
  compteur.appels = 0;
  compteur.refus429 = 0;
  compteur.budget = Number(process.env.CRON_BUDGET_RIOT || BUDGET_DEFAUT);

  try {
    const usersRes = await upstash(['SMEMBERS', 'vs_track_users']);
    const users = (usersRes && usersRes.result) || [];
    let players = 0, rosters = 0;
    const today = todayUTC();

    let prospects = 0;
    for (const u of users) {
      const tr = await upstash(['GET', 'vs_track:' + u]);
      let list; try { list = JSON.parse((tr && tr.result) || '[]'); } catch (_) { list = []; }

      /* Les ROSTERS d'abord, sans changement : c'est le cœur payant du produit, il ne
         doit pas être privé de budget par le vivier de scouting. Les prospects prennent
         ce qui reste, et tournent d'un jour sur l'autre. */
      for (const r of list.filter(x => !x.leger)) {
        const snapPlayers = [];
        for (const pl of (r.players || [])) {
          if (!pl.pseudo) continue;
          if (budgetRestant() < 9) break;   // pas la place pour un joueur complet
          const raw = await fetchPlayerRaw(pl.pseudo, pl.tag, pl.server || 'euw1', key);
          if (raw) snapPlayers.push(Object.assign({ role: pl.role, pseudo: pl.pseudo }, raw));
          players++;
        }
        if (!snapPlayers.length) continue;
        const snapKey = 'vs_snaps:' + u + ':' + r.rosterId;
        const cur = await upstash(['GET', snapKey]);
        let snaps; try { snaps = JSON.parse((cur && cur.result) || '[]'); } catch (_) { snaps = []; }
        // 1 point/jour : remplace si un snapshot du jour existe déjà
        snaps = snaps.filter(s => (s.date || '').slice(0, 10) !== today);
        snaps.push({ date: new Date().toISOString(), players: snapPlayers });
        if (snaps.length > 90) snaps.splice(0, snaps.length - 90);
        await upstash(['SET', snapKey, JSON.stringify(snaps)]);
        rosters++;
      }

      /* ── LES PROSPECTS DU CRM ────────────────────────────────────────────────────
         Ils partagent le même stockage que les rosters (`vs_snaps:<org>:<id>`) et la
         même forme de relevé : le digest « Ce qui a changé » les lit donc sans une
         ligne de code en plus.

         Deux différences assumées. Le relevé est LÉGER (2 appels au lieu de 9) : pour un
         prospect on suit une trajectoire de rang, pas un détail de farm — et le détail
         reste disponible à la demande sur sa fiche. Et surtout on TOURNE : un curseur
         mémorise où le budget s'est épuisé, et le lendemain on reprend là. Trente
         prospects avec vingt appels de reste sont ainsi tous rafraîchis en trois jours,
         au lieu que les dix premiers monopolisent le budget à vie. */
      for (const r of list.filter(x => x.leger)) {
        const tous = (r.players || []).filter(p => p.pseudo);
        if (!tous.length) continue;
        const cleCurseur = 'vs_track_curseur:' + u + ':' + r.rosterId;
        const cr = await upstash(['GET', cleCurseur]);
        let depart = Number((cr && cr.result) || 0);
        if (!isFinite(depart) || depart < 0 || depart >= tous.length) depart = 0;

        const releves = [];
        let i = 0;
        for (; i < tous.length; i++) {
          if (budgetRestant() < 2) break;
          const pl = tous[(depart + i) % tous.length];
          const raw = await fetchProspectLeger(pl.pseudo, pl.tag, pl.server || 'euw1', key);
          if (raw) releves.push(Object.assign({ role: pl.role, pseudo: pl.pseudo }, raw));
          prospects++;
        }
        await upstash(['SET', cleCurseur, String((depart + i) % tous.length)]);
        if (!releves.length) continue;

        const snapKey = 'vs_snaps:' + u + ':' + r.rosterId;
        const cur = await upstash(['GET', snapKey]);
        let snaps; try { snaps = JSON.parse((cur && cur.result) || '[]'); } catch (_) { snaps = []; }
        /* Un relevé du jour existe peut-être déjà, avec d'AUTRES prospects (rotation) :
           on le complète au lieu de l'écraser, sinon chaque passage effacerait le
           travail du précédent et l'historique n'avancerait jamais. */
        const dejaAujourdhui = snaps.filter(s => (s.date || '').slice(0, 10) === today)[0];
        if (dejaAujourdhui) {
          const parPseudo = {};
          (dejaAujourdhui.players || []).forEach(p => { parPseudo[p.pseudo] = p; });
          releves.forEach(p => { parPseudo[p.pseudo] = p; });
          dejaAujourdhui.players = Object.keys(parPseudo).map(k => parPseudo[k]);
        } else {
          snaps.push({ date: new Date().toISOString(), players: releves });
        }
        if (snaps.length > 90) snaps.splice(0, snaps.length - 90);
        await upstash(['SET', snapKey, JSON.stringify(snaps)]);
      }
    }
    /* Le compte-rendu DIT ce qui s'est passé. Sans lui, un budget épuisé et un cron qui
       n'a rien à faire se ressemblent trait pour trait — et c'est ce silence-là qui a
       laissé le dépassement de quota passer inaperçu jusqu'ici. */
    return res.status(200).json({
      ok: true, users: users.length, rosters, players, prospects,
      appels: compteur.appels, budget: compteur.budget,
      budgetEpuise: compteur.appels >= compteur.budget,
      refus429: compteur.refus429
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
