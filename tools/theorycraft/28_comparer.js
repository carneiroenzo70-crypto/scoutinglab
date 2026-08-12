/* Compare deux builds sur un champion, et classe les runes DANS ce build.

   C'est ici que les trois socles se rejoignent : les sorts donnent les ratios, les
   objets donnent les stats, les runes lisent ces mêmes stats. Une rune ne se juge pas
   dans le vide — Électrocution vaut 5 % de la puissance, donc elle ne dit la même
   chose qu'une fois le build posé.

   Usage :
     node 28_comparer.js Jinx 18 "3031,3006,3094" "3153,3006,3085" [cible] [nivCible]  */

const M = require('./26_modele_degats');
const { evaluerRune, parId: runeParId } = require('./14_moteur_runes');
const I = require('./30_moteur_items');

const [champ, nivArg, buildA, buildB, cibleArg, nivCibleArg] = process.argv.slice(2);
if (!champ) {
  console.log('Usage : node 28_comparer.js <Champion> <niveau> "<ids A>" "<ids B>" [cible] [niv cible]');
  process.exit(1);
}
const niveau = Number(nivArg) || 18;
/* Fenêtre de combat. 10 s : assez long pour qu'une recharge courte se rejoue et que
   l'accélération pèse, assez court pour rester un échange et non une partie. */
const FENETRE = 10;
const lire = s => (s || '').split(',').map(x => Number(x.trim())).filter(Boolean);

const cible = M.cibleChampion(cibleArg || 'Rumble', Number(nivCibleArg) || niveau, []);
if (!M.champions[champ]) {
  console.log('Champion absent du socle : ' + champ);
  console.log('Disponibles : ' + Object.keys(M.champions).slice(0, 12).join(', ') + '…');
  process.exit(1);
}

/* Dégâts d'un combo complet : une utilisation de chaque compétence infligeant des
   dégâts, au rang maximum. On additionne les DÉGÂTS SUBIS, pas le brut — comparer du
   brut ferait disparaître tout l'intérêt de la pénétration. */
function combo(p) {
  const c = M.champions[champ];
  let subis = 0, brut = 0;
  const lignes = [], refus = [];
  ['Q', 'W', 'E', 'R'].forEach(touche => {
    const s = c.sorts[touche];
    if (!s) return;
    // le calcul de dégâts le plus gros de la compétence : c'est le coup principal
    let meilleur = null;
    Object.keys(s.calculs).forEach(nom => {
      if (s.calculs[nom].genre !== 'degats') return;
      const r = M.evaluerCalcul(champ, touche, nom, s.nbRangs, p, cible);
      if (!r.ok) { refus.push(touche + '/' + nom + ' : ' + r.raison); return; }
      if (r.subis == null) { refus.push(touche + '/' + nom + ' : ' + (r.note || 'non mitigeable')); return; }
      if (!meilleur || r.subis > meilleur.r.subis) meilleur = { nom, r };
    });
    if (meilleur) {
      subis += meilleur.r.subis; brut += meilleur.r.brut;
      lignes.push({ touche, nom: meilleur.nom, type: meilleur.r.type,
                    brut: meilleur.r.brut, subis: meilleur.r.subis });
    }
  });
  return { subis, brut, lignes, refus };
}

function contexteRune(p) {
  return { niveau: p.niveau, adBase: p.adBase, adBonus: p.adBonus, ap: p.ap,
           pvMax: p.pvMax, pvBonus: p.pvBonus,
           vitesseAttaqueBonus: p.vitesseAttaque - M.champions[champ].base.va,
           distance: p.distance, soinsEtBoucliers: 0 };
}

/* Classement des pierres de fondation dans CE build. On ne compare que ce qui est
   comparable : une rune de dégâts contre une rune de dégâts. Mettre Gardien et
   Électrocution sur la même échelle n'aurait aucun sens. */
function runesClassees(p) {
  const ctx = contexteRune(p);
  const res = [];
  Object.values(runeParId).forEach(r => {
    if (!r.active || r.genre !== 'majeure') return;
    const e = evaluerRune(r.id, ctx);
    if (!e.ok || e.valeur == null) return;
    res.push({ nom: e.nom, arbre: e.arbre, effet: e.effet, valeur: e.valeur,
               type: e.typeDegats, source: e.source });
  });
  return res;
}

