/* Moteur d'évaluation des passifs d'objet.

   Comme pour les runes : les nombres viennent du fichier de jeu, seul le comportement
   est encodé (`items_modeles.js`). Un objet sans modèle renvoie « non modélisé »,
   jamais une valeur approchée.

   Le point délicat, propre aux objets : certains pourcentages portent sur la CIBLE
   (la Lame du roi déchu frappe un pourcentage des PV actuels de l'adversaire) et non
   sur le porteur. Confondre les deux fait varier le résultat du simple au triple selon
   l'état de la cible. */

const items = require('./items.json');
const MODELES = require('./items_modeles');

const parId = {};
items.forEach(o => { parId[o.id] = o; });

/* Valeur d'un terme résolu, dans le contexte du porteur et de la cible.
   `surCible` détourne les termes de PV vers la cible : c'est le seul cas où une
   formule d'objet ne parle pas du porteur. */
function valeurTerme(t, p, cible) {
  const n = p.niveau || 18;
  switch (t.stat) {
    case 'flat':
      if (t.mode === 'parNiveau') {
        if (t.jusqua == null) return t.valeur;
        return t.valeur + (t.jusqua - t.valeur) * (n - 1) / 17;
      }
      return t.valeur;
    case 'AD':  return t.valeur * (t.mode === 'bonus' ? p.adBonus
                                 : t.mode === 'base' ? p.adBase : p.adTotal);
    case 'AP':  return t.valeur * p.ap;
    case 'PV':  return t.valeur * (t.mode === 'bonus' ? p.pvBonus : p.pvMax);
    case 'PVactuelsCible': return cible ? t.valeur * pvActuels(cible) : null;
    case 'Armure': return t.valeur * p.armure;
    case 'RM':     return t.valeur * p.rm;
    /* Mana maximum. `null` sur un champion à énergie ou à fureur : on refuse plutôt
       que de compter zéro, sinon le Manamune paraîtrait ne rien donner alors qu'il
       est simplement inapplicable. */
    case 'Mana':   return p.mana == null ? null : t.valeur * p.mana;
    /* Stats du porteur dont certains passifs dépendent : la Faux spectrale ajoute
       50 × la chance de critique, le Glaive d'ombre 1,5 × la létalité. Les refuser
       privait le calculateur d'objets entiers. */
    case 'Crit':       return t.valeur * (p.crit || 0);
    case 'DegatsCrit': return t.valeur * (p.degatsCrit || 0);
    case 'Letalite':   return t.valeur * (p.letalite || 0);
    case 'Accel':      return t.valeur * (p.accel || 0);
    case 'VitesseAttaque': return t.valeur * (p.vitesseAttaque || 0);
    default:       return null;          // stat non gérée : refus, jamais d'à-peu-près
  }
}

/* Facteur porté par la CIBLE.

   Piège coûteux : le fichier de jeu ne range PAS le pourcentage et sa base dans le
   même calcul. La Lame du roi déchu stocke « 0,09 » dans `MeleeItemCalcValue` et la
   multiplication par les PV actuels de l'adversaire dans un calcul séparé. Lire le
   premier seul donnait « 0,06 points de dégâts » au lieu de 145 — une erreur d'un
   facteur 2400, silencieuse et parfaitement plausible à l'œil.

   D'où ce facteur appliqué en fin de calcul, déclaré objet par objet. */
function facteurCible(surCible, cible) {
  if (!surCible) return { f: 1, libelle: null };
  if (!cible) return null;
  if (surCible === 'pvMax')
    return { f: cible.pvMax, libelle: 'PV max de la cible' };
  if (surCible === 'pvActuels')
    return { f: pvActuels(cible), libelle: 'PV actuels de la cible' };
  return null;
}

/* PV actuels de la cible. Par défaut on suppose la cible à pleine vie — c'est le cas
   le moins favorable aux objets en pourcentage de vie actuelle, donc le plus prudent
   dans une comparaison de builds. */
const pvActuels = c => c.pvActuels != null ? c.pvActuels : c.pvMax;

