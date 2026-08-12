/* Modèle de dégâts : transforme « ce sort a ce ratio » en « ce build inflige tant de
   dégâts à cette cible ». C'est la pièce qui rend comparables deux builds.

   Trois formules du jeu sont en jeu, aucune inventée — toutes vérifiées sur le wiki
   officiel avant d'être codées (cf. README) :
     1. croissance des stats par niveau, quadratique ;
     2. réduction par les résistances ;
     3. ordre d'application des pénétrations, qui n'est PAS commutatif. */

const champions = require('./champions.json');
const items = require('./items.json');

const itemParId = {};
items.forEach(o => { itemParId[o.id] = o; });

/* ── 1. Croissance par niveau ────────────────────────────────────────────────────
   Statistique = base + g × (n−1) × (0,7025 + 0,0175 × (n−1)).
   Ce n'est PAS linéaire : un champion gagne de plus en plus par niveau. La formule
   a la propriété remarquable de valoir exactement 17 g au niveau 18 — ce qui donne
   un point de contrôle facile, et c'est pour ça que le test la vérifie aux deux bouts.
   S'applique aux dégâts d'attaque, à l'armure, à la RM, aux PV et aux régénérations. */
function croissance(base, g, niveau) {
  const n = Math.max(1, Math.min(18, niveau || 1));
  return base + (g || 0) * (n - 1) * (0.7025 + 0.0175 * (n - 1));
}

/* La vitesse d'attaque suit une formule DIFFÉRENTE : la croissance est un pourcentage,
   et tout bonus est multiplié par le ratio propre au champion.
     VA totale = VAbase + (bonus% + croissance%) × ratio                              */
function vitesseAttaque(base, niveau, bonusPourcent = 0) {
  const n = Math.max(1, Math.min(18, niveau || 1));
  const croiss = (base.vaParNiv || 0) * (n - 1) * (0.7025 + 0.0175 * (n - 1)) / 100;
  const ratio = base.vaRatio != null ? base.vaRatio : base.va;
  return base.va + (bonusPourcent + croiss) * ratio;
}

// Stats d'un champion nu au niveau demandé
function statsChampion(id, niveau) {
  const c = champions[id];
  if (!c) return null;
  const b = c.base;
  return {
    adBase: croissance(b.ad, b.adParNiv, niveau),
    pv: croissance(b.pv, b.pvParNiv, niveau),
    armure: croissance(b.armure, b.armParNiv, niveau),
    rm: croissance(b.rm, b.rmParNiv, niveau),
    /* Le mana suit la même croissance quadratique que les autres stats. `null` sur les
       champions à énergie ou à fureur : leur en attribuer fausserait tout ce qui scale
       dessus (Ryze, le Manamune). */
    mana: b.mana == null ? null : croissance(b.mana, b.manaParNiv, niveau),
    va: vitesseAttaque(b, niveau),
    portee: b.portee, ms: b.ms,
    distance: b.portee > 300      // sert aux runes et objets à version « à distance »
  };
}

/* ── 2. Cumul des objets ────────────────────────────────────────────────────────── */
const ADDITIVES = ['ad', 'ap', 'pv', 'mana', 'armure', 'rm', 'accel', 'letalite',
                   'penMagiquePlat', 'penArmurePlate', 'vdPlate', 'portee',
                   'crit', 'degatsCrit', 'vitesseAttaque', 'vd', 'volVie', 'omnivamp',
                   'soinsEtBoucliers', 'regenPV', 'regenMana'];

/* Les pénétrations en POURCENTAGE ne s'additionnent pas : elles se multiplient
   (deux fois 20 % laissent 0,8 × 0,8 = 64 % de la résistance, pas 60 %). Additionner
   surestimerait les builds à deux objets de pénétration — précisément ceux qu'on veut
   comparer. */
/* La TÉNACITÉ et la résistance aux ralentissements suivent la même règle, et j'ai
   d'abord fait l'erreur de les additionner : Sandales de Mercure (30 %) + Gage de
   Sterak (20 %) donnaient 50 % de réduction là où le jeu en applique 44 %
   (1 − 0,7 × 0,8). Une réduction qui s'additionne finirait par atteindre 100 %, ce
   qu'aucune réduction du jeu ne fait. */
const MULTIPLICATIVES = ['penArmure', 'penMagique', 'tenacite', 'resistRalent'];