function afficher(nom, ids) {
  const p = M.profil(champ, niveau, ids);
  const c = combo(p);
  console.log('\n╔══ ' + nom + '  —  ' + p.or + ' po');
  console.log('║  ' + ids.map(i => (M.itemParId[i] || {}).nom || ('? ' + i)).join(' · '));
  if (p.refuses.length) console.log('║  ⚠ écartés : ' + p.refuses.join(', '));
  console.log('║  ' + Math.round(p.adTotal) + ' AD · ' + Math.round(p.ap) + ' AP · ' +
    Math.round(p.pvMax) + ' PV · ' + Math.round(p.armure) + ' armure · ' +
    Math.round(p.rm) + ' RM · ' + p.accel + ' accél.' +
    (p.letalite ? ' · ' + p.letalite + ' létalité' : '') +
    (p.penArmurePct ? ' · ' + Math.round(p.penArmurePct * 100) + ' % pén. armure' : '') +
    (p.penMagiquePct ? ' · ' + Math.round(p.penMagiquePct * 100) + ' % pén. magique' : ''));
  console.log('║');
  c.lignes.forEach(l => console.log('║  ' + l.touche + '  ' + l.nom.padEnd(22) +
    String(Math.round(l.brut)).padStart(6) + ' brut  →  ' +
    String(Math.round(l.subis)).padStart(6) + ' subis   (' + l.type + ')'));
  console.log('║  ' + ' '.repeat(25) + String(Math.round(c.brut)).padStart(6) + ' brut  →  ' +
    String(Math.round(c.subis)).padStart(6) + ' SUBIS sur le combo');
  console.log('║  soit ' + Math.round(c.subis / cible.pvMax * 100) + ' % des PV de ' + cible.nom +
    ' (' + Math.round(cible.pvMax) + ' PV)');
  /* Les attaques de base comptent séparément : sur une ADC elles pèsent plus que le
     combo, et un comparateur qui les oublie désigne le mauvais gagnant. */
  const aa = M.degatsAttaque(p, cible);
  const oh = I.coupsAImpact(p, cible, { mitiger: M.mitiger });
  console.log('║');
  console.log('║  attaque de base  ' + String(Math.round(aa.parCoupBrut)).padStart(6) +
    ' brut  →  ' + String(Math.round(aa.parCoup)).padStart(6) + ' subis   ' +
    '(' + Math.round(p.crit * 100) + ' % crit, x' + aa.multiplicateurCritique + ')');
  oh.lignes.forEach(l => console.log('║    + ' + l.objet.padEnd(24) +
    String(Math.round(l.brut)).padStart(6) + ' brut  →  ' +
    String(Math.round(l.subis)).padStart(6) + ' subis   (' + l.type + ', ' + l.cadence + ')'));
  const parCoupTotal = aa.parCoup + oh.subis;
  const dps = parCoupTotal * p.vitesseAttaque;
  if (oh.lignes.length)
    console.log('║    = ' + 'coup complet'.padEnd(24) + ' '.repeat(6) +
      '          ' + String(Math.round(parCoupTotal)).padStart(6) + ' subis');
  console.log('║  ' + aa.vitesseAttaque.toFixed(2) + ' attaque/s  →  ' +
    Math.round(dps) + ' dégâts/s soutenus');
  console.log('║  combo + 3 s d\'attaques : ' + Math.round(c.subis + dps * 3) + ' subis');
  if (oh.refus.length) console.log('║  passif refusé : ' + oh.refus.join(' | '));
  aa.dps = dps;                       // le comparateur travaille sur le coup complet

  /* Fenêtre de combat : la seule mesure où l'ACCÉLÉRATION DE COMPÉTENCE existe. Elle
     ne change pas un combo, elle change le nombre de combos — invisible partout
     ailleurs, et c'est pourtant la stat de 65 objets. */
  const parTouche = {};
  c.lignes.forEach(l => { parTouche[l.touche] = l.subis; });
  const fen = M.degatsSurFenetre(champ, p, cible, FENETRE,
                                 t => parTouche[t] != null ? parTouche[t] : null,
                                 parCoupTotal);
  console.log('║');
  console.log('║  sur ' + FENETRE + ' s de combat  (' + p.accel + ' accél. → ' +
    fen.reduction + ' % de réduction) : ' + fen.total + ' subis');
  console.log('║    ' + fen.lignes.map(l => l.touche + '×' + l.lancers +
    (l.recharge ? ' (' + l.recharge + ' s)' : '')).join('  '));
  if (c.refus.length) {
    console.log('║  non chiffré : ' + c.refus.length + ' calcul(s)');
    c.refus.slice(0, 4).forEach(r => console.log('║    · ' + r));
  }
  return { p, c, aa, fen };
}

console.log('═'.repeat(74));
console.log(M.champions[champ].nom + ' niveau ' + niveau + '   contre   ' +
  cible.nom + ' niveau ' + cible.niveau + '  (' + Math.round(cible.armure) +
  ' armure / ' + Math.round(cible.rm) + ' RM)');
console.log('═'.repeat(74));

const A = afficher('Build A', lire(buildA));
const B = buildB ? afficher('Build B', lire(buildB)) : null;