function evaluerPassif(id, p, cible, options = {}) {
  const o = parId[id];
  if (!o) return { ok: false, raison: 'objet inconnu ou hors Faille' };
  const m = MODELES[id];
  if (!m) return { ok: false, raison: 'non modélisé', nom: o.nom };
  if (m.nonApplique) return { ok: true, nom: o.nom, applique: false, raison: m.nonApplique };

  /* Version à distance : soit un autre calcul entier, soit un simple facteur.
     Le facteur porté par le calcul lui-même (mRangedMultiplier) est déjà résolu à
     l'extraction et voyage avec le terme. */
  let nomCalcul = m.calcul;
  if (p.distance && m.distance && m.distance.calcul) nomCalcul = m.distance.calcul;

  let brut = null; const detail = [];
  if (nomCalcul) {
    const c = o.calculs[nomCalcul];
    if (!c) return { ok: false, raison: 'calcul absent du fichier de jeu : ' + nomCalcul, nom: o.nom };
    const termes = c.conditionnel ? (p.distance ? c.siCondition : c.defaut) : c.termes;
    if (!termes) return { ok: false, raison: 'branche non résolue', nom: o.nom };
    brut = 0;
    for (const t of termes) {
      let v = valeurTerme(t, p, cible);
      if (v == null) return { ok: false, nom: o.nom,
                              raison: 'terme non modélisé : ' + t.stat + '/' + t.mode };
      // facteur « à distance » porté par le calcul (les deux Hydres)
      if (p.distance && t.facteurDistance != null) v *= t.facteurDistance;
      brut += v;
      detail.push({ part: t.stat === 'flat' ? 'base' : t.stat, valeur: Math.round(v * 100) / 100 });
    }
  } else if (m.valeur) {
    const v = o.valeurs[m.valeur];
    if (v == null) return { ok: false, raison: 'valeur absente : ' + m.valeur, nom: o.nom };
    brut = v;
    detail.push({ part: m.valeur, valeur: v });
    // facteur « à distance » exprimé comme une simple clé
    if (p.distance && m.distance && m.distance.facteur && o.valeurs[m.distance.facteur] != null) {
      brut *= o.valeurs[m.distance.facteur];
      detail.push({ part: 'à distance ×' + o.valeurs[m.distance.facteur], valeur: null });
    }
  } else if (m.statsAccordees) {
    /* Passif qui accorde une stat plutôt que des dégâts : il est traité par
       `statsAccordees()` et intégré au profil. On renvoie ici le montant accordé, pour
       que l'objet ne passe pas pour « non évaluable » alors qu'il est parfaitement
       modélisé. */
    brut = 0;
    for (const { stat, calcul } of m.statsAccordees) {
      const c = o.calculs[calcul];
      if (!c || !c.termes) return { ok: false, nom: o.nom, raison: 'calcul absent : ' + calcul };
      for (const t of c.termes) {
        const v = valeurTerme(t, p, cible);
        if (v == null) return { ok: false, nom: o.nom,
                                raison: 'terme non modélisé : ' + t.stat + '/' + t.mode };
        brut += v;
        detail.push({ part: stat + ' ← ' + t.stat, valeur: Math.round(v * 100) / 100 });
      }
    }
  } else {
    return { ok: false, raison: 'modèle sans calcul ni valeur', nom: o.nom };
  }

  /* Le pourcentage devient un montant. Sans cible, on refuse : afficher « 0,09 » là
     où le jeu inflige 145 serait pire que ne rien afficher. */
  const fc = facteurCible(m.surCible, cible);
  if (!fc) return { ok: false, nom: o.nom,
                    raison: 'pourcentage porté par la cible, mais aucune cible fournie' };
  if (fc.f !== 1) {
    brut *= fc.f;
    detail.push({ part: '× ' + fc.libelle + ' (' + Math.round(fc.f) + ')', valeur: null });
  }

  // Plafond contre monstres — sans effet sur un champion, mais on le transporte
  let plafond = null;
  if (m.plafond && o.valeurs[m.plafond.cle] != null) plafond = o.valeurs[m.plafond.cle];
  if (plafond != null && options.contre === 'monstres') brut = Math.min(brut, plafond);

  return {
    ok: true, applique: true, id, objet: o.nom, nom: m.nom,
    effet: m.effet, typeDegats: m.typeDegats,
    declencheur: m.declencheur,
    brut: Math.round(brut * 100) / 100,
    parSeconde: !!m.parSeconde,
    plafondMonstres: plafond,
    detail, note: m.note || null
  };
}

/* Somme des passifs de coup à l'impact d'un build : ce qui s'ajoute à CHAQUE attaque
   de base. C'est le chiffre qui manquait au comparateur, et qui décide les builds à
   vitesse d'attaque. */
