/* Modèle de SURVIE et d'UTILITAIRE — la moitié qui manquait.

   Jusqu'ici tout le calculateur convergeait vers une seule question : « combien ce build
   inflige-t-il ? ». C'était une omission, pas un choix. Dix familles de statistiques
   étaient extraites des objets puis abandonnées avant d'atteindre le profil, et un objet
   défensif n'avait littéralement aucun moyen de se distinguer d'un autre : à l'écran,
   le Sablier de Zhonya et la Coiffe de Rabadon ne différaient que par leur puissance.

   Sur la plupart des postes, les dégâts ne sont même pas le critère principal. Un
   support choisit sur la ténacité, les soins et la vitesse de déplacement ; un tank sur
   les PV effectifs contre le profil de dégâts d'en face ; un bruiser sur le compromis
   entre les deux. Ce fichier apporte les axes correspondants.

   Aucune formule inventée ici non plus :
     — PV effectifs : dérivés de `multiplicateur()`, déjà vérifié, plutôt qu'écrits une
       seconde fois. Une formule utilisée deux fois ne peut pas diverger d'elle-même.
     — Ténacité : composition multiplicative, avec sa limite dite explicitement.
     — Vitesse de déplacement : plafond progressif officiel (dans 26_modele_degats.js). */

const M = require('./26_modele_degats');

/* ── 1. PV EFFECTIFS ────────────────────────────────────────────────────────────
   Ce qu'il faut réellement infliger pour tuer, résistances comprises. C'est LE chiffre
   qui rend comparables un objet de PV et un objet de résistance — comparaison
   impossible tant qu'on regarde les deux stats séparément.

   On ne réécrit pas la formule : PV effectifs = PV ÷ multiplicateur(résistance). Comme
   `multiplicateur()` vaut 100/(100+R) pour R ≥ 0, on retrouve bien PV × (1 + R/100) —
   mais le cas des résistances NÉGATIVES (réduction d'armure poussée sous zéro) reste
   traité correctement, sans code en double.

   ⚠ Les PV effectifs ne sont valables que CONTRE UN TYPE DE DÉGÂTS. Un chiffre unique
   « PV effectifs » sans dire contre quoi n'a pas de sens : c'est pourquoi les trois
   sont renvoyés, et que le mixte porte la proportion qui a servi à le calculer. */
function pvEffectifs(p, partPhysique = 0.5) {
  const contrePhysique = p.pvMax / M.multiplicateur(p.armure);
  const contreMagique = p.pvMax / M.multiplicateur(p.rm);
  /* Mixte : c'est la moyenne des dégâts REÇUS qui compte, donc l'inverse de la moyenne
     des inverses. Faire la moyenne arithmétique des deux PV effectifs surestimerait la
     survie — l'erreur classique, et elle grandit avec l'écart entre armure et RM. */
  const q = partPhysique / contrePhysique + (1 - partPhysique) / contreMagique;
  return {
    pv: Math.round(p.pvMax),
    contrePhysique: Math.round(contrePhysique),
    contreMagique: Math.round(contreMagique),
    mixte: Math.round(1 / q),
    partPhysique,
    /* Rendement du prochain point : sert à dire POURQUOI un objet est le bon achat. */
    gainParArmure: Math.round(p.pvMax / 100 * 100) / 100,
    gainParPV: Math.round((1 + p.armure / 100) * 100) / 100
  };
}

/* Ce que l'objet suivant apporterait vraiment en survie, en PV effectifs et par pièce
   d'or. Le seul moyen honnête de dire « prends de l'armure plutôt que des PV » : la
   réponse dépend de ce qu'on a déjà, elle n'est jamais absolue. */
function gainSurvie(champId, niveau, objets, candidat, partPhysique = 0.5) {
  const avant = M.profil(champId, niveau, objets, { fenetre: 10 });
  const apres = M.profil(champId, niveau, objets.concat([candidat]), { fenetre: 10 });
  if (!avant || !apres) return null;
  const a = pvEffectifs(avant, partPhysique), b = pvEffectifs(apres, partPhysique);
  const prix = M.itemParId[candidat] ? M.itemParId[candidat].prix : null;
  const gain = b.mixte - a.mixte;
  return {
    objet: M.itemParId[candidat] ? M.itemParId[candidat].nom : candidat,
    prix, gain,
    parMillePo: prix ? Math.round(gain / prix * 1000) : null,
    avant: a.mixte, apres: b.mixte
  };
}

