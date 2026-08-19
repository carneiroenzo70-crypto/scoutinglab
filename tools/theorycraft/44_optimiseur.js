/* OPTIMISEUR DE BUILD — « montre-moi les meilleurs objets contre CETTE équipe ».

   Le calculateur savait répondre à « combien vaut ce build ? ». Il ne savait pas
   répondre à « lequel prendre ? », qui est pourtant la question qu'un coach se pose.
   Ce module cherche donc lui-même les combinaisons, sur le patch courant, à partir des
   formules déjà extraites. Rien n'est recopié d'un site communautaire : le jour où Riot
   change une valeur, la recommandation change avec elle, sans intervention.

   ── Pourquoi une recherche GLOUTONNE et pas un examen exhaustif ────────────────────
   Une évaluation complète de build coûte 0,20 ms (mesuré). Choisir 5 objets parmi les
   105 légendaires, c'est 96 560 646 combinaisons, soit 5 heures et demie : exclu, et
   pas seulement dans un navigateur. On construit donc le build emplacement par
   emplacement en gardant les meilleurs candidats à chaque étape (recherche « en
   faisceau »), ce qui ramène le coût à quelques milliers d'évaluations.

   ⚠ HONNÊTETÉ SUR LA MÉTHODE : une recherche gloutonne ne PROUVE pas l'optimum. Elle
   peut manquer une paire d'objets dont chacun est médiocre seul et excellent ensemble.
   C'est pourquoi le résultat s'annonce comme « les meilleurs trouvés », jamais comme
   « le meilleur », et que la largeur du faisceau est un réglage explicite : l'élargir
   coûte du temps et referme une partie de l'angle mort. Prétendre à l'optimum aurait
   été un mensonge de plus dans un domaine qui n'en manque pas. */

const M = require('./26_modele_degats');
const S = require('./34_modele_survie');
const L = require('./40_legalite');
const items = require('./items.json');
const champions = require('./champions.json');

/* Le vivier de candidats : objets FINIS et assez chers pour porter un effet notable.
   Le seuil de 1 800 po est celui qu'emploient déjà l'audit et les tests — le changer
   ici ferait diverger deux comptages qui doivent parler du même ensemble. */
const CANDIDATS = items.filter(o => o.fini && o.prix >= 1800).map(o => o.id);
const parId = {};
items.forEach(o => { parId[o.id] = o; });

/* ── 1. Le matchup ────────────────────────────────────────────────────────────────
   « En fonction du matchup » veut dire quelque chose de précis : la composition d'en
   face décide à la fois de CE QU'ON SUBIT (donc de l'armure ou de la résistance magique
   qui sert vraiment) et de CE QU'ON PERCE (donc des cibles qu'on doit traverser).

   La part physique n'est pas demandée au coach ni posée à 50 % : elle est DÉDUITE des
   sorts des cinq adversaires, dont le type de dégâts est déjà extrait du fichier de
   jeu. Un curseur à régler à la main aurait été un chiffre inventé de plus, et le
   défaut le plus courant des calculateurs existants. */
function matchupDepuisCompo(compo, niveau = 18, options = {}) {
  const ids = (compo || []).filter(id => champions[id]);
  if (!ids.length) return null;

  let physique = 0, magique = 0;
  const inconnus = [];
  ids.forEach(id => {
    const c = champions[id];
    let vus = 0;
    ['Q', 'W', 'E', 'R'].forEach(t => {
      const s = c.sorts[t];
      if (!s || !s.typeDegats) return;
      vus++;
      if (s.typeDegats === 'physique') physique++;
      else if (s.typeDegats === 'magique') magique++;
      /* Les dégâts BRUTS ne sont réduits par aucune résistance : les compter d'un côté
         ou de l'autre fausserait la part. On les ignore ici, et on le dit. */
    });
    /* L'attaque de base est physique pour tout le monde, et elle pèse lourd sur un
       champion dont les sorts sont magiques mais qui frappe beaucoup. On la compte
       comme une source, pas comme un sort de plus. */
    physique++;
    if (!vus) inconnus.push(id);
  });

  const total = physique + magique;
  const partPhysique = total ? physique / total : 0.5;

  /* Les cibles elles-mêmes, avec leurs résistances réelles au niveau demandé. Un build
     qui perce un Sion ne perce pas une Ahri : c'est en traversant les CINQ qu'on juge. */
  const cibles = ids.map(id => M.cibleChampion(id, niveau, options.objetsEnnemis || []));

  return {
    ids, cibles,
    partPhysique: Math.round(partPhysique * 100) / 100,
    /* Ce que le modèle n'a pas su lire, dit plutôt que tu. */
    sansTypeConnu: inconnus,
    resume: ids.map(id => (champions[id] || {}).nom || id).join(', ')
  };
}