function coupsAImpact(p, cible, options = {}) {
  const lignes = []; const refus = [];
  let subisTotal = 0;
  (p.objets || []).forEach(id => {
    const m = MODELES[id];
    if (!m || !m.declencheur) return;
    const type = m.declencheur.type;
    /* Deux cadences entrent dans les dégâts par seconde :
         — « à chaque attaque » : le montant entier ;
         — « un coup sur n » : le montant AMORTI sur n attaques.
       Amortir est exact sur la durée, et bien plus juste que d'exclure l'objet : le
       Tueur de krakens frappe un coup sur trois, il vaut donc un tiers de son montant
       par attaque. L'ajouter en entier le triplerait ; l'exclure l'effacerait. */
    let part = 1;
    if (type === 'toutesNAttaques') part = 1 / Math.max(1, m.declencheur.n || 1);
    else if (type !== 'coupAImpact') return;

    const e = evaluerPassif(id, p, cible, options);
    if (!e.ok) { refus.push((e.nom || id) + ' : ' + e.raison); return; }
    const mit = options.mitiger ? options.mitiger(e.brut, e.typeDegats, cible, p) : null;
    const subis = (mit ? mit.subis : e.brut) * part;
    subisTotal += subis;
    lignes.push({ objet: e.objet, nom: e.nom, type: e.typeDegats,
                  brut: e.brut, subis: Math.round(subis * 100) / 100,
                  cadence: part === 1 ? 'chaque attaque'
                         : '1 attaque sur ' + m.declencheur.n + ' (amorti)',
                  note: e.note });
  });
  return { subis: subisTotal, lignes, refus };
}

/* Stats accordées par les passifs d'objet (Manamune : 2 % du mana max en dégâts
   d'attaque ; Gage de Sterak : 50 % de l'AD de base).

   Elles ne s'ajoutent pas aux dégâts, elles modifient le PROFIL — donc tous les ratios
   de sorts et toutes les attaques qui suivent. Les ignorer, c'est perdre plus de 30
   dégâts d'attaque sur un Ryze au Manamune, silencieusement.

   ⚠ Une seule passe, volontairement : les stats accordées sont calculées sur le profil
   AVANT passifs. Aucun objet actuel n'accorde une stat que lit un autre passif (le
   Manamune lit le mana, Sterak lit l'AD de base, ni l'un ni l'autre ne lit l'AD bonus),
   donc l'ordre n'a pas d'incidence. Si un objet le faisait un jour, il faudrait itérer
   — la note est ici pour qu'on s'en souvienne. */
function statsAccordees(p) {
  const gains = {}; const detail = []; const refus = [];
  (p.objets || []).forEach(id => {
    const m = MODELES[id];
    if (!m || !m.statsAccordees) return;
    const o = parId[id];
    m.statsAccordees.forEach(({ stat, calcul }) => {
      const c = o.calculs[calcul];
      if (!c || !c.termes) { refus.push(o.nom + ' : calcul absent ' + calcul); return; }
      let v = 0; let ok = true;
      c.termes.forEach(t => {
        const x = valeurTerme(t, p, null);
        if (x == null) { ok = false; return; }
        v += x;
      });
      if (!ok) { refus.push(o.nom + ' : terme non modélisé'); return; }
      gains[stat] = (gains[stat] || 0) + v;
      detail.push({ objet: o.nom, nom: m.nom, stat, valeur: Math.round(v * 100) / 100 });
    });
  });
  return { gains, detail, refus };
}

/* État de la modélisation, sans arrondi flatteur : combien d'objets finis portent un
   passif chiffré, et combien sont réellement appliqués aux dégâts. */
function couverture() {
  const finis = items.filter(o => o.fini && o.prix >= 1800);
  const avecPassif = finis.filter(o => Object.keys(o.calculs).length || Object.keys(o.valeurs).length);
  const modelises = avecPassif.filter(o => MODELES[o.id] && !MODELES[o.id].nonApplique);
  const ecartes = avecPassif.filter(o => MODELES[o.id] && MODELES[o.id].nonApplique);
  const sansModele = avecPassif.filter(o => !MODELES[o.id]);
  return { finis, avecPassif, modelises, ecartes, sansModele };
}

module.exports = { evaluerPassif, coupsAImpact, statsAccordees, couverture, MODELES, parId };