/* ── 2. TÉNACITÉ ET RÉSISTANCE AUX RALENTISSEMENTS ──────────────────────────────
   La ténacité ne réduit PAS tous les contrôles : le wiki officiel exclut explicitement
   les projections (airborne), la somnolence, la myopie, la stase et la suppression.
   Annoncer « −30 % de contrôle » sans cette réserve serait faux sur la moitié des
   engagements — un Malphite ou un Alistar traversent la ténacité sans la voir.

   ⚠ Limite assumée : le wiki décrit un cumul par GROUPES (multiplicatif à l'intérieur
   d'un groupe, additif entre groupes). Le modèle compose multiplicativement et le dit.
   Avec une seule source de ténacité — le cas de très loin le plus courant, quatre objets
   seulement en donnent — le résultat est exact. */
function controle(p) {
  const t = Math.min(1, p.tenacite || 0);
  const r = Math.min(1, p.resistRalent || 0);
  return {
    tenacite: t,
    dureeControle: Math.round((1 - t) * 1000) / 1000,
    resistRalent: r,
    dureeRalentissement: Math.round((1 - t) * (1 - r) * 1000) / 1000,
    horsPortee: ['projection', 'somnolence', 'myopie', 'stase', 'suppression'],
    reserve: p.tenacite > 0
      ? 'cumul composé multiplicativement ; exact avec une seule source de ténacité'
      : null
  };
}

/* ── 3. SOINS, BOUCLIERS, DRAIN ─────────────────────────────────────────────────
   Trois canaux distincts qu'il ne faut pas confondre :
     — vol de vie : ne s'applique qu'aux ATTAQUES DE BASE ;
     — omnivampirisme : s'applique à TOUS les dégâts ;
     — soins et boucliers : amplifie ce que le champion SOIGNE, pas ce qu'il draine.
   Les additionner donnerait un chiffre qui ne correspond à rien. */
function drain(p, degatsAttaqueParSeconde = 0, degatsCompetenceParSeconde = 0) {
  const vv = p.volVie || 0, ov = p.omnivamp || 0;
  const parAttaques = degatsAttaqueParSeconde * (vv + ov);
  const parCompetences = degatsCompetenceParSeconde * ov;
  return {
    volVie: vv, omnivamp: ov,
    parSeconde: Math.round((parAttaques + parCompetences) * 100) / 100,
    detail: [
      { canal: 'attaques de base', taux: vv + ov, valeur: Math.round(parAttaques * 100) / 100 },
      { canal: 'compétences', taux: ov, valeur: Math.round(parCompetences * 100) / 100 }
    ],
    note: 'le vol de vie ne porte que sur les attaques de base ; l\'omnivampirisme sur tout'
  };
}

/* Soins et boucliers PROPRES au champion : les calculs de genre « soin » sont extraits
   depuis le début pour les 90 champions, et n'ont jamais été exploités. L'efficacité
   des soins et boucliers de l'équipement les amplifie.

   ⚠ Elle amplifie les soins que le porteur PRODUIT et les boucliers qu'il pose, pas les
   soins qu'il reçoit d'autrui — d'où le nom du champ et cette note. */
function soinsDuChampion(champId, touche, rang, p, partPhysique = 0.5) {
  const c = M.champions[champId];
  const sort = c && c.sorts[touche];
  if (!sort) return { ok: false, raison: 'compétence absente' };
  const amp = 1 + (p.soinsEtBoucliers || 0);

  /* Un bouclier vaut PLUS que sa valeur affichée, et c'est ce que la confusion
     soin/bouclier masquait. Le wiki officiel est explicite : « resistances will still
     mitigate the damage BEFORE being absorbed by shielding » — les dégâts sont donc
     réduits par l'armure et la RM AVANT d'entamer le bouclier. Un bouclier de 300 sur
     un champion à 100 d'armure absorbe 600 points de dégâts physiques bruts.
     Un soin, lui, rend exactement ce qu'il annonce : il reconstitue des PV.

     C'est le même multiplicateur que pour les PV effectifs, réutilisé plutôt que
     réécrit — une formule employée deux fois ne peut pas diverger d'elle-même. */
  const multPhys = 1 / M.multiplicateur(p.armure);
  const multMag = 1 / M.multiplicateur(p.rm);
  const multMixte = 1 / (partPhysique / multPhys + (1 - partPhysique) / multMag);

  const soins = [], boucliers = [];
  Object.entries(sort.calculs).forEach(([nom, calc]) => {
    if (calc.genre !== 'soin' && calc.genre !== 'bouclier') return;
    const r = M.evaluerCalcul(champId, touche, nom, rang, p, null);
    if (!r.ok) return;
    const amplifie = Math.round(r.brut * amp * 100) / 100;
    if (calc.genre === 'soin') soins.push({ calcul: nom, brut: r.brut, amplifie });
    else boucliers.push({
      calcul: nom, brut: r.brut, amplifie,
      /* Ce que le bouclier absorbe réellement, résistances comprises. */
      absorbePhysique: Math.round(amplifie * multPhys),
      absorbeMagique: Math.round(amplifie * multMag),
      absorbeMixte: Math.round(amplifie * multMixte)
    });
  });
  if (!soins.length && !boucliers.length)
    return { ok: false, raison: 'aucun calcul de soin ni de bouclier sur ' + touche };
  return { ok: true, amplification: amp, soins, boucliers,
           note: 'l\'efficacité des soins et boucliers amplifie ce que le champion ' +
                 'PRODUIT, pas ce qu\'il reçoit ; un bouclier absorbe APRÈS les ' +
                 'résistances, un soin rend exactement sa valeur' };
}

