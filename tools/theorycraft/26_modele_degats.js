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
    va: vitesseAttaque(b, niveau),
    portee: b.portee, ms: b.ms,
    distance: b.portee > 300      // sert aux runes et objets à version « à distance »
  };
}

/* ── 2. Cumul des objets ────────────────────────────────────────────────────────── */
const ADDITIVES = ['ad', 'ap', 'pv', 'mana', 'armure', 'rm', 'accel', 'letalite',
                   'penMagiquePlat', 'penArmurePlate', 'vdPlate', 'portee',
                   'crit', 'degatsCrit', 'vitesseAttaque', 'vd', 'volVie', 'omnivamp',
                   'soinsEtBoucliers', 'regenPV', 'regenMana', 'tenacite', 'resistRalent'];

/* Les pénétrations en POURCENTAGE ne s'additionnent pas : elles se multiplient
   (deux fois 20 % laissent 0,8 × 0,8 = 64 % de la résistance, pas 60 %). Additionner
   surestimerait les builds à deux objets de pénétration — précisément ceux qu'on veut
   comparer. */
const MULTIPLICATIVES = ['penArmure', 'penMagique'];

function statsObjets(ids) {
  const total = {}; const restant = { penArmure: 1, penMagique: 1 };
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
    armure: nu.armure + g('armure'),
    rm: nu.rm + g('rm'),
    accel: g('accel'),
    letalite: g('letalite'),
    penArmurePct: g('penArmure'),
    penMagiquePlate: g('penMagiquePlat'),
    penMagiquePct: g('penMagique'),
    crit: Math.min(1, g('crit')),
    degatsCrit: g('degatsCrit'),
    vitesseAttaque: vitesseAttaque((champions[id] || {}).base, niveau, g('vitesseAttaque')),
    distance: nu.distance,
    or: (objets || []).reduce((s, i) => s + (itemParId[i] ? itemParId[i].prix : 0), 0)
  };
  p.adTotal = p.adBase + p.adBonus;
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
   les dégâts bruts ignorent toute résistance, c'est le seul cas sans mitigation. */
function mitiger(brut, type, cible, attaquant) {
  if (type === 'brut') return { subis: brut, resistEff: 0, multiplicateur: 1 };
  const physique = type === 'physique';
  const eff = resistEffective(physique ? cible.armure : cible.rm, {
    reducPlate: physique ? (cible.reducArmurePlate || 0) : (cible.reducRmPlate || 0),
    reducPct:   physique ? (cible.reducArmurePct || 0)   : (cible.reducRmPct || 0),
    penPct:     physique ? (attaquant.penArmurePct || 0) : (attaquant.penMagiquePct || 0),
    penPlate:   physique ? (attaquant.letalite || 0)     : (attaquant.penMagiquePlate || 0)
  });
  const m = multiplicateur(eff);
  return { subis: brut * m, resistEff: eff, multiplicateur: m };
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
  const m = cible ? mitiger(brut, type, cible, p) : null;
  return {
    ok: true, genre: 'degats', type,
    brut: Math.round(brut * 100) / 100,
    subis: m ? Math.round(m.subis * 100) / 100 : null,
    resistEff: m ? Math.round(m.resistEff * 100) / 100 : null,
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
  const m = cible ? mitiger(parCoupBrut, 'physique', cible, p) : null;
  const parCoup = m ? m.subis : parCoupBrut;
  return {
    parCoupBrut: Math.round(parCoupBrut * 100) / 100,
    parCoup: Math.round(parCoup * 100) / 100,
    vitesseAttaque: Math.round(p.vitesseAttaque * 1000) / 1000,
    dps: Math.round(parCoup * p.vitesseAttaque * 100) / 100,
    multiplicateurCritique: mult
  };
}

/* Cible « mannequin » : un champion nu au même niveau. Sert de référence neutre pour
   comparer deux builds sans supposer l'équipement de l'adversaire. */
function cibleChampion(id, niveau, objets) {
  const p = profil(id, niveau, objets || []);
  if (!p) return null;
  return { nom: p.nom, niveau, armure: p.armure, rm: p.rm, pvMax: p.pvMax };
}

module.exports = { croissance, vitesseAttaque, statsChampion, statsObjets, profil,
                   resistEffective, multiplicateur, mitiger, evaluerCalcul,
                   degatsAttaque, cibleChampion, itemParId, champions };
