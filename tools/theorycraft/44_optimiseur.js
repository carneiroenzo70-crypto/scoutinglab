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
const C = require('./38_runes_combat');
const items = require('./items.json');
const champions = require('./champions.json');
const runesBrutes = require('./runes.json');
const RUNES = (Array.isArray(runesBrutes) ? runesBrutes : Object.values(runesBrutes))
  .filter(r => r.active);

/* Le vivier de candidats : objets FINIS et assez chers pour porter un effet notable.
   Le seuil de 1 800 po est celui qu'emploient déjà l'audit et les tests — le changer
   ici ferait diverger deux comptages qui doivent parler du même ensemble. */
const CANDIDATS = items.filter(o => o.fini && o.prix >= 1800).map(o => o.id);
const parId = {};
items.forEach(o => { parId[o.id] = o; });

/* ── 0. L'IDENTITÉ DU CHAMPION, déduite au lieu d'être demandée ───────────────────
   Le modèle réclamait un « scénario de combat » : quelle part de vos attaques de base
   portent réellement. C'était une question sans réponse honnête pour celui qui la lit,
   et surtout : c'était un FACTEUR DE RATTRAPAGE déguisé en réglage. Sans lui, les
   attaques de base écrasaient les sorts et Ahri repartait avec une Lame d'infini.

   Trois manières de le déduire ont été essayées et MESURÉES avant celle-ci :

   · Par le NIVEAU d'achat (un 1er objet s'achète niveau 8, pas 18) — réfuté : le
     classement du premier objet est identique aux niveaux 8, 11, 13 et 18.
   · Par les DÉGÂTS DU KIT NU (sorts contre attaques, sans objets) — réfuté : sans
     objets, tout le monde a la même attaque de base et aucun ratio ne s'exprime. Ça
     donnait Lux à 56 % d'attaques et Jhin à 32 %, soit l'inverse de la vérité.
   · En SOMMANT tous les calculs de dégâts d'un sort — réfuté, et dangereusement :
     sur 567 sorts, 224 portent plusieurs calculs, et ce sont presque toujours des
     ALTERNATIVES, pas des composantes. Sion Q = Min/Max de la charge, Gnar = forme
     Mini/Mega, Renekton = avec ou sans fureur. Les additionner doublerait à quadruplerait
     leurs dégâts. Un seul calcul du jeu porte le marqueur `TooltipOnly` : aucune règle
     mécanique ne sépare l'additif de l'alternatif. Prendre le premier reste le choix
     prudent.

   Ce qui MARCHE est ailleurs : non pas dans les dégâts du kit, mais dans la STRUCTURE
   DE SES RATIOS. Elle sépare nettement, et elle vient du fichier de jeu :

       Ahri, Lux, Amumu, Malphite, Veigar ..  0 % AD  → l'attaque de base n'est pas leur plan
       Aatrox, Darius, Garen ............... 100 % AD, portée 175
       Caitlyn 85 %, Vayne 83 %, Kaisa 74 %, Ashe 66 %, Jhin 63 %
       Smolder ............................. 61 % AD, et 3,50 de ratios de CRIT dans ses sorts

   Reste UNE convention — la formule ci-dessous. Elle est inventée, comme toute
   convention ; la différence avec le curseur d'avant est qu'elle s'applique
   uniformément, se déduit de chiffres réels propres à chaque champion, et s'affiche
   avec sa justification au lieu d'être réclamée à quelqu'un qui n'a pas les moyens d'y
   répondre. */