/* ── 3 bis. BOUCLIERS D'OBJET ───────────────────────────────────────────────────
   Un bouclier n'est pas un soin, et la distinction se paie cher : les dégâts sont
   réduits par les résistances AVANT d'entamer le bouclier (wiki officiel). Un bouclier
   de 500 sur un champion à 200 d'armure absorbe 1 500 points de dégâts physiques bruts.

   Certains boucliers ne valent que contre un type — le Rookern kaénique n'arrête que la
   magie. Le compter comme un bouclier ordinaire doublerait sa valeur face à un
   adversaire à dégâts mixtes, d'où le champ `contre`. */
function boucliers(p, options = {}) {
  const { evaluerPassif, MODELES } = require('./30_moteur_items');
  const partPhysique = options.partPhysique != null ? options.partPhysique : 0.5;
  const multPhys = 1 / M.multiplicateur(p.armure);
  const multMag = 1 / M.multiplicateur(p.rm);

  const lignes = []; const refus = [];
  let total = 0, absorbe = 0;

  (p.objets || []).forEach(id => {
    const m = MODELES[id];
    if (!m || m.effet !== 'bouclier') return;
    const e = evaluerPassif(id, p, options.cible || null, { fenetre: options.fenetre });
    if (!e.ok) { refus.push((e.nom || id) + ' : ' + e.raison); return; }

    /* Part du combat que ce bouclier peut effectivement absorber : la totalité pour un
       bouclier ordinaire, la seule part magique pour le Rookern. */
    const part = m.contre === 'magique' ? (1 - partPhysique)
               : m.contre === 'physique' ? partPhysique : 1;
    const mult = m.contre === 'magique' ? multMag
               : m.contre === 'physique' ? multPhys
               : 1 / (partPhysique / multPhys + (1 - partPhysique) / multMag);
    const a = e.brut * mult * part;
    total += e.brut; absorbe += a;
    lignes.push({ objet: e.objet, nom: e.nom, montant: e.brut,
                  contre: m.contre || 'tous types',
                  absorbe: Math.round(a),
                  declencheur: (m.declencheur || {}).type || null,
                  note: e.note });
  });

  return {
    montant: Math.round(total),
    absorbe: Math.round(absorbe),
    lignes, refus,
    note: 'les résistances réduisent les dégâts AVANT le bouclier : un bouclier vaut ' +
          'donc plus que sa valeur affichée, et d\'autant plus que le porteur est résistant'
  };
}

/* ── 4. AUTONOMIE EN MANA ───────────────────────────────────────────────────────
   Combien de cycles Q-W-E-R la réserve permet-elle, et en combien de temps la
   régénération la reconstitue-t-elle ? Les coûts des sorts sont extraits depuis le début
   pour les 90 champions et n'avaient jamais servi. C'est pourtant un axe de choix réel :
   un mage sans mana ne fait aucun dégât, quel que soit son ratio.

   `null` sur un champion à énergie, à fureur ou à chaleur : la question ne se pose pas
   dans les mêmes termes, et répondre « 0 cycle » serait faux plutôt qu'incomplet. */