function statsObjets(ids) {
  const total = {};
  // Un « restant » par stat multiplicative, sinon la composition part sur NaN
  const restant = {}; MULTIPLICATIVES.forEach(k => { restant[k] = 1; });
  const vus = new Set();
  const refuses = [];
  (ids || []).forEach(id => {
    const o = itemParId[id];
    if (!o) { refuses.push(id + ' (inconnu ou hors Faille)'); return; }
    if (vus.has(id)) { refuses.push(o.nom + ' (déjà présent — un objet ne se cumule pas)'); return; }
    vus.add(id);
    Object.entries(o.stats).forEach(([k, s]) => {
      if (MULTIPLICATIVES.includes(k)) restant[k] *= (1 - s.valeur);
      else if (ADDITIVES.includes(k)) total[k] = (total[k] || 0) + s.valeur;
      else total[k] = (total[k] || 0) + s.valeur;
    });
  });
  MULTIPLICATIVES.forEach(k => { total[k] = Math.round((1 - restant[k]) * 100000) / 100000; });
  return { stats: total, refuses, objets: [...vus] };
}

/* Vitesse de déplacement. Comme la vitesse d'attaque, elle a sa formule propre, et
   surtout un PLAFOND PROGRESSIF que rien d'autre dans le jeu ne possède :
     brut ≤ 415       → brut
     415 < brut ≤ 490 → brut × 0,8 + 83
     brut > 490       → brut × 0,5 + 230
     brut < 220       → 110 + brut × 0,5
   Les bornes se raccordent exactement (415 × 0,8 + 83 = 415 ; 490 × 0,8 + 83 = 475 =
   490 × 0,5 + 230), ce qui est le meilleur contrôle qu'on puisse en faire.

   Ignorer ce plafond ferait croire qu'un quatrième objet de vitesse rapporte autant que
   le premier : au-delà de 490, un point brut n'en vaut plus qu'un demi.

   Ordre officiel : bonus plats d'abord, puis somme des pourcentages appliquée au total. */
function vitesseDeplacement(base, plat = 0, pourcent = 0) {
  const brut = (base + plat) * (1 + pourcent);
  if (brut > 490) return brut * 0.5 + 230;
  if (brut > 415) return brut * 0.8 + 83;
  if (brut >= 220) return brut;
  if (brut >= 0) return 110 + brut * 0.5;
  return 110 + brut * 0.01;
}

/* Recalcule les stats qui ne s'additionnent pas mais se DÉRIVENT d'un bonus brut.
   Appelée une seule fois, à la toute fin du profil : tout gain — objet, rune ou passif —
   modifie le bonus, jamais la valeur dérivée. */
function recalculerDerivees(p, base, niveau) {
  if (base) p.vitesseAttaque = vitesseAttaque(base, niveau, p.bonusVitesseAttaque || 0);
  p.ms = vitesseDeplacement(p.msBase, p.vdPlate || 0, p.vd || 0);
  p.msBrute = p.msBase + (p.vdPlate || 0);
}