/* ── 2. La valeur d'un build face à ce matchup ────────────────────────────────────
   Deux axes, jamais fondus sans le dire : ce qu'on inflige, ce qu'on encaisse. */
function valeurBuild(champId, niveau, objets, matchup, options = {}) {
  const fenetre = options.fenetre || 20;
  const fiche = S.ficheBuild(champId, niveau, objets, {
    fenetre, partPhysique: matchup.partPhysique, cible: matchup.cibles[0]
  });
  if (!fiche) return null;

  const p = M.profil(champId, niveau, objets, { fenetre });
  if (!p) return null;

  /* DÉGÂTS : le combo complet, contre CHAQUE adversaire, puis la moyenne. Ne mesurer
     que sur une cible aurait récompensé les builds taillés contre un seul profil —
     exactement le travers qu'on veut corriger. */
  let somme = 0;
  matchup.cibles.forEach(cible => {
    let total = 0;
    ['Q', 'W', 'E', 'R'].forEach(t => {
      const s = (champions[champId].sorts || {})[t];
      if (!s || s.nonExploitable) return;
      const noms = Object.keys(s.calculs).filter(n => s.calculs[n].genre === 'degats');
      if (!noms.length) return;
      const r = M.evaluerCalcul(champId, t, noms[0], t === 'R' ? 3 : 5, p, cible,
                                { hypotheses: options.hypotheses || {}, fenetre });
      if (r && r.ok && r.subis != null) total += r.subis;
    });
    /* Les attaques de base comptent : un build de dégâts d'attaque ne se juge pas sur
       ses seules compétences. On prend la fenêtre de combat, pas un coup isolé. */
    const aa = M.degatsAttaque(p, cible);
    if (aa && aa.dps != null) total += aa.dps * fenetre;
    somme += total;
  });
  const degats = somme / matchup.cibles.length;

  /* SURVIE : les PV effectifs contre la part physique RÉELLE de cette composition.
     Les boucliers restent dehors — ils sont conditionnels et temporaires, les fondre
     ici ferait passer un build à boucliers pour durablement plus solide. */
  const survie = fiche.defensif.pvEffectifsMixte;

  return { degats, survie, or: fiche.or, refuses: fiche.refuses, fiche };
}

/* ── 3. Le score, et l'aveu qu'il contient un choix ───────────────────────────────
   Comparer des dégâts (en points) à des PV effectifs (en points aussi, mais qui ne
   veulent pas dire la même chose) demande une convention. Toute convention est un
   choix : on l'assume au lieu de le cacher dans une constante.

   · « degats » et « survie » ne mélangent rien : un seul axe, aucun arbitrage.
   · « equilibre » prend la MOYENNE GÉOMÉTRIQUE des deux progressions par rapport au
     même champion sans objets. Géométrique et non arithmétique, parce qu'elle est
     insensible à l'échelle : additionner 3 000 dégâts et 4 000 PV effectifs aurait
     laissé l'axe aux plus gros nombres décider seul, ce qui n'a aucun sens. Et parce
     qu'elle punit les builds unijambistes — doubler les dégâts en divisant la survie
     par deux ne fait pas un bon build, et la moyenne géométrique le dit. */