function autonomieMana(champId, p) {
  if (p.mana == null) return null;
  const c = M.champions[champId];
  if (!c) return null;

  let cout = 0; const detail = []; const inconnus = [];
  ['Q', 'W', 'E', 'R'].forEach(t => {
    const s = c.sorts[t];
    if (!s) return;
    /* `cout` est un tableau indexé par rang. Un sort sans coût déclaré (passif, sort à
       bascule) est signalé, pas compté zéro : la différence compte sur un cycle. */
    if (!Array.isArray(s.cout)) { inconnus.push(t); return; }
    const v = s.cout[s.nbRangs] != null ? s.cout[s.nbRangs] : s.cout[s.cout.length - 1];
    if (v == null) { inconnus.push(t); return; }
    cout += v;
    detail.push({ touche: t, cout: v });
  });
  if (!cout) return { cycles: null, raison: 'aucun coût en mana déclaré' };

  return {
    coutDuCycle: Math.round(cout),
    cycles: Math.floor(p.mana / cout),
    regenParSeconde: Math.round((p.regenManaTotal || 0) * 100) / 100,
    /* Secondes pour reconstituer un cycle complet — la mesure la plus lisible : elle
       dit si le champion peut relancer son combo avant que sa recharge ne soit finie. */
    secondesParCycle: p.regenManaTotal ? Math.round(cout / p.regenManaTotal) : null,
    detail,
    sortsSansCout: inconnus.length ? inconnus : null
  };
}

/* ── 5. FICHE COMPLÈTE D'UN BUILD ───────────────────────────────────────────────
   Tous les axes côte à côte, sans en privilégier un. C'est ce que le comparateur doit
   afficher : un build ne se juge pas sur un chiffre unique, et le meilleur build en
   dégâts n'est presque jamais le meilleur build tout court. */
function ficheBuild(champId, niveau, objets, options = {}) {
  const p = M.profil(champId, niveau, objets, { fenetre: options.fenetre || 10 });
  if (!p) return null;
  const survie = pvEffectifs(p, options.partPhysique != null ? options.partPhysique : 0.5);
  const aa = M.degatsAttaque(p, options.cible || null);
  const bou = boucliers(p, options);

  return {
    champion: p.nom, niveau, or: p.or,
    objets: (p.objets || []).map(i => (M.itemParId[i] || {}).nom || i),
    refuses: p.refuses,

    offensif: {
      adTotal: Math.round(p.adTotal), ap: Math.round(p.ap),
      vitesseAttaque: Math.round(p.vitesseAttaque * 1000) / 1000,
      crit: p.crit, degatsCrit: p.degatsCrit,
      dpsAttaques: aa.dps,
      letalite: p.letalite, penArmurePct: p.penArmurePct,
      penMagiquePlate: p.penMagiquePlate, penMagiquePct: p.penMagiquePct
    },

    defensif: {
      pv: survie.pv, armure: Math.round(p.armure), rm: Math.round(p.rm),
      pvEffectifsPhysique: survie.contrePhysique,
      pvEffectifsMagique: survie.contreMagique,
      pvEffectifsMixte: survie.mixte,
      /* Les boucliers s'ajoutent aux PV effectifs, mais SÉPARÉMENT : ils sont
         conditionnels et temporaires. Les fondre dans le chiffre principal ferait
         passer un build à boucliers pour durablement plus résistant qu'il n'est. */
      boucliers: bou,
      pvEffectifsAvecBoucliers: survie.mixte + bou.absorbe
    },

    utilitaire: {
      accel: p.accel,
      reductionRecharge: Math.round(p.accel / (100 + p.accel) * 1000) / 10,
      vitesseDeplacement: Math.round(p.ms),
      vitesseDeplacementBrute: Math.round(p.msBrute),
      ...controle(p),
      mana: p.mana == null ? null : Math.round(p.mana)
    },

    soutien: {
      ...drain(p, aa.dps, options.dpsCompetences || 0),
      soinsEtBoucliers: p.soinsEtBoucliers || 0,
      /* Régénérations PAR SECONDE, base du champion comprise. Les 12 objets à
         « % de régénération de vie » et les 15 à « % de régénération de mana »
         multipliaient jusqu'ici une base qui n'existait pas dans le modèle. */
      regenPVparSeconde: Math.round((p.regenPVtotal || 0) * 100) / 100,
      regenManaParSeconde: p.regenManaTotal == null ? null
        : Math.round(p.regenManaTotal * 100) / 100,
      autonomie: autonomieMana(champId, p)
    },

    passifs: {
      statsAccordees: p.statsAccordees || [],
      multiplicateurs: p.multiplicateurs || [],
      refuses: p.statsRefusees || []
    }
  };
}

module.exports = { pvEffectifs, gainSurvie, controle, drain, boucliers,
                   soinsDuChampion, autonomieMana, ficheBuild };