/* ── 3. Profil complet : champion + niveau + objets ─────────────────────────────── */
function profil(id, niveau, idsObjets, extras = {}) {
  const nu = statsChampion(id, niveau);
  if (!nu) return null;
  const { stats: it, refuses, objets } = statsObjets(idsObjets);
  const g = k => (it[k] || 0) + (extras[k] || 0);

  const p = {
    champion: id, nom: (champions[id] || {}).nom, niveau, objets, refuses,
    adBase: nu.adBase,
    adBonus: g('ad'),
    ap: g('ap'),
    pvBonus: g('pv'),
    pvMax: nu.pv + g('pv'),
    /* PV provenant des SEULS objets — distincts des PV bonus, qui incluent runes et
       autres apports. L'Armure de Warmog multiplie les premiers ; confondre les deux
       lui ferait rendre plus qu'elle ne rend. */
    pvObjets: it.pv || 0,
    mana: nu.mana == null ? null : nu.mana + g('mana'),
    /* Mana BONUS, distinct du total : le Bâton de l'archange convertit 1 % du mana
       bonus en puissance, pas 1 % du mana total. Sur Ryze niveau 18 l'écart dépasse
       1000 de mana, soit 10 points de puissance attribués à tort. */
    manaBonus: g('mana'),
    armure: nu.armure + g('armure'),
    rm: nu.rm + g('rm'),
    /* Part BONUS des résistances, isolée de la base du champion : c'est elle seule
       que Jak'Sho amplifie. */
    armureBonus: g('armure'),
    rmBonus: g('rm'),
    accel: g('accel'),
    letalite: g('letalite'),
    penArmurePct: g('penArmure'),
    penMagiquePlate: g('penMagiquePlat'),
    penMagiquePct: g('penMagique'),
    /* Durée de combat retenue, transportée par le profil : les amplifications qui
       montent avec le temps (Créateur de failles) en dépendent, et elles sont évaluées
       loin d'ici, au moment de mitiger. Absente = ces passifs se refusent. */
    fenetre: extras.fenetre != null ? extras.fenetre : null,
    crit: Math.min(1, g('crit')),
    degatsCrit: g('degatsCrit'),
    /* Le BONUS en pourcentage est conservé à part de la vitesse d'attaque calculée.
       Sans cette séparation, un gain de rune (+10 %) s'ajouterait à un nombre
       d'attaques par seconde (0,83) : on obtiendrait 10,83. La vitesse d'attaque et la
       vitesse de déplacement sont des stats DÉRIVÉES — elles se recalculent, elles ne
       s'incrémentent pas. */
    bonusVitesseAttaque: g('vitesseAttaque'),
    vitesseAttaque: vitesseAttaque((champions[id] || {}).base, niveau, g('vitesseAttaque')),
    distance: nu.distance,
    or: (objets || []).reduce((s, i) => s + (itemParId[i] ? itemParId[i].prix : 0), 0)
  };
  p.adTotal = p.adBase + p.adBonus;

  /* TOUTE stat extraite qui n'a pas de champ dédié ci-dessus est reportée telle quelle.

     Sans cette boucle, dix familles de statistiques étaient extraites des objets,
     vérifiées, testées… puis abandonnées ici en silence : vitesse de déplacement, vol
     de vie, omnivampirisme, soins et boucliers, ténacité, résistance aux ralentissements
     et les quatre régénérations. Le modèle ne parlait que de dégâts non par choix, mais
     par omission — un objet de soutien ou un objet défensif n'avait littéralement aucun
     moyen de se distinguer d'un autre.

     La liste explicite ci-dessus reste nécessaire (renommages, formules propres) ; cette
     boucle garantit seulement qu'AUCUNE stat ne se perd sans qu'on l'ait décidé. */
  const DEJA = new Set(['ad', 'pv', 'mana', 'armure', 'rm', 'accel', 'letalite', 'crit',
                        'degatsCrit', 'vitesseAttaque', 'ap',
                        'penArmure', 'penMagique', 'penMagiquePlat']);
  Object.keys(it).forEach(k => { if (!DEJA.has(k)) p[k] = it[k] + (extras[k] || 0); });
  Object.keys(extras).forEach(k => {
    if (DEJA.has(k) || it[k] != null || typeof extras[k] !== 'number') return;
    p[k] = extras[k];
  });

  /* Vitesse de déplacement, avec son plafond progressif — une formule à part, comme la
     vitesse d'attaque. Sans elle, les 16 objets à vitesse de déplacement ne servaient
     à rien dans le modèle. Valeur provisoire : `recalculerDerivees` la reprend en fin
     de profil, une fois les runes et les passifs appliqués. */
  p.msBase = nu.ms;
  p.ms = vitesseDeplacement(nu.ms, p.vdPlate || 0, p.vd || 0);
  p.msBrute = nu.ms + (p.vdPlate || 0);

  /* Stats accordées par les passifs d'objet (Manamune : 2 % du mana max en dégâts
     d'attaque ; Gage de Sterak : 50 % de l'AD de base). Elles modifient le profil
     lui-même, donc tous les ratios de sorts et toutes les attaques qui suivent.
     Chargement paresseux pour éviter une dépendance circulaire entre les deux moteurs. */
  if (!extras.sansPassifs) {
    const { statsAccordees, multiplicateursStat } = require('./30_moteur_items');

    /* Trois passes, et l'ordre n'est pas décoratif :
         1. multiplicateurs de phase « avant » — leur base ne dépend que des objets
            (PV d'objets, résistances bonus) ;
         2. stats accordées — additives, et certaines LISENT le résultat de la passe 1
            (l'Armure sanguine convertit 2,5 % des PV bonus, ceux de Warmog compris) ;
         3. multiplicateurs de phase « après » — leur base est la stat TOTALE, donc
            après tout le reste (la Coiffe de Rabadon amplifie la puissance finale).
       Inverser 2 et 3 ferait perdre à Rabadon la puissance accordée par les passifs. */
    const { appliquerGain } = require('./30_moteur_items');
    const appliquer = gains =>
      Object.entries(gains).forEach(([stat, v]) => appliquerGain(p, stat, v));

    /* Les RUNES entrent avant tout le reste des passifs, et l'ordre se justifie :
       la Coiffe de Rabadon amplifie la puissance TOTALE — force adaptative comprise ;
       Jak'Sho amplifie les résistances BONUS — celles d'Inébranlable comprises ;
       l'Armure sanguine convertit les PV bonus — ceux de Surcroissance compris.
       Les placer après aurait fait perdre à chacun de ces passifs l'apport des runes. */
    if (extras.runes && extras.runes.length) {
      const { statsDeRunes } = require('./36_runes_profil');
      const base = (champions[id] || {}).base || {};
      const r = statsDeRunes(extras.runes, p, base.adaptatifAP, { minutes: extras.minutes });
      appliquer(r.gains);
      p.runes = extras.runes;
      p.statsDeRunes = r.detail;
      p.runesRefusees = r.refus;
    }

    const opts = { fenetre: extras.fenetre };
    const avant = multiplicateursStat(p, 'avant', opts);
    appliquer(avant.gains);
    const acc = statsAccordees(p);
    appliquer(acc.gains);
    const apres = multiplicateursStat(p, 'apres', opts);
    appliquer(apres.gains);

    p.statsAccordees = acc.detail;
    p.multiplicateurs = avant.detail.concat(apres.detail);
    p.statsRefusees = acc.refus.concat(avant.refus, apres.refus);
  }

  /* Stats dérivées, recalculées EN DERNIER — après objets, runes et passifs. Les
     recalculer ici plutôt que de les incrémenter est la seule façon de respecter leurs
     formules propres : ratio de vitesse d'attaque du champion, plafond progressif de la
     vitesse de déplacement. */
  recalculerDerivees(p, (champions[id] || {}).base, niveau);
  return p;
}