function score(v, base, objectif) {
  if (!v) return -Infinity;
  if (objectif === 'degats') return v.degats;
  if (objectif === 'survie') return v.survie;
  if (!base || !base.degats || !base.survie) return -Infinity;
  return Math.sqrt((v.degats / base.degats) * (v.survie / base.survie));
}

/* ── 4. La recherche ──────────────────────────────────────────────────────────── */
function chercherBuilds(champId, niveau, matchup, options = {}) {
  if (!champions[champId] || !matchup) return null;
  const emplacements = options.emplacements || 6;
  const largeur = options.largeur || 8;          // faisceau
  const objectif = options.objectif || 'equilibre';
  const orMax = options.orMax || Infinity;
  const combien = options.combien || 5;

  /* Référence : le même champion, au même niveau, SANS aucun objet. C'est elle qui
     donne son sens au score équilibré, et elle sert aussi à dire ce que le build
     apporte réellement — « +180 % de dégâts » se comprend, « 4 213 » non. */
  const base = valeurBuild(champId, niveau, [], matchup, options);
  if (!base) return null;

  let faisceau = [{ objets: [], v: base, s: score(base, base, objectif) }];
  let evaluations = 0;
  const vus = new Set();

  for (let slot = 0; slot < emplacements; slot++) {
    const suivants = [];
    faisceau.forEach(noeud => {
      CANDIDATS.forEach(id => {
        if (noeud.objets.indexOf(id) >= 0) return;
        const objets = noeud.objets.concat([id]);
        if ((parId[id].prix || 0) + noeud.v.or > orMax) return;

        /* LÉGALITÉ AVANT ÉVALUATION. Un build que le jeu refuserait n'a pas à être
           chiffré, et surtout pas à être recommandé : deux objets d'un même groupe
           exclusif produiraient un score flatteur et injouable. */
        if (!L.buildLegal(objets, { emplacements }).legal) return;

        /* Un même ensemble atteint par deux chemins différents ne se réévalue pas. */
        const cle = objets.slice().sort((a, b) => a - b).join(',');
        if (vus.has(cle)) return;
        vus.add(cle);

        const v = valeurBuild(champId, niveau, objets, matchup, options);
        evaluations++;
        if (!v) return;
        suivants.push({ objets, v, s: score(v, base, objectif) });
      });
    });
    if (!suivants.length) break;
    suivants.sort((a, b) => b.s - a.s);
    faisceau = suivants.slice(0, largeur);
  }

  /* ── Le POURQUOI, obtenu sans travail supplémentaire ──────────────────────────
     Pour chaque objet du build retenu, on rejoue le build SANS lui. L'écart est sa
     contribution réelle DANS CE BUILD et CONTRE CETTE ÉQUIPE — pas une note absolue
     recopiée d'ailleurs. C'est ce chiffre-là qui répond à « pourquoi celui-ci plutôt
     que l'autre », et il change avec le matchup, ce qui est tout l'intérêt. */
  const resultats = faisceau.slice(0, combien).map(n => {
    const apports = n.objets.map(id => {
      const sans = valeurBuild(champId, niveau, n.objets.filter(x => x !== id), matchup, options);
      evaluations++;
      return {
        id, nom: parId[id].nom, prix: parId[id].prix,
        gainDegats: sans ? n.v.degats - sans.degats : null,
        gainSurvie: sans ? n.v.survie - sans.survie : null,
        /* Part du score total que cet objet porte à lui seul. Sert à trier, et à dire
           « c'est cet objet-là qui fait la différence » sans agiter les mains. */
        partScore: sans ? n.s - score(sans, base, objectif) : null
      };
    }).sort((a, b) => (b.partScore || 0) - (a.partScore || 0));

    /* ── L'OBJET QUI NE SERT À RIEN ──────────────────────────────────────────────
       La recherche remplit tous les emplacements qu'on lui donne, même quand plus rien
       n'améliore le score : deux builds ressortaient avec des dégâts IDENTIQUES à
       l'unité près, distingués par un cinquième objet qui n'apportait strictement rien.
       Le recommander aurait été pire qu'inutile — c'est 3 000 po à ne pas dépenser là.

       On retire donc les objets dont le retrait ne coûte rien, et on le DIT avec l'or
       économisé. C'est probablement le conseil le plus concret de tout l'outil, et il
       tombe gratuitement de la mesure de contribution. */
    const seuil = Math.abs(n.s) * 1e-9;
    const inutiles = apports.filter(a => a.partScore != null && a.partScore <= seuil);
    const gardes = n.objets.filter(id => !inutiles.some(a => a.id === id));
    const vGardes = gardes.length === n.objets.length ? n.v
                  : valeurBuild(champId, niveau, gardes, matchup, options);
    if (gardes.length !== n.objets.length) evaluations++;

    return {
      objets: gardes, noms: gardes.map(i => parId[i].nom),
      or: vGardes ? vGardes.or : n.v.or, score: n.s,
      /* Ce qui a été écarté, et pourquoi — jamais retiré en silence. */
      inutiles: inutiles.map(a => ({ nom: a.nom, prix: a.prix })),
      orEconomise: inutiles.reduce((s, a) => s + (a.prix || 0), 0),
      degats: Math.round(n.v.degats), survie: Math.round(n.v.survie),
      gainDegatsPct: Math.round((n.v.degats / base.degats - 1) * 100),
      gainSurviePct: Math.round((n.v.survie / base.survie - 1) * 100),
      apports,
      refuses: n.v.refuses
    };
  });

  return {
    champion: (champions[champId] || {}).nom || champId,
    niveau, objectif, matchup: matchup.resume, partPhysique: matchup.partPhysique,
    base: { degats: Math.round(base.degats), survie: Math.round(base.survie) },
    builds: resultats,
    evaluations,
    /* Dire la méthode avec le résultat. Un classement dont on ignore comment il a été
       obtenu se lit comme une vérité ; celui-ci s'annonce pour ce qu'il est. */
    methode: 'recherche en faisceau (largeur ' + largeur + ') sur ' + CANDIDATS.length +
             ' objets légendaires — les meilleurs TROUVÉS, pas un optimum prouvé'
  };
}