if (B) {
  /* Deux mesures, parce qu'elles ne classent pas toujours pareil : le combo seul
     favorise les objets à dégâts plats, la fenêtre de 3 secondes révèle la vitesse
     d'attaque et la pénétration. Donner une seule des deux serait tendancieux. */
  const mesures = [
    ['combo seul', A.c.subis, B.c.subis],
    ['combo + 3 s d\'attaques', A.c.subis + A.aa.dps * 3, B.c.subis + B.aa.dps * 3],
    ['dégâts/s soutenus', A.aa.dps, B.aa.dps],
    // seule mesure où l'accélération de compétence existe
    [FENETRE + ' s de combat', A.fen.total, B.fen.total]
  ];
  console.log('\n── Verdict');
  console.log('   ' + ' '.repeat(24) + 'Build A'.padStart(10) + 'Build B'.padStart(10) +
              '     écart      par 100 po');
  mesures.forEach(([nom, a, b]) => {
    const gagnant = b > a ? 'B' : 'A';
    console.log('   ' + nom.padEnd(24) + String(Math.round(a)).padStart(10) +
      String(Math.round(b)).padStart(10) +
      ('  ' + gagnant + ' +' + Math.abs(Math.round((b - a) / a * 1000) / 10) + ' %').padEnd(14) +
      (Math.round(a / A.p.or * 1000) / 10) + ' / ' + (Math.round(b / B.p.or * 1000) / 10));
  });
  console.log('\n   Or : ' + A.p.or + ' po contre ' + B.p.or + ' po');
  console.log('\n   ⚠ Ces chiffres ne disent ni la survie, ni la portée, ni la capacité à');
  console.log('     répéter le combo. Ils tranchent un point précis, pas un match-up.');
  /* Limite à énoncer, pas à cacher : les passifs d'objet ne sont pas encore appliqués
     aux dégâts. Les VALEURS sont extraites et vérifiées (la Lame du roi déchu porte
     bien ses 9 % des PV max), mais leur déclenchement n'est pas modélisé — il reste à
     faire pour les objets ce que `runes_modeles.js` fait pour les runes. Un build à
     coup-à-l'impact est donc SOUS-ESTIMÉ ici. */
  const tous = [...new Set([...A.p.objets, ...B.p.objets])];
  const sansModele = tous.filter(i =>
    Object.keys((M.itemParId[i] || { calculs: {} }).calculs).length && !I.MODELES[i])
    .map(i => M.itemParId[i].nom);
  const ecartes = tous.filter(i => I.MODELES[i] && I.MODELES[i].nonApplique)
    .map(i => M.itemParId[i].nom + ' (' + I.MODELES[i].nonApplique + ')');
  if (sansModele.length) {
    console.log('\n   ⚠ Passifs NON appliqués, faute de modèle : ' + sansModele.join(', ') + '.');
    console.log('     Leurs valeurs sont extraites, leur déclenchement ne l\'est pas —');
    console.log('     ces builds sont donc sous-estimés, jamais surestimés.');
  }
  if (ecartes.length) console.log('\n   Écartés à dessein : ' + ecartes.join(' ; ') + '.');
  /* Modélisés MAIS hors du calcul : seuls les passifs « à chaque attaque » entrent dans
     les dégâts par seconde. Un passif énergisé se déclenche à intervalle, un passif de
     compétence dépend du sort lancé — les additionner à chaque coup les surestimerait.
     Les ranger avec les passifs appliqués serait trompeur. */
  const horsCalcul = tous.filter(i => {
    const m = I.MODELES[i];
    return m && !m.nonApplique && m.declencheur &&
           !['coupAImpact', 'toutesNAttaques'].includes(m.declencheur.type);
  }).map(i => M.itemParId[i].nom + ' (' + I.MODELES[i].declencheur.type + ')');
  if (horsCalcul.length) {
    console.log('\n   Modélisés mais HORS du calcul par attaque (déclenchement à ' +
                'intervalle ou lié à un sort) :');
    console.log('     ' + horsCalcul.join(', ') + '.');
  }
  /* Ce que le modèle laisse de côté sur les passifs bel et bien appliqués : chaque
     entrée porte sa propre limite, et la taire donnerait une fausse complétude. */
  const limites = tous.filter(i => {
    const m = I.MODELES[i];
    return m && m.note && m.declencheur && m.declencheur.type === 'coupAImpact';
  }).map(i => M.itemParId[i].nom + ' — ' + I.MODELES[i].note);
  if (limites.length) {
    console.log('\n   Limites des passifs réellement appliqués :');
    limites.forEach(l => console.log('     · ' + l));
  }
}

console.log('\n── Pierres de fondation, évaluées AVEC le build A');
const cls = runesClassees(A.p);
const parEffet = {};
cls.forEach(r => { (parEffet[r.effet] = parEffet[r.effet] || []).push(r); });
Object.keys(parEffet).sort().forEach(eff => {
  console.log('\n   ' + eff);
  parEffet[eff].sort((a, b) => b.valeur - a.valeur).forEach(r =>
    console.log('     ' + r.nom.padEnd(24) + String(Math.round(r.valeur * 10) / 10).padStart(8) +
      '   ' + (r.type || '') + (r.source !== 'fichier de jeu' ? '   [' + r.source + ']' : '')));
});
console.log('\n   Ces valeurs sont un montant par déclenchement, pas un gain de partie :');
console.log('   une rune à 200 avec 20 s de recharge ne vaut pas une rune à 100 sans recharge.');