/* ── 4. Résistances et pénétration ──────────────────────────────────────────────
   L'ORDRE compte et n'est pas commutatif. Séquence officielle :
     1. réduction plate      (peut faire passer la résistance sous zéro)
     2. réduction en %
     3. pénétration en %     (ignorée si la résistance est déjà ≤ 0)
     4. pénétration plate    (létalité — ne peut PAS faire descendre sous zéro)
   Appliquer la létalité avant la pénétration en pourcentage surestimerait les dégâts.

   ⚠ La létalité vaut 1 pour 1 depuis la V14.1. Les anciennes formules la faisaient
   dépendre du niveau : les reprendre serait un contresens. */
function resistEffective(resist, { reducPlate = 0, reducPct = 0, penPct = 0, penPlate = 0 } = {}) {
  let r = resist - reducPlate;
  r *= (1 - reducPct);
  if (r > 0) r *= (1 - penPct);
  if (r > 0) r = Math.max(0, r - penPlate);
  return r;
}

/* Réduction des dégâts par une résistance. Une résistance négative AUGMENTE les dégâts,
   mais avec un rendement dégressif — d'où la seconde branche. */
function multiplicateur(resistEff) {
  return resistEff >= 0 ? 100 / (100 + resistEff)
                        : 2 - 100 / (100 - resistEff);
}

/* Dégâts réellement subis. `type` vaut 'physique', 'magique' ou 'brut' :
   les dégâts bruts ignorent toute résistance, c'est le seul cas sans mitigation.

   `source` — 'competence', 'attaque' ou 'objet' — sert aux AMPLIFICATIONS, qui ne
   portent pas toutes sur les mêmes dégâts : la Lance de Shojin n'amplifie que les
   compétences, les Lunettes Hextech que les attaques. L'omettre reviendrait à étendre
   chaque amplification à tout, donc à gonfler les builds qui en portent une.

   L'amplification s'applique AVANT la mitigation, et se cumule additivement entre
   sources — l'inverse des pénétrations en pourcentage (cf. `amplification()`). */
function amplifier(brut, type, cible, attaquant, source) {
  if (!attaquant || !(attaquant.objets || []).length) return { brut, amp: null };
  const { amplification } = require('./30_moteur_items');
  const a = amplification(attaquant, cible, type, source);
  return { brut: brut * a.facteur, amp: a };
}

