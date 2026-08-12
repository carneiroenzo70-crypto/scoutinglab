/* Moteur d'évaluation des runes.

   Séparation volontaire :
     — les NOMBRES viennent de runes.json (extrait des fichiers du jeu) ;
     — seul le COMPORTEMENT (déclencheur, forme du calcul) est encodé à la main.
   Un patch qui fait passer Électrocution de 70 à 65 se propage donc tout seul ;
   seuls les remaniements de mécanique demandent une reprise.

   Rien n'est deviné : une rune dont le modèle est absent renvoie « non modélisée »,
   jamais une valeur approchée. */

const runes = require('./runes.json');
const MODELES = require('./runes_modeles');

const parId = {};
runes.forEach(r => { parId[r.id] = r; });

/* PIÈGE MAJEUR : Riot n'est pas cohérent sur l'échelle des pourcentages.
   Coup de grâce stocke 0.08 pour « 8% », mais le fragment de vitesse d'attaque
   stocke 10 pour « 10% ». Transcendance stocke même 0.05 pour « +5 accélération ».
   Confondre les deux, c'est une erreur d'un facteur 100 sur la moitié des runes.

   Ces runes-là stockent une fraction : on la ramène à l'unité affichée en jeu.
   Liste tenue à la main, vérifiée description par description. */
const ECHELLE_FRACTION = new Set([
  8014, 8017, 8299,   // Coup de grâce, Abattage, Baroud d'honneur (% de dégâts)
  8369, 8224,         // Premier coup, Arcaniste axiomatique (% d'amplification)
  8230, 8275, 8410,   // Assaut du maraudeur, Manteau nuageux, Vitesse d'approche (% MS)
  8234,               // Célérité (% MS)
  8444, 8352, 8453,   // Second souffle, Philtre, Revitalisation (%)
  8321,               // Remise immédiate (% des PO)
  9104,               // Légende : alacrité (% vitesse d'attaque)
  8210                // Transcendance (accélération, stockée en fraction)
]);

/* Interpolation « X - Y selon le niveau » : linéaire du niveau 1 au niveau 18.
   C'est la convention de toutes les runes qui affichent une fourchette
   (« 70 - 240 », « 40 - 160 pts de dégâts adaptatifs bonus (selon le niveau) »). */
function parNiveau(min, max, niveau) {
  const n = Math.max(1, Math.min(18, niveau || 1));
  return min + (max - min) * (n - 1) / 17;
}

/* Contexte de calcul attendu :
     niveau, adBase, adBonus, ap, pvMax, pvBonus, vitesseAttaqueBonus,
     distance (true = champion à distance), cumuls, ames, soinsEtBoucliers */
function statDe(ctx, stat, mode) {
  const g = (k, d = 0) => (ctx[k] != null ? ctx[k] : d);
  switch (stat) {
    case 'AD':  return mode === 'bonus' ? g('adBonus') : g('adBase') + g('adBonus');
    case 'AP':  return g('ap');
    case 'PV':  return mode === 'bonus' ? g('pvBonus') : g('pvMax');
    case 'VA':  return g('vitesseAttaqueBonus');
    case 'SB':  return g('soinsEtBoucliers');
    default:    return 0;
  }
}