/* Différence entre deux builds, terme à terme : ce qui manque à l'un, ce que l'autre a
   en trop, et ce que chaque objet distinct apporte. Répond à « pourquoi ce build est
   meilleur que celui que je joue ». */
function comparerBuilds(champId, niveau, buildA, buildB, matchup, options = {}) {
  const vA = valeurBuild(champId, niveau, buildA, matchup, options);
  const vB = valeurBuild(champId, niveau, buildB, matchup, options);
  if (!vA || !vB) return null;
  const seulA = buildA.filter(i => buildB.indexOf(i) < 0);
  const seulB = buildB.filter(i => buildA.indexOf(i) < 0);
  return {
    a: { objets: buildA, noms: buildA.map(i => (parId[i] || {}).nom || i),
         degats: Math.round(vA.degats), survie: Math.round(vA.survie), or: vA.or },
    b: { objets: buildB, noms: buildB.map(i => (parId[i] || {}).nom || i),
         degats: Math.round(vB.degats), survie: Math.round(vB.survie), or: vB.or },
    ecartDegats: Math.round(vB.degats - vA.degats),
    ecartSurvie: Math.round(vB.survie - vA.survie),
    ecartOr: vB.or - vA.or,
    propreA: seulA.map(i => (parId[i] || {}).nom || i),
    propreB: seulB.map(i => (parId[i] || {}).nom || i)
  };
}

module.exports = { CANDIDATS, matchupDepuisCompo, valeurBuild, score,
                   chercherBuilds, comparerBuilds };