function profilChampion(champId) {
  const c = champions[champId];
  if (!c) return null;
  let ad = 0, ap = 0, crit = 0;
  const parcourir = termes => (termes || []).forEach(t => {
    const v = Math.abs(t.valeur || 0);
    if (t.stat === 'AD') ad += v;
    else if (t.stat === 'AP') ap += v;
    else if (t.stat === 'Crit' || t.stat === 'DegatsCrit') crit += v;
    parcourir(t.multTermes);
    parcourir(t.facteurTermes);
  });
  Object.values(c.sorts || {}).forEach(s => {
    Object.values(s.calculs || {}).forEach(cal => {
      if (cal.genre !== 'degats') return;
      const rangs = Object.keys(cal.parRang || {}).map(Number);
      if (!rangs.length) return;
      parcourir(cal.parRang[Math.max.apply(null, rangs)]);
    });
  });

  const somme = ad + ap;
  /* Un kit sans le moindre ratio (rare, et souvent un champion mal extrait) : on ne
     tranche pas, on prend le milieu plutôt que d'affirmer 0 % ou 100 %. */
  const partAD = somme ? ad / somme : 0.5;
  const portee = (c.base || {}).portee || 0;
  const corpsACorps = portee < 300;

  /* La convention, en clair. Un kit tout en ratios AD frappe fort à l'attaque de base ;
     un kit tout en AP ne le fait pas. Le corps-à-corps doit d'abord rejoindre sa cible
     et se fait repousser : il ne frappe jamais librement. Des ratios de CRIT dans les
     sorts eux-mêmes (Smolder, Caitlyn, Yasuo) signent un champion dont les objets de
     critique servent AUSSI aux compétences. */
  let part = 0.30 + 0.55 * partAD;
  if (crit > 0) part += 0.05;
  if (corpsACorps) part *= 0.6;
  part = Math.max(0.15, Math.min(0.95, part));

  return {
    nom: c.nom || champId,
    partAD: Math.round(partAD * 100) / 100,
    ratioAD: Math.round(ad * 100) / 100,
    ratioAP: Math.round(ap * 100) / 100,
    ratioCrit: Math.round(crit * 100) / 100,
    portee, corpsACorps,
    partAttaques: Math.round(part * 100) / 100,
    /* La phrase que l'interface affiche : le conseil doit pouvoir se défendre tout seul. */
    raison: (somme
        ? 'ses sorts portent ' + Math.round(partAD * 100) + ' % de ratios AD'
        : 'aucun ratio exploitable dans ses sorts') +
      (crit > 0 ? ' et des ratios de coup critique' : '') +
      ', portée ' + portee + (corpsACorps ? ' (corps à corps)' : ' (à distance)')
  };
}

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
  const runes = options.runes || [];
  const fiche = S.ficheBuild(champId, niveau, objets, {
    fenetre, partPhysique: matchup.partPhysique, cible: matchup.cibles[0], runes
  });
  if (!fiche) return null;

  const p = M.profil(champId, niveau, objets, { fenetre, runes });
  if (!p) return null;

  /* DÉGÂTS : le combo complet, contre CHAQUE adversaire, puis la moyenne. Ne mesurer
     que sur une cible aurait récompensé les builds taillés contre un seul profil —
     exactement le travers qu'on veut corriger. */
  let somme = 0;
  const sansMitigation = [];
  let degatsAttaques = 0;
  matchup.cibles.forEach(cible => {
    /* ⚠ DÉFAUT DE FOND, corrigé ici. Les compétences étaient comptées UNE FOIS chacune,
       les attaques de base pendant toute la fenêtre : sur 20 secondes, un seul Q contre
       vingt secondes d'attaques. Le score d'Aatrox venait alors à 94 % de ses attaques —
       de quoi lui conseigner une panoplie de tireur (Lame d'infini, Danseur fantôme,
       Lame tempête), alors qu'il inflige l'essentiel de ses dégâts par ses compétences
       et se joue au corps à corps.

       Ce n'était pas un arbitrage discutable, c'était une incohérence : deux sources
       mesurées sur deux durées différentes. `degatsSurFenetre` compte les lancers par
       les RECHARGES réelles, accélération comprise — sur 20 s, Aatrox lance 4 Q et
       2 W. Les deux sources parlent enfin de la même fenêtre. */
    const combo = M.degatsSurFenetre(champId, p, cible, fenetre, touche => {
      const s = (champions[champId].sorts || {})[touche];
      if (!s || s.nonExploitable) return null;
      const noms = Object.keys(s.calculs).filter(n => s.calculs[n].genre === 'degats');
      if (!noms.length) return null;
      const r = M.evaluerCalcul(champId, touche, noms[0], touche === 'R' ? 3 : 5, p, cible,
                                { hypotheses: options.hypotheses || {}, fenetre });
      if (!r || !r.ok) return null;
      /* Un sort de type MIXTE (magiques + bruts, physiques + magiques…) n'est pas mitigé
         par le modèle : il ne saurait pas quelle part passe par quelle résistance, et il
         refuse d'inventer. `subis` vaut alors null — et mon premier rappel le traduisait
         en ZÉRO, ce qui effaçait purement le sort du score.

         Trente sorts sont dans ce cas, dont le Q d'AHRI, qui est son sort principal : le
         conseil de build ignorait donc l'essentiel des dégâts d'Ahri. On retient les
         dégâts BRUTS à défaut — surévalués puisque non mitigés, mais infiniment plus
         proches de la vérité que zéro, et on le signale plutôt que de le taire. */
      if (r.subis != null) return r.subis;
      sansMitigation.push(touche + ' (' + r.type + ')');
      return r.brut != null ? r.brut : null;
    });
    let total = combo ? combo.total : 0;
    /* Les attaques de base comptent : un build de dégâts d'attaque ne se juge pas sur
       ses seules compétences. On prend la fenêtre de combat, pas un coup isolé. */
    /* ── LA DISPONIBILITÉ DES ATTAQUES DE BASE, et pourquoi elle se DEMANDE ─────────
       Le modèle comptait la fenêtre entière d'attaques de base, contre une cible qui ne
       bouge pas, ne riposte pas et ne meurt jamais. Sur 20 s cela fait 26 coups pour une
       Ahri — 8 945 dégâts, soit 88 % de son score — et le conseil devenait « prends une
       Lame d'infini » pour un mage. Même cause pour l'Aatrox conseillé en tireur.

       Aucun chiffre du fichier de jeu ne dit combien d'attaques on porte réellement : ça
       dépend du poste, de la portée, de la composition, du déroulé. Le modèle ne le
       DEVINE donc pas — il le demande, exactement comme pour les immobilisations et les
       éliminations. Par défaut il garde le maximum théorique, qui est le comportement
       d'avant et le seul qui ne suppose rien ; mais il annonce la part que les attaques
       pèsent dans le score, pour qu'un 84 % saute aux yeux au lieu de se cacher dans un
       classement d'objets. */
    const aa = M.degatsAttaque(p, cible);
    /* Plus de valeur par défaut à 1 : le maximum théorique « ne suppose rien » sur le
       papier, mais il suppose en réalité une cible qui ne bouge pas et ne meurt jamais,
       et c'est lui qui conseillait une Lame d'infini à Ahri. À défaut de consigne, on
       prend l'identité DÉDUITE du champion (§ 0) plutôt qu'une constante. */
    const partAA = options.partAttaques != null
      ? options.partAttaques
      : (profilChampion(champId) || { partAttaques: 0.6 }).partAttaques;
    if (aa && aa.dps != null) {
      const auto = aa.dps * fenetre * partAA;
      degatsAttaques += auto;
      total += auto;
    }

    /* Les RUNES infligent aussi des dégâts, et pas qu'un peu — Électrocution ou Comète
       pèsent plus qu'un objet entier en début de partie. Les omettre aurait fait choisir
       la page de runes sur ses seules statistiques, c'est-à-dire à côté de la question. */
    if (runes.length) {
      const rc = C.surFenetre(champId, p, cible, fenetre,
                                   { hypotheses: options.hypotheses || {} });
      if (rc && rc.degatsSubis) total += rc.degatsSubis;
    }
    somme += total;
  });
  const degats = somme / matchup.cibles.length;

  /* SURVIE : les PV effectifs contre la part physique RÉELLE de cette composition.
     Les boucliers restent dehors — ils sont conditionnels et temporaires, les fondre
     ici ferait passer un build à boucliers pour durablement plus solide. */
  const survie = fiche.defensif.pvEffectifsMixte;

  const partAttaques = somme ? degatsAttaques / somme : 0;
  return { degats, survie, or: fiche.or, refuses: fiche.refuses, fiche,
           sansMitigation: [...new Set(sansMitigation)],
           partAttaques: Math.round(partAttaques * 100) / 100 };
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