function valeurDe(m, r, ctx) {
  const v = r.valeurs;
  let total = 0;
  const detail = [];

  if (m.montant && m.montant.niveau) {
    const [kMin, kMax] = m.montant.niveau;
    if (v[kMin] == null || v[kMax] == null) return null;
    const x = parNiveau(v[kMin], v[kMax], ctx.niveau);
    total += x;
    detail.push({ source: 'base (niv. ' + ctx.niveau + ')', valeur: x });
  }
  if (m.montant && m.montant.fixe) {
    const x = v[m.montant.fixe];
    if (x == null) return null;
    total += x;
    detail.push({ source: m.montant.fixe, valeur: x });
  }
  // Part proportionnelle à une stat du porteur (PV max, PV bonus…)
  if (m.montant && m.montant.pourcentStat) {
    const [cle, stat, mode] = m.montant.pourcentStat;
    if (v[cle] == null) return null;
    const x = v[cle] * statDe(ctx, stat, mode);
    total += x;
    detail.push({ source: (v[cle] * 100).toFixed(1) + '% ' + stat + (mode ? ' ' + mode : ''), valeur: x });
  }
  /* Ratios. Le 4e terme est un diviseur : certaines runes s'expriment « +6% tous les
     100 points de puissance » — le coefficient porte alors sur (stat / 100), pas sur
     la stat brute. Confondre les deux gonflerait la valeur d'un facteur 100. */
  (m.montant && m.montant.ratios || []).forEach(([cle, stat, mode, div]) => {
    if (v[cle] == null) return;
    const x = v[cle] * statDe(ctx, stat, mode) / (div || 1);
    total += x;
    detail.push({
      source: (v[cle] * 100).toFixed(1) + '% ' + stat + (mode === 'bonus' ? ' bonus' : '')
              + (div ? ' /' + div : ''),
      valeur: x
    });
  });
  // Cumuls (Conquérant, Moisson noire…)
  if (m.montant && m.montant.parCumul) {
    const [kMin, kMax, kMaxCumuls] = m.montant.parCumul;
    const parC = parNiveau(v[kMin], v[kMax], ctx.niveau);
    const n = Math.min(ctx.cumuls != null ? ctx.cumuls : (v[kMaxCumuls] || 1), v[kMaxCumuls] || 99);
    const x = parC * n;
    total += x;
    detail.push({ source: n + ' cumuls x ' + (Math.round(parC * 100) / 100), valeur: x });
  }
  if (m.montant && m.montant.parAme) {
    const x = (v[m.montant.parAme] || 0) * (ctx.ames || 0);
    total += x;
    if (x) detail.push({ source: (ctx.ames || 0) + ' âmes', valeur: x });
  }

  /* Multiplicateur proportionnel à une stat : Tempo mortel augmente ses dégâts
     « de 1% tous les 1% de vitesse d'attaque bonus ». */
  if (m.montant && m.montant.multiplieParStat) {
    const [stat, mode] = m.montant.multiplieParStat;
    const f = 1 + statDe(ctx, stat, mode);
    total *= f;
    detail.push({ source: 'x' + (Math.round(f * 100) / 100) + ' (' + stat + ')', valeur: null });
  }

  // Pénalité « champion à distance »
  if (ctx.distance && m.distance) {
    if (m.distance.facteurCle && v[m.distance.facteurCle] != null) {
      total *= v[m.distance.facteurCle];
      detail.push({ source: 'à distance x' + v[m.distance.facteurCle], valeur: null });
    } else if (m.distance.remplace) {
      // fourchette entièrement différente à distance (Tempo mortel)
      const [kMin, kMax] = m.distance.remplace;
      total = parNiveau(v[kMin], v[kMax], ctx.niveau);
      detail.length = 0;
      detail.push({ source: 'version à distance', valeur: total });
    } else if (m.distance.remplaceFixe && v[m.distance.remplaceFixe] != null) {
      // valeur fixe différente à distance (Démolition : 85 en mêlée, 50 à distance)
      const base = v[m.distance.remplaceFixe];
      const part = m.montant && m.montant.pourcentStat
        ? (v[m.distance.pourcentStatCle || m.montant.pourcentStat[0]] || 0)
          * statDe(ctx, m.montant.pourcentStat[1], m.montant.pourcentStat[2])
        : 0;
      total = base + part;
      detail.length = 0;
      detail.push({ source: 'version à distance', valeur: total });
    }
  }
  return { total, detail };
}

function evaluerRune(id, ctx = {}) {
  const r0 = parId[id];
  if (!r0) return { ok: false, raison: 'rune inconnue' };
  if (!r0.active) return { ok: false, raison: 'rune retirée du jeu' };
  const m = MODELES[id];
  if (!m) return { ok: false, raison: 'non modélisée', nom: r0.nom };
  if (m.nonModelise) return { ok: false, raison: m.nonModelise, nom: r0.nom };

  /* Quelques valeurs manquent au fichier de jeu (Fontaine de vie n'y porte aucun
     montant de soin) ou n'y sont accessibles que sous une clé hachée. Le modèle peut
     alors fournir des valeurs relevées sur une source externe — toujours nommées et
     datées, et signalées dans le résultat : on ne mélange jamais silencieusement une
     mesure et une saisie. */
  let r = r0;
  if (m.valeursExternes) {
    r = Object.assign({}, r0, { valeurs: Object.assign({}, r0.valeurs, m.valeursExternes.valeurs) });
  }

  ctx = Object.assign({ niveau: 1, adBase: 0, adBonus: 0, ap: 0, pvMax: 0, pvBonus: 0 }, ctx);

  /* Certaines runes ont deux emplois exclusifs (Aery blesse OU protège) : on évalue
     celui demandé, la première variante par défaut. */
  let modele = m, nomVariante = null;
  if (m.variantes) {
    const cles = Object.keys(m.variantes);
    const choisie = (ctx.variante && m.variantes[ctx.variante]) ? ctx.variante : cles[0];
    nomVariante = choisie;
    modele = Object.assign({}, m, m.variantes[choisie]);
  }

  /* Pas de `montant` = rien à chiffrer. Sans ce garde-fou, une rune comme Fontaine de
     vie — dont le fichier de jeu ne porte AUCUNE valeur de soin — ressortait à 0,
     ce qui se lit comme « soigne zéro » au lieu de « on ne sait pas ». */
  const res = !modele.montant ? { total: null, detail: [] } : valeurDe(modele, r, ctx);
  if (res === null) return { ok: false, raison: 'clé absente du fichier de jeu', nom: r.nom };
  if (res.total != null && ECHELLE_FRACTION.has(id)) {
    res.total *= 100;
    res.detail.push({ source: 'fraction ramenée à l\'unité affichée (x100)', valeur: null });
  }

  return {
    ok: true, id, nom: r.nom, arbre: r.arbre, genre: r.genre,
    effet: modele.effet, typeDegats: modele.typeDegats || null,
    variante: nomVariante,
    variantesDispo: m.variantes ? Object.keys(m.variantes) : null,
    declencheur: modele.declencheur || m.declencheur,
    cooldown: m.cooldown ? r.valeurs[m.cooldown] : null,
    valeur: res.total == null ? null : Math.round(res.total * 100) / 100,
    unite: modele.unite || null,
    detail: res.detail,
    source: m.valeursExternes ? m.valeursExternes.source : 'fichier de jeu',
    notes: modele.notes || m.notes || null
  };
}

module.exports = { evaluerRune, parNiveau, MODELES, parId };