const AUCUNE_REDUCTION = { armurePct: 0, rmPct: 0, armurePlate: 0, rmPlate: 0, detail: [], refus: [] };
function reductionsDeLAttaquant(attaquant) {
  if (!attaquant || !(attaquant.objets || []).length) return AUCUNE_REDUCTION;
  const { reductionResistances } = require('./30_moteur_items');
  return reductionResistances(attaquant, { ultimeLance: attaquant.ultimeLance });
}

function mitiger(brut, type, cible, attaquant, source) {
  const { brut: ampli, amp } = amplifier(brut, type, cible, attaquant, source);
  if (type === 'brut')
    return { subis: ampli, resistEff: 0, multiplicateur: 1, amplification: amp };
  const physique = type === 'physique';

  /* Réductions de résistance apportées par les OBJETS de l'attaquant (Couperet noir,
     Malédiction du sanguinaire). Elles abaissent la résistance de la cible avant toute
     pénétration — d'où leur place dans `reducPct` / `reducPlate` et non dans `penPct`.
     Elles se composent multiplicativement avec une réduction déjà portée par la cible. */
  const red = reductionsDeLAttaquant(attaquant);
  const cumulPct = (a, b) => 1 - (1 - a) * (1 - b);

  const eff = resistEffective(physique ? cible.armure : cible.rm, {
    reducPlate: (physique ? (cible.reducArmurePlate || 0) : (cible.reducRmPlate || 0))
                + (physique ? red.armurePlate : red.rmPlate),
    reducPct:   cumulPct(physique ? (cible.reducArmurePct || 0) : (cible.reducRmPct || 0),
                         physique ? red.armurePct : red.rmPct),
    penPct:     physique ? (attaquant.penArmurePct || 0) : (attaquant.penMagiquePct || 0),
    penPlate:   physique ? (attaquant.letalite || 0)     : (attaquant.penMagiquePlate || 0)
  });
  const m = multiplicateur(eff);
  return { subis: ampli * m, resistEff: eff, multiplicateur: m, amplification: amp };
}

/* ── 5. Évaluation d'un sort ────────────────────────────────────────────────────── */
function valeurTerme(t, p) {
  switch (t.stat) {
    case 'flat':
      if (t.mode === 'parNiveau') {
        // interpolation entre les deux bornes du niveau 1 au 18
        if (t.jusqua == null) return t.valeur;
        return t.valeur + (t.jusqua - t.valeur) * (p.niveau - 1) / 17;
      }
      return t.valeur;
    case 'AD':  return t.valeur * (t.mode === 'bonus' ? p.adBonus : t.mode === 'base' ? p.adBase : p.adTotal);
    case 'AP':  return t.valeur * p.ap;
    case 'PV':  return t.valeur * (t.mode === 'bonus' ? p.pvBonus : p.pvMax);
    case 'Armure': return t.valeur * p.armure;
    case 'RM':  return t.valeur * p.rm;
    /* Mana maximum — indispensable à Ryze, dont les quatre sorts en dépendent.
       `null` sur un champion à énergie : refuser vaut mieux que compter zéro. */
    case 'Mana': return p.mana == null ? null : t.valeur * p.mana;
    default:    return null;                      // stat non gérée : on refuse, on n'invente pas
  }
}

/* Évalue un calcul nommé d'un sort. Renvoie null plutôt qu'un chiffre approché dès
   qu'un terme n'est pas modélisable : un calculateur qui invente est pire qu'absent. */
function evaluerCalcul(champId, touche, nomCalcul, rang, p, cible) {
  const c = champions[champId];
  const sort = c && c.sorts[touche];
  const calc = sort && sort.calculs[nomCalcul];
  if (!calc) return { ok: false, raison: 'calcul absent' };
  const termes = calc.parRang[String(rang)];
  if (!termes) return { ok: false, raison: 'rang non résolu' };

  let brut = 0; const detail = [];
  for (const t of termes) {
    const v = valeurTerme(t, p);
    if (v == null) return { ok: false, raison: 'terme non modélisé : ' + t.stat + '/' + t.mode };
    brut += v;
    detail.push({ part: t.stat === 'flat' ? 'base' : t.stat + (t.mode === 'bonus' ? ' bonus' : ''),
                  valeur: Math.round(v * 100) / 100 });
  }

  const type = sort.typeDegats;
  if (calc.genre !== 'degats' || !type || /^mixte/.test(type)) {
    return { ok: true, genre: calc.genre, brut: Math.round(brut * 100) / 100,
             subis: null, type: type || null, detail,
             note: calc.genre !== 'degats' ? 'ce calcul n\'est pas des dégâts'
                   : 'type de dégâts non tranché (' + (type || 'absent') + ') : mitigation non appliquée' };
  }
  const m = cible ? mitiger(brut, type, cible, p, 'competence') : null;
  return {
    ok: true, genre: 'degats', type,
    brut: Math.round(brut * 100) / 100,
    subis: m ? Math.round(m.subis * 100) / 100 : null,
    resistEff: m ? Math.round(m.resistEff * 100) / 100 : null,
    amplification: m && m.amplification && m.amplification.total ? m.amplification : null,
    detail
  };
}