/* ── 5. La page de runes ──────────────────────────────────────────────────────────
   Les règles du jeu découpent l'espace pour nous : une majeure, trois mineures de son
   arbre (une par emplacement), deux mineures d'UN autre arbre (deux emplacements
   différents), trois fragments (un par rangée).

   Le compte exact : 17 majeures × 27 trios principaux × 108 paires secondaires × les
   fragments — de l'ordre du million de pages, soit plusieurs minutes. Exclu.

   On exploite donc la structure au lieu de la subir, en trois passes :
     1. pour chaque majeure, le meilleur TRIO principal (27 combinaisons, exhaustif) ;
     2. pour la meilleure majeure retenue, la meilleure PAIRE secondaire (108, exhaustif) ;
     3. les fragments, un par rangée (exhaustif aussi).
   Chaque passe est complète ; c'est leur enchaînement qui ne l'est pas. Comme pour les
   objets, on annonce « la meilleure trouvée », pas « la meilleure ». */
const combinaisons = (groupes) => groupes.reduce(
  (acc, g) => acc.length ? [].concat(...acc.map(a => g.map(x => a.concat([x])))) : g.map(x => [x]),
  []);
const parSlot = (arbre, genre) => {
  const slots = {};
  RUNES.filter(r => r.arbre === arbre && r.genre === genre)
       .forEach(r => { (slots[r.slot] = slots[r.slot] || []).push(r.id); });
  return Object.keys(slots).sort().map(k => slots[k]);
};
const ARBRES = [...new Set(RUNES.map(r => r.arbre))];
/* Les fragments sont communs à tous les arbres (le fichier les range sous Inspiration),
   une rangée = un emplacement. */
