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
    /* Les deux autres formes de PV de la cible. Le résolveur ne les produisait pas
       encore : le drapeau qui marque « stat de la CIBLE » était ignoré, si bien que
       l'exécution de l'Atlas se calculait sur les PV du PORTEUR — d'autant plus faux
       que le porteur est justement un tank. */
    case 'PVmaxCible':       return cible && cible.pvMax != null ? t.valeur * cible.pvMax : null;
    case 'PVmanquantsCible': return cible && cible.pvMax != null
                                    ? t.valeur * Math.max(0, cible.pvMax - pvActuels(cible)) : null;
    /* ⚠ Le MODE était ignoré sur ces deux stats : `p.armure` (le total) était servi là
       où la formule demande l'armure BONUS. Les PV et l'AD, juste au-dessus, le
       respectaient depuis toujours — l'oubli ne portait que sur les résistances.
       Le Lien vital du Harnais protoplasmique rend « 175 % de l'armure bonus + 175 %
       de la RM bonus » : sur un Sion équipé, le total au lieu du bonus donnait 1 055 PV
       au lieu de 750, soit 40 % de trop. La base du champion était comptée comme si
       elle venait de l'équipement. */
    case 'Armure': return t.valeur * (t.mode === 'bonus' ? p.armureBonus : p.armure);
    case 'RM':     return t.valeur * (t.mode === 'bonus' ? p.rmBonus : p.rm);
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
  } else if (m.termesDeclares) {
    /* Termes DÉCLARÉS : le fichier porte les nombres dans ses DataValues sans les
       assembler en `mItemCalculations`. On déclare alors la formule — jamais les
       valeurs, qui restent lues dans `o.valeurs`. Un terme dont la clé manque est
       refusé, pas approché. */
    brut = 0;
    for (const t of m.termesDeclares) {
      const coef = o.valeurs[t.cle];
      if (coef == null) return { ok: false, nom: o.nom, raison: 'valeur absente : ' + t.cle };
      const v = valeurTerme({ stat: t.stat, mode: t.mode, valeur: coef }, p, cible);
      if (v == null) return { ok: false, nom: o.nom,
                              raison: 'terme non modélisé : ' + t.stat + '/' + t.mode };
      brut += v;
      detail.push({ part: t.stat === 'flat' ? 'base' : t.stat, valeur: Math.round(v * 100) / 100 });
    }
    if (p.distance && m.distance && m.distance.facteur && o.valeurs[m.distance.facteur] != null) {
      brut *= o.valeurs[m.distance.facteur];
      detail.push({ part: 'à distance ×' + o.valeurs[m.distance.facteur], valeur: null });
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
    const r = statsAccordees({ ...p, objets: [id] });
    if (r.refus.length) return { ok: false, nom: o.nom, raison: r.refus[0] };
    brut = Object.values(r.gains).reduce((s, v) => s + v, 0);
    r.detail.forEach(d => detail.push({ part: d.stat, valeur: d.valeur }));
  } else if (m.effet === 'reductionCrit' || m.effet === 'ralentAttaqueCible' ||
             m.effet === 'soinsRecus') {
    /* Défenses conditionnelles : elles ne produisent NI dégâts NI montant de soin, mais
       un FACTEUR appliqué ailleurs (`34_modele_survie.defenses`). Sans ce cas, elles
       remontaient « modèle sans calcul ni valeur » — un objet parfaitement modélisé
       passait pour inévaluable, ce qui est le plus mauvais des deux mondes : compté
       comme couvert dans l'audit, refusé à l'usage. */
    const cle = m[m.effet].valeur;
    const v = o.valeurs[cle];
    if (v == null) return { ok: false, nom: o.nom, raison: 'valeur absente : ' + cle };
    brut = v;
    detail.push({ part: cle, valeur: v });
  } else if (m.effet === 'soin' && m.soin && m.soin.calcul) {
    const c = o.calculs[m.soin.calcul];
    if (!c || !c.termes) return { ok: false, nom: o.nom, raison: 'calcul absent : ' + m.soin.calcul };
    brut = 0;
    for (const t of c.termes) {
      const v = valeurTerme(t, p, cible);
      if (v == null) return { ok: false, nom: o.nom, raison: 'terme non modélisé : ' + t.stat };
      brut += v;
      detail.push({ part: t.stat === 'flat' ? 'base' : t.stat, valeur: Math.round(v * 100) / 100 });
    }
  } else if (m.amplification && m.amplification.surHypothese) {
    /* Amplification conditionnée à une hypothèse : sans elle, ce n'est pas un échec du
       modèle mais un refus DÉLIBÉRÉ, au même titre que `nonApplique`. On le dit avec la
       même forme, pour que l'audit ne le compte pas comme une panne. */
    const h = (options.hypotheses || {})[m.amplification.surHypothese.condition];
    if (h == null) {
      return { ok: true, nom: o.nom, applique: false,
               raison: m.amplification.surHypothese.quoi +
                       ' — fournissez `hypotheses.' + m.amplification.surHypothese.condition + '`' };
    }
    const a = amplification(p, cible, null, null, options);
    const d = a.detail.find(x => x.objet === o.nom);
    brut = d ? d.pourcent : 0;
    detail.push({ part: 'amplification', valeur: brut });
  } else if (m.multiplicateursStat) {
    /* Passif multiplicateur : traité par `multiplicateursStat()` et intégré au profil.
       On renvoie ici le montant de stat gagné, pour que l'objet ne passe pas pour
       « non évaluable » alors qu'il est modélisé. */
    const r = multiplicateursStat({ ...p, objets: [id] }, m.phase || 'apres',
                                  { fenetre: options.fenetre });
    if (r.refus.length) return { ok: false, nom: o.nom, raison: r.refus[0] };
    brut = Object.values(r.gains).reduce((s, v) => s + v, 0);
    r.detail.forEach(d => detail.push({ part: d.stat + ' ×' + (1 + d.pourcent), valeur: d.valeur }));
  } else if (m.amplification) {
    /* Passif d'amplification : il n'a pas de montant propre, il multiplie ce que les
       autres calculent. On renvoie ici le POURCENTAGE applicable dans le contexte
       demandé — zéro quand la condition n'est pas remplie (la Flamme-ombre contre une
       cible à pleine vie), ce qui est la réponse juste et non un refus. */
    const r = amplification({ ...p, objets: [id] }, cible,
                            (m.amplification.types || [])[0] || null, null,
                            { fenetre: options.fenetre });
    if (r.refus.length) return { ok: false, nom: o.nom, raison: r.refus[0] };
    brut = r.total;
    r.detail.forEach(d => detail.push({ part: 'amplification', valeur: d.pourcent }));
  } else if (m.reduction) {
    /* Passif de réduction : il n'a pas de montant de dégâts, il abaisse une résistance.
       On renvoie le montant retiré — un pourcentage ou des points selon le mode. */
    const r = reductionResistances({ ...p, objets: [id] },
                                   { ultimeLance: true });   // inspection : condition supposée
    if (r.refus.length) return { ok: false, nom: o.nom, raison: r.refus[0] };
    brut = r.detail.reduce((s, d) => s + d.valeur, 0);
    r.detail.forEach(d => detail.push({ part: d.resistance + ' (' + d.mode + ')', valeur: d.valeur }));
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
    /* Source « objet » : la Lance de Shojin amplifie les procs d'objet, les Lunettes
       Hextech non. Passer la source évite d'appliquer l'une pour l'autre. */
    const mit = options.mitiger ? options.mitiger(e.brut, e.typeDegats, cible, p, 'objet') : null;
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

   ⚠ Les CHAÎNES de dépendance existent bel et bien, contrairement à ce que je croyais
   au départ : l'Approche de l'hiver convertit le mana en PV, l'Armure sanguine convertit
   les PV bonus en dégâts d'attaque. Additionner les deux sur un même profil figé ferait
   perdre à la seconde tout ce que la première a accordé.

   D'où l'application INCRÉMENTALE sur une copie du profil, dans l'ordre déclaré par le
   champ `ordre` : chaque passif voit le résultat de ceux qui le précèdent. Les gains
   totaux sont renvoyés à l'appelant, qui les applique une seule fois au vrai profil —
   une seule voie d'application, donc un seul endroit où se tromper. */
function appliquerGain(p, stat, v) {
  /* Stats DÉRIVÉES : on incrémente le bonus brut, pas la valeur calculée. Ajouter
     « +10 % » à une vitesse d'attaque de 0,83 donnerait 10,83 attaques par seconde. */
  if (stat === 'vitesseAttaque') { p.bonusVitesseAttaque = (p.bonusVitesseAttaque || 0) + v; return; }
  if (stat === 'ad') { p.adBonus += v; p.adTotal += v; }
  else if (stat === 'ap') p.ap += v;
  else if (stat === 'pv') { p.pvBonus += v; p.pvMax += v; }
  else if (stat === 'armure') { p.armure += v; p.armureBonus += v; }
  else if (stat === 'rm') { p.rm += v; p.rmBonus += v; }
  /* `|| 0` et non `if (p[stat] != null)` : une rune peut apporter une stat qu'AUCUN
     objet du build ne porte (vitesse de déplacement en %, ténacité, vol de vie). La
     version prudente laissait alors tomber le gain sans un mot — c'est exactement la
     fuite qu'on vient de boucher dans `profil()`. */
  else p[stat] = (p[stat] || 0) + v;
}

function statsAccordees(profilInitial) {
  const gains = {}; const detail = []; const refus = [];
  const p = { ...profilInitial };            // copie de travail, l'original est intact
  const ordonnes = (p.objets || []).slice().sort(
    (a, b) => ((MODELES[a] || {}).ordre || 0) - ((MODELES[b] || {}).ordre || 0));
  ordonnes.forEach(id => {
    const m = MODELES[id];
    if (!m || !m.statsAccordees) return;
    const o = parId[id];
    m.statsAccordees.forEach(({ stat, calcul, valeur, base, cumuls, baseSiAbsente }) => {
      let v = 0;
      if (calcul) {
        const c = o.calculs[calcul];
        if (!c || !c.termes) { refus.push(o.nom + ' : calcul absent ' + calcul); return; }
        let ok = true;
        c.termes.forEach(t => {
          const x = valeurTerme(t, p, null);
          if (x == null) { ok = false; return; }
          v += x;
        });
        if (!ok) { refus.push(o.nom + ' : terme non modélisé'); return; }
      } else {
        /* Second cas : le fichier ne porte qu'un pourcentage nu, sans formule. La base
           est alors déclarée dans le modèle, d'après la description en jeu, et lue sur
           le profil — jamais devinée. Un pourcentage sans base est refusé. */
        const brut = o.valeurs[valeur];
        if (brut == null) { refus.push(o.nom + ' : valeur absente ' + valeur); return; }
        /* Sans `base`, la clé porte un montant PLAT (30 d'accélération d'ultime) et non
           un pourcentage : on la sert telle quelle. Avec `base`, c'est une proportion
           d'une stat du profil, qui doit exister — un pourcentage sans base est refusé. */
        if (base == null) v = brut;
        else if (p[base] == null) {
          /* Base absente du profil. Refuser est le bon réflexe par défaut — c'est ce
             qui empêche de servir « 2 % du mana » à un champion à énergie, où zéro
             serait faux et non incomplet. Mais certaines bases valent LÉGITIMEMENT
             zéro quand aucun objet ne les porte : sans régénération de mana bonus, la
             Première lumière n'accorde rien, et c'est exact. Le cas s'ouvre donc
             objet par objet, jamais globalement. */
          if (baseSiAbsente == null) { refus.push(o.nom + ' : base absente du profil (' + base + ')'); return; }
          v = brut * baseSiAbsente;
        }
        else v = brut * p[base];
      }
      /* Gain PAR CUMUL. Le Bâton séculaire accorde 10 PV, 30 mana et 3 puissance par
         minute, dix fois : servir la valeur unitaire aurait sous-estimé l'objet d'un
         facteur dix. Le nombre de cumuls est LU dans le fichier (`MaxStacks`), pas
         écrit ici, et l'hypothèse — cumuls au maximum — est dite dans la note de
         l'objet, comme pour la Lance de Shojin. */
      if (cumuls) {
        const n = o.valeurs[cumuls];
        if (n == null) { refus.push(o.nom + ' : nombre de cumuls absent (' + cumuls + ')'); return; }
        v *= n;
      }
      gains[stat] = (gains[stat] || 0) + v;
      appliquerGain(p, stat, v);            // le passif suivant verra ce gain
      detail.push({ objet: o.nom, nom: m.nom, stat, valeur: Math.round(v * 100) / 100 });
    });
  });
  return { gains, detail, refus };
}

/* Passifs qui MULTIPLIENT une stat (Coiffe de Rabadon : +30 % de puissance totale).

   Ils ne s'ajoutent pas, ils amplifient — c'est pourquoi ils ne peuvent pas cohabiter
   avec `statsAccordees` dans la même passe. Deux phases :
     'avant' — base issue des seuls objets ; doit précéder les stats accordées, qui la
               lisent (l'Armure sanguine convertit les PV bonus, Warmog compris) ;
     'apres' — base = la stat TOTALE ; doit englober ce que les autres ont accordé.

   `fenetre` (durée du combat, en secondes) sert aux passifs conditionnels : Jak'Sho ne
   s'arme qu'après 5 s de combat. Fenêtre inconnue → le passif est refusé, pas supposé.

   Renvoie des GAINS ABSOLUS (et non un facteur) pour que l'appelant les ajoute comme
   ceux de `statsAccordees` : une seule voie d'application, donc un seul endroit où se
   tromper. */
const BASES = {
  ap:     { total: p => p.ap },
  ad:     { total: p => p.adTotal, bonus: p => p.adBonus, base: p => p.adBase },
  pv:     { total: p => p.pvMax, bonus: p => p.pvBonus, objets: p => p.pvObjets },
  armure: { total: p => p.armure, bonus: p => p.armureBonus },
  rm:     { total: p => p.rm,     bonus: p => p.rmBonus }
};

function multiplicateursStat(p, phase, options = {}) {
  const gains = {}; const detail = []; const refus = [];
  (p.objets || []).forEach(id => {
    const m = MODELES[id];
    if (!m || !m.multiplicateursStat) return;
    if ((m.phase || 'apres') !== phase) return;
    const o = parId[id];

    if (m.condition && m.condition.apresSecondes != null) {
      const f = options.fenetre;
      if (f == null) { refus.push(o.nom + ' : ' + m.condition.libelle + ', durée de combat non fournie'); return; }
      if (f < m.condition.apresSecondes) { refus.push(o.nom + ' : ' + m.condition.libelle + ' (fenêtre de ' + f + ' s)'); return; }
    }

    m.multiplicateursStat.forEach(({ stat, portee, valeur }) => {
      const pct = o.valeurs[valeur];
      if (pct == null) { refus.push(o.nom + ' : valeur absente ' + valeur); return; }
      const lire = (BASES[stat] || {})[portee];
      if (!lire) { refus.push(o.nom + ' : portée non gérée ' + stat + '/' + portee); return; }
      const socle = lire(p);
      if (socle == null) { refus.push(o.nom + ' : base ' + stat + '/' + portee + ' indisponible'); return; }
      const v = pct * socle;
      gains[stat] = (gains[stat] || 0) + v;
      detail.push({ objet: o.nom, nom: m.nom, stat,
                    socle: Math.round(socle * 100) / 100,
                    pourcent: pct, valeur: Math.round(v * 100) / 100 });
    });
  });
  return { gains, detail, refus };
}

/* ── AMPLIFICATION DES DÉGÂTS ──────────────────────────────────────────────────
   Dernière des quatre catégories de passifs, et la seule qui ne produise ni dégâts ni
   stat : elle multiplie ce que les autres ont calculé.

   Deux règles vérifiées sur le wiki officiel avant d'écrire cette fonction, aucune des
   deux devinable :

   1. Les modificateurs de dégâts INFLIGÉS se cumulent ADDITIVEMENT — « Modifiers to
      damage dealt now stack additively instead of multiplicatively ». C'est l'inverse
      exact des pénétrations en pourcentage, qui se multiplient. Deux amplifications de
      10 % donnent +20 %, pas +21 %. Raisonner par symétrie avec les pénétrations aurait
      donné un chiffre faux, et plausible.
   2. L'amplification porte sur les dégâts AVANT mitigation ; la réduction par les
      résistances reste un facteur séparé.

   Une amplification ne s'applique pas à n'importe quoi :
     `portee` — la SOURCE des dégâts (compétence, attaque de base, passif d'objet) ;
     `types`  — le TYPE des dégâts (la Flamme-ombre ne touche pas le physique).
   Une amplification dont la condition n'est pas vérifiable est REFUSÉE avec son motif,
   jamais servie à sa valeur maximale : ce serait offrir un bonus permanent à l'objet
   qui le porte, précisément dans une comparaison de builds. */
const PORTEES = {
  /* `competences` couvre aussi les passifs d'objet : le wiki range explicitement les
     « proc damage » avec les dégâts de compétence pour la Lance de Shojin. */
  tous:        () => true,
  competences: src => src === 'competence' || src === 'objet',
  attaques:    src => src === 'attaque'
};

function amplification(p, cible, type, source, options = {}) {
  let total = 0; const detail = []; const refus = [];
  (p.objets || []).forEach(id => {
    const m = MODELES[id];
    if (!m || !m.amplification) return;
    const a = m.amplification;
    const o = parId[id];

    const portee = PORTEES[a.portee];
    if (!portee) { refus.push(o.nom + ' : portée non gérée ' + a.portee); return; }
    if (source && !portee(source)) return;                 // hors champ : silencieux
    if (a.types && type && !a.types.includes(type)) return;

    let pct = null;
    if (a.montee) {
      /* Montée en combat (Créateur de failles : 2 % par seconde, plafond 8 %). Sans
         durée de combat, on refuse — la servir au plafond offrirait +8 % permanents. */
      const f = options.fenetre != null ? options.fenetre : p.fenetre;
      if (f == null) { refus.push(o.nom + ' : montée en combat, durée non fournie'); return; }
      const parSec = o.valeurs[a.montee.parSeconde], plafond = o.valeurs[a.montee.plafond];
      if (parSec == null || plafond == null) { refus.push(o.nom + ' : clés de montée absentes'); return; }
      pct = Math.min(plafond, parSec * f);
    } else if (a.selonPVbonusCible) {
      /* Tueur de géants : dépend des PV BONUS de la cible, pas du porteur. Contre une
         cible sans PV bonus, l'amplification est nulle — et doit l'être. */
      if (!cible || cible.pvBonus == null) { refus.push(o.nom + ' : PV bonus de la cible inconnus'); return; }
      const max = o.valeurs[a.selonPVbonusCible.max], seuil = o.valeurs[a.selonPVbonusCible.plafondPV];
      if (max == null || !seuil) { refus.push(o.nom + ' : clés absentes'); return; }
      pct = max * Math.min(1, cible.pvBonus / seuil);
    } else if (a.calcul) {
      /* Cumuls (Lance de Shojin) : le fichier exprime le pas en POINTS de pourcentage
         (3 = 3 %), d'où la division. Version à distance quand le fichier en porte une. */
      const nom = (p.distance && a.distance && a.distance.calcul) ? a.distance.calcul : a.calcul;
      const c = o.calculs[nom];
      if (!c || !c.termes) { refus.push(o.nom + ' : calcul absent ' + nom); return; }
      let v = 0; let ok = true;
      c.termes.forEach(t => { const x = valeurTerme(t, p, cible); if (x == null) ok = false; else v += x; });
      if (!ok) { refus.push(o.nom + ' : terme non modélisé'); return; }
      if (a.unite === 'pourcent') v /= 100;
      if (a.cumuls) {
        const n = o.valeurs[a.cumuls];
        if (n == null) { refus.push(o.nom + ' : nombre de cumuls absent'); return; }
        v *= n;
      }
      pct = v;
    } else if (a.surHypothese) {
      /* Amplification conditionnée à un fait que le fichier ne porte pas — la DISTANCE
         à la cible, une immobilisation infligée. Trois objets sont dans ce cas, et ils
         étaient jusqu'ici purement refusés.

         Le modèle continue de ne rien supposer : sans hypothèse fournie par l'appelant,
         le refus tient, et il NOMME désormais la donnée qui le lèverait. Avec une
         hypothèse, le chiffre est servi et porte la mention de ce sur quoi il repose.
         Servir ces objets à leur maximum, comme le ferait un comparateur pressé,
         gonflerait de 10 % tout build qui les porte. */
      const h = (options.hypotheses || {})[a.surHypothese.condition];
      if (h == null) {
        refus.push(o.nom + ' : ' + a.surHypothese.quoi +
                   ' — fournissez `hypotheses.' + a.surHypothese.condition + '` pour la chiffrer');
        return;
      }
      const max = o.valeurs[a.surHypothese.valeur];
      if (max == null) { refus.push(o.nom + ' : valeur absente ' + a.surHypothese.valeur); return; }
      if (a.surHypothese.portee) {
        /* Montée PROPORTIONNELLE à la distance, bornée par la portée maximale du
           fichier : au-delà, l'amplification ne croît plus. En deçà, elle décroît —
           servir le plafond à bout portant aurait été le contresens exact. */
        const p0 = o.valeurs[a.surHypothese.portee];
        if (!p0) { refus.push(o.nom + ' : portée absente ' + a.surHypothese.portee); return; }
        pct = max * Math.min(1, Math.max(0, h) / p0);
        detail.push({ objet: o.nom, nom: m.nom, pourcent: Math.round(pct * 10000) / 10000,
                      hypothese: h + ' unités de distance à la cible, sur ' + p0 + ' au maximum' });
        total += pct;
        return;
      }
      /* Condition tout-ou-rien : l'hypothèse vaut un nombre d'occurrences ; une seule
         suffit à armer l'amplification pendant la fenêtre. */
      pct = h > 0 ? max : 0;
      detail.push({ objet: o.nom, nom: m.nom, pourcent: Math.round(pct * 10000) / 10000,
                    hypothese: h + ' × ' + a.surHypothese.quoi + ', fourni par l\'appelant' });
      total += pct;
      return;
    } else if (a.valeur) {
      pct = o.valeurs[a.valeur];
      if (pct == null) { refus.push(o.nom + ' : valeur absente ' + a.valeur); return; }
    } else { refus.push(o.nom + ' : amplification sans source de valeur'); return; }

    /* Seuil de PV de la cible (Flamme-ombre : sous 40 %). La cible est supposée à
       pleine vie par défaut : l'amplification vaut alors zéro, et c'est un plancher
       assumé — le contraire d'une moyenne inventée. */
    if (a.seuilPVCible) {
      const seuil = o.valeurs[a.seuilPVCible];
      if (!cible || cible.pvMax == null) { refus.push(o.nom + ' : PV de la cible inconnus'); return; }
      const part = (cible.pvActuels != null ? cible.pvActuels : cible.pvMax) / cible.pvMax;
      if (part >= seuil) return;                 // condition non remplie : aucun apport
    }

    total += pct;
    detail.push({ objet: o.nom, nom: m.nom, pourcent: Math.round(pct * 10000) / 10000 });
  });
  return { facteur: 1 + total, total, detail, refus };
}

/* ── RÉDUCTION DES RÉSISTANCES DE LA CIBLE ────────────────────────────────────
   Cinquième et dernière catégorie. Elle n'ajoute rien et n'amplifie rien : elle abaisse
   l'armure ou la résistance magique de l'adversaire.

   ⚠ Réduction n'est PAS pénétration. La séquence officielle, déjà codée dans
   `resistEffective`, est : réduction plate → réduction en % → pénétration en % →
   pénétration plate. La réduction passe donc AVANT, et les confondre change le
   résultat dès qu'un build porte les deux — le cas courant (Couperet noir +
   Salutations de Dominik).

   Les réductions en pourcentage se composent MULTIPLICATIVEMENT entre elles (deux fois
   20 % laissent 0,8 × 0,8 = 64 % de la résistance), comme les pénétrations et à
   l'inverse des amplifications de dégâts. */
function reductionResistances(p, options = {}) {
  const restant = { armure: 1, rm: 1 };
  const plat = { armure: 0, rm: 0 };
  const detail = []; const refus = [];

  (p.objets || []).forEach(id => {
    const m = MODELES[id];
    if (!m || !m.reduction) return;
    const r = m.reduction; const o = parId[id];

    if (r.condition && r.condition.apresUltime && !options.ultimeLance) {
      refus.push(o.nom + ' : ' + r.condition.libelle + ' — non déclaré'); return;
    }

    let v;
    if (r.calcul) {
      const c = o.calculs[r.calcul];
      if (!c || !c.termes) { refus.push(o.nom + ' : calcul absent ' + r.calcul); return; }
      v = 0; let ok = true;
      c.termes.forEach(t => { const x = valeurTerme(t, p, null); if (x == null) ok = false; else v += x; });
      if (!ok) { refus.push(o.nom + ' : terme non modélisé'); return; }
    } else {
      v = o.valeurs[r.valeur];
      if (v == null) { refus.push(o.nom + ' : valeur absente ' + r.valeur); return; }
      if (r.cumuls) {
        const n = o.valeurs[r.cumuls];
        if (n == null) { refus.push(o.nom + ' : nombre de cumuls absent'); return; }
        v *= n;
      }
    }

    if (r.mode === 'pourcent') restant[r.resistance] *= (1 - v);
    else plat[r.resistance] += v;
    detail.push({ objet: o.nom, nom: m.nom, resistance: r.resistance,
                  mode: r.mode, valeur: Math.round(v * 10000) / 10000 });
  });

  return {
    armurePct: Math.round((1 - restant.armure) * 100000) / 100000,
    rmPct: Math.round((1 - restant.rm) * 100000) / 100000,
    armurePlate: plat.armure, rmPlate: plat.rm,
    detail, refus
  };
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

/* `valeurTerme` est exporté pour le modèle de survie : les défenses conditionnelles
   (Harnais protoplasmique) évaluent un calcul d'OBJET, et il existe deux résolveurs de
   termes — celui des sorts, dans 26_modele_degats, et celui-ci. Employer le mauvais
   rendrait des termes propres aux objets non résolus, en silence. */
module.exports = { evaluerPassif, coupsAImpact, statsAccordees, multiplicateursStat,
                   appliquerGain, amplification, reductionResistances,
                   couverture, valeurTerme, MODELES, parId };