/* ── 6. Attaques de base ────────────────────────────────────────────────────────
   Indispensable : sur une ADC, l'essentiel des dégâts ne vient pas des compétences.
   Un comparateur de builds qui les ignore désigne le mauvais gagnant.

   Coup moyen = AD × (1 + chance de critique × (multiplicateur − 1 + bonus de critique))
   Le multiplicateur est lu par champion : il vaut 2 partout SAUF Ashe, dont les coups
   critiques n'infligent aucun dégât supplémentaire (multiplicateur 1). Le coder en dur
   aurait doublé ses dégâts d'attaque.

   ⚠ Sur un champion dont les coups critiques ne font AUCUN bonus, le bonus de dégâts
   critiques des objets ne s'applique pas non plus — le wiki est explicite sur Ashe :
   « l'amplification de dégâts critiques de la Lame d'infini ne lui profite pas ».
   Ajouter ce bonus lui aurait accordé +30 % de dégâts d'attaque inexistants.

   ⚠ Limite : le passif d'Ashe convertit sa CHANCE de critique en dégâts d'attaque
   bonus. Ce gain-là n'est pas modélisé (c'est un passif de champion, pas d'objet) :
   ses dégâts sont donc sous-estimés ici, jamais surestimés. */
function degatsAttaque(p, cible) {
  const base = champions[p.champion].base;
  const mult = base.critMult != null ? base.critMult : 2;
  const gainCritique = mult <= 1 ? 0 : (mult - 1 + (p.degatsCrit || 0));
  const parCoupBrut = p.adTotal * (1 + p.crit * gainCritique);
  const m = cible ? mitiger(parCoupBrut, 'physique', cible, p, 'attaque') : null;
  const parCoup = m ? m.subis : parCoupBrut;
  return {
    parCoupBrut: Math.round(parCoupBrut * 100) / 100,
    parCoup: Math.round(parCoup * 100) / 100,
    vitesseAttaque: Math.round(p.vitesseAttaque * 1000) / 1000,
    dps: Math.round(parCoup * p.vitesseAttaque * 100) / 100,
    multiplicateurCritique: mult
  };
}

/* ── 7. Accélération de compétence ──────────────────────────────────────────────
   Stat extraite sur 65 objets et longtemps inutilisée — or c'est elle qui décide un
   build sur la durée : elle ne change pas un combo, elle change le NOMBRE de combos.

   Réduction = accélération / (100 + accélération), donc recharge = base × 100/(100+A).
   Elle se cumule de façon additive et plafonne à 500 (soit 83,3 % de réduction).
   Attention au raccourci tentant « 40 d'accélération = 40 % de réduction » : c'est
   28,6 %, pas 40 %. */
const PLAFOND_ACCEL = 500;
function rechargeReelle(base, accel) {
  const a = Math.max(0, Math.min(PLAFOND_ACCEL, accel || 0));
  return base * 100 / (100 + a);
}

/* Dégâts cumulés sur une fenêtre de temps. C'est la seule mesure où l'accélération
   compte, et la plus proche d'un vrai combat : on relance une compétence dès qu'elle
   est disponible, et on attaque entre-temps.

   Hypothèses assumées, à ne pas prendre pour la réalité : cible immobile à portée,
   aucun coût en mana, aucun sort manqué, aucun temps d'incantation. Le chiffre sert à
   COMPARER deux builds, pas à prédire un combat. */