const FRAGMENTS = parSlot('Inspiration', 'fragment');

function chercherRunes(champId, niveau, matchup, options = {}) {
  if (!champions[champId] || !matchup) return null;
  const objectif = options.objectif || 'equilibre';
  const objets = options.objets || [];
  const base = valeurBuild(champId, niveau, objets, matchup, options);
  if (!base) return null;
  let evaluations = 0;

  const noter = runes => {
    const v = valeurBuild(champId, niveau, objets, matchup,
                          Object.assign({}, options, { runes }));
    evaluations++;
    return { v, s: score(v, base, objectif) };
  };

  /* Une page témoin pour juger une majeure sans que le reste ne pèse : le premier trio
     de son arbre, une paire secondaire fixe, les premiers fragments. Ce n'est pas la
     meilleure page — c'est la même pour toutes les majeures, donc la comparaison est
     honnête. */
  const fragmentsTemoin = FRAGMENTS.map(r => r[0]);

  let meilleur = null;
  RUNES.filter(r => r.genre === 'majeure').forEach(maj => {
    const trios = combinaisons(parSlot(maj.arbre, 'mineure'));
    const arbreSec = ARBRES.filter(a => a !== maj.arbre)[0];
    const paireTemoin = combinaisons(parSlot(arbreSec, 'mineure').slice(0, 2))[0];
    trios.forEach(trio => {
      const page = [maj.id].concat(trio, paireTemoin, fragmentsTemoin);
      const r = noter(page);
      if (!meilleur || r.s > meilleur.s) meilleur = { s: r.s, v: r.v, maj: maj, trio: trio };
    });
  });
  if (!meilleur) return null;

  /* Passe 2 : la paire secondaire, tous arbres confondus, deux emplacements distincts. */
  let paire = null;
  ARBRES.filter(a => a !== meilleur.maj.arbre).forEach(arbre => {
    const slots = parSlot(arbre, 'mineure');
    for (let i = 0; i < slots.length; i++) {
      for (let k = i + 1; k < slots.length; k++) {
        combinaisons([slots[i], slots[k]]).forEach(p2 => {
          const page = [meilleur.maj.id].concat(meilleur.trio, p2, fragmentsTemoin);
          const r = noter(page);
          if (!paire || r.s > paire.s) paire = { s: r.s, v: r.v, ids: p2, arbre };
        });
      }
    }
  });

  /* Passe 3 : les fragments, un par rangée. */
  let frags = null;
  combinaisons(FRAGMENTS).forEach(f => {
    const page = [meilleur.maj.id].concat(meilleur.trio, paire.ids, f);
    const r = noter(page);
    if (!frags || r.s > frags.s) frags = { s: r.s, v: r.v, ids: f };
  });

  const page = [meilleur.maj.id].concat(meilleur.trio, paire.ids, frags.ids);
  const legale = L.pageLegale(page);
  const nom = id => (RUNES.find(r => r.id === id) || {}).nom || id;

  /* Le POURQUOI, comme pour les objets : ce que la page apporte par rapport à AUCUNE
     rune, et ce que la majeure apporte à elle seule. */
  const sansMajeure = valeurBuild(champId, niveau, objets, matchup,
    Object.assign({}, options, { runes: page.filter(i => i !== meilleur.maj.id) }));
  evaluations++;

  return {
    page,
    majeure: { id: meilleur.maj.id, nom: meilleur.maj.nom, arbre: meilleur.maj.arbre },
    principal: meilleur.trio.map(i => ({ id: i, nom: nom(i) })),
    secondaire: { arbre: paire.arbre, runes: paire.ids.map(i => ({ id: i, nom: nom(i) })) },
    fragments: frags.ids.map(i => ({ id: i, nom: nom(i) })),
    degats: Math.round(frags.v.degats), survie: Math.round(frags.v.survie),
    gainDegatsPct: Math.round((frags.v.degats / base.degats - 1) * 100),
    gainSurviePct: Math.round((frags.v.survie / base.survie - 1) * 100),
    apportMajeure: sansMajeure ? Math.round(frags.v.degats - sansMajeure.degats) : null,
    legale: legale.legale,
    /* Une page illégale ne doit jamais être conseillée en silence. Si les règles du jeu
       changent et que la construction ci-dessus ne les respecte plus, ça se voit ici. */
    infractions: legale.infractions,
    evaluations,
    methode: 'trois passes exhaustives enchaînées (majeure+trio, paire secondaire, ' +
             'fragments) — la meilleure TROUVÉE, pas la meilleure possible'
  };
}