function degatsSurFenetre(champId, p, cible, secondes, evaluerSort, coupBonus = 0) {
  const c = champions[champId];
  if (!c) return null;
  let total = 0;
  const lignes = [];

  const refus = [];
  ['Q', 'W', 'E', 'R'].forEach(touche => {
    const s = c.sorts[touche];
    if (!s || !Array.isArray(s.cooldown)) return;
    const degats = evaluerSort(touche);
    if (degats == null) return;

    /* Compétences à charges : le « cooldown » n'est alors que le délai entre deux
       tirs (0,5 s pour le E de Rumble). Ce qui limite vraiment, c'est la recharge
       d'une charge. Sans ce cas, on comptait 21 lancers en 10 s au lieu de 3. */
    let cdBase, lancers, note = null;
    if (s.maxCharges > 0 && s.rechargeCharge > 0) {
      const entreLancers = s.cooldown[s.nbRangs] || 0;
      /* Deux verrous, et c'est le plus contraignant qui gouverne : il faut une charge
         disponible ET la recharge écoulée. Ne regarder que la recharge de charge
         surestimerait le R de LeBlanc (5 s de charge, mais 25 s de recharge). */
      cdBase = Math.max(entreLancers, s.rechargeCharge);
      const cd = rechargeReelle(cdBase, p.accel);
      /* Réserve de départ : on ne peut vider ses charges d'un coup que si le délai
         entre deux lancers est court. Le E de Rumble enchaîne ses 2 tirs en 0,5 s ;
         le R d'Ashe, lui, attend 5 s entre deux. */
      const reserve = entreLancers <= 2 ? s.maxCharges : 1;
      lancers = reserve + Math.floor(secondes / cd);
      note = s.maxCharges + ' charges, ' + Math.round(cd * 10) / 10 + ' s chacune';
      lignes.push({ touche, lancers, recharge: Math.round(cd * 10) / 10,
                    rechargeBase: cdBase, parLancer: Math.round(degats), note });
      total += degats * lancers;
      return;
    }

    cdBase = s.cooldown[s.nbRangs] != null ? s.cooldown[s.nbRangs]
           : s.cooldown[s.cooldown.length - 1];
    if (!cdBase) return;
    /* Garde-fou : une recharge sous la seconde sans charges déclarées n'est pas une
       vraie recharge (délai d'enchaînement, sort à bascule). La compter donnerait des
       dizaines de lancers. On refuse et on le dit, plutôt que de gonfler le chiffre. */
    if (cdBase < 1) {
      refus.push(touche + ' : recharge annoncée de ' + cdBase + ' s, sans charges déclarées');
      return;
    }
    const cd = rechargeReelle(cdBase, p.accel);
    // premier lancer à t = 0, puis un par recharge écoulée
    lancers = 1 + Math.floor(secondes / cd);
    total += degats * lancers;
    lignes.push({ touche, lancers, recharge: Math.round(cd * 10) / 10,
                  rechargeBase: cdBase, parLancer: Math.round(degats) });
  });

  const coups = Math.floor(secondes * p.vitesseAttaque);
  total += coups * coupBonus;
  lignes.push({ touche: 'AA', lancers: coups, parLancer: Math.round(coupBonus) });

  return { total: Math.round(total), lignes, refus, accel: p.accel,
           reduction: Math.round((p.accel / (100 + p.accel)) * 1000) / 10 };
}

/* Cible « mannequin » : un champion nu au même niveau. Sert de référence neutre pour
   comparer deux builds sans supposer l'équipement de l'adversaire. */
function cibleChampion(id, niveau, objets) {
  const p = profil(id, niveau, objets || [], { fenetre: 10 });
  if (!p) return null;
  /* `pvBonus` est indispensable au Tueur de géants, qui amplifie selon les PV BONUS de
     la cible : sans lui, l'objet serait refusé faute de savoir contre qui il frappe.
     `pvActuels` reste à pleine vie par défaut — l'hypothèse la moins favorable aux
     objets conditionnés par les PV manquants, donc la plus prudente. */
  return { nom: p.nom, niveau, armure: p.armure, rm: p.rm,
           pvMax: p.pvMax, pvBonus: p.pvBonus, pvActuels: p.pvMax };
}

module.exports = { croissance, vitesseAttaque, vitesseDeplacement,
                   statsChampion, statsObjets, profil,
                   resistEffective, multiplicateur, mitiger, evaluerCalcul,
                   degatsAttaque, degatsSurFenetre, rechargeReelle, cibleChampion,
                   itemParId, champions };