/* ── 6. L'ordre d'achat ───────────────────────────────────────────────────────────
   Ici, contrairement au reste, l'optimum est PROUVÉ — et il vaut la peine de dire
   pourquoi la différence est possible.

   Un build fini compte au plus 6 objets, donc au plus 64 sous-ensembles. On peut donc
   évaluer TOUTES les étapes intermédiaires possibles (64 évaluations, ~13 ms) puis
   choisir l'ordre par programmation dynamique sur ces sous-ensembles. Aucune heuristique,
   aucun faisceau : le meilleur ordre est le meilleur ordre.

   CE QU'ON MAXIMISE, et c'est un choix qu'il faut assumer : la puissance INTÉGRÉE SUR
   L'OR, pas la puissance à la fin. On farme l'or à peu près linéairement ; après avoir
   acheté l'objet k, on garde sa puissance le temps de farmer le prix de l'objet k+1.
   L'aire vaut donc Σ puissance(k) × prix(k+1). C'est ce qui récompense un objet bon
   marché et efficace en premier — exactement la question que se pose un coach.
   Trier par « le plus fort d'abord » aurait ignoré le prix et conseillé de commencer par
   l'objet le plus cher, ce qui est le contraire de ce qu'on veut. */
function ordreAchat(champId, niveau, objets, matchup, options = {}) {
  const n = (objets || []).length;
  if (!n) return null;
  if (n > 6) return null;             // au-delà, 2^n cesse d'être négligeable

  const base = valeurBuild(champId, niveau, [], matchup, options);
  const objectif = options.objectif || 'equilibre';
  let evaluations = 0;

  /* Puissance de CHAQUE sous-ensemble, une fois pour toutes. */
  const puissance = new Array(1 << n);
  for (let masque = 0; masque < (1 << n); masque++) {
    const sous = objets.filter((_, i) => masque & (1 << i));
    const v = valeurBuild(champId, niveau, sous, matchup, options);
    evaluations++;
    puissance[masque] = score(v, base, objectif);
  }

  /* f(masque) = meilleure aire pour avoir acheté exactement ces objets-là. */
  const f = new Array(1 << n).fill(-Infinity);
  const dernier = new Array(1 << n).fill(-1);
  f[0] = 0;
  for (let masque = 1; masque < (1 << n); masque++) {
    for (let i = 0; i < n; i++) {
      if (!(masque & (1 << i))) continue;
      const avant = masque ^ (1 << i);
      if (f[avant] === -Infinity) continue;
      /* On tenait la puissance de `avant` pendant qu'on farmait le prix de l'objet i. */
      const aire = f[avant] + puissance[avant] * (parId[objets[i]].prix || 0);
      if (aire > f[masque]) { f[masque] = aire; dernier[masque] = i; }
    }
  }

  const ordre = [];
  let masque = (1 << n) - 1;
  while (masque) { const i = dernier[masque]; ordre.unshift(i); masque ^= (1 << i); }

  let cumul = 0;
  const etapes = ordre.map((i, rang) => {
    cumul += parId[objets[i]].prix || 0;
    const jusquIci = ordre.slice(0, rang + 1).map(k => objets[k]);
    const m = jusquIci.reduce((acc, id) => acc | (1 << objets.indexOf(id)), 0);
    return {
      rang: rang + 1, id: objets[i], nom: parId[objets[i]].nom,
      prix: parId[objets[i]].prix, orCumule: cumul,
      /* Ce que vaut le build À CE STADE, pas à la fin. C'est le chiffre qui manque
         partout ailleurs : un build se joue en cours de partie, pas au coup de sifflet. */
      puissance: Math.round(puissance[m] * 1000) / 1000
    };
  });

  return {
    ordre: ordre.map(i => objets[i]),
    etapes, evaluations,
    methode: 'optimum PROUVÉ par programmation dynamique sur les ' + (1 << n) +
             ' sous-ensembles — ici, contrairement au choix des objets, aucune heuristique',
    critere: 'puissance intégrée sur l\'or dépensé : un objet bon marché et efficace ' +
             'passe devant un objet plus fort mais plus cher'
  };
}

module.exports = { CANDIDATS, RUNES, profilChampion, matchupDepuisCompo, valeurBuild, score,
                   chercherBuilds, comparerBuilds, chercherRunes, ordreAchat };
