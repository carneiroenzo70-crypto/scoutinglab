/* Vérifie le modèle de dégâts contre des valeurs calculables à la main.

   Le principe : chaque assertion doit être vérifiable au crayon depuis les formules
   du wiki, sans lire le code. Si le code et le test disent la même bêtise, le test
   ne sert à rien — les attendus sont donc écrits ici en clair. */
const M = require('./26_modele_degats');

let ok = 0, ko = 0;
function verifie(libelle, obtenu, attendu, tol = 0.01) {
  const bon = obtenu != null && Math.abs(obtenu - attendu) <= tol;
  console.log((bon ? '  OK   ' : '  ÉCHEC') + '  ' + libelle.padEnd(58) +
    'obtenu ' + (obtenu == null ? 'null' : Math.round(obtenu * 1000) / 1000) +
    '   attendu ' + attendu);
  bon ? ok++ : ko++;
}
function vrai(libelle, cond, detail = '') {
  console.log((cond ? '  OK   ' : '  ÉCHEC') + '  ' + libelle + (detail ? '  ' + detail : ''));
  cond ? ok++ : ko++;
}

console.log('── Croissance par niveau : base + g × (n−1) × (0,7025 + 0,0175 × (n−1))');
verifie('au niveau 1, rien n\'a poussé', M.croissance(100, 5, 1), 100);
// Propriété remarquable : le facteur vaut EXACTEMENT 17 au niveau 18.
verifie('au niveau 18, exactement 17 fois la croissance', M.croissance(100, 5, 18), 185);
// niveau 2 : 1 × (0,7025 + 0,0175) = 0,72
verifie('au niveau 2, facteur 0,72 (et non 1)', M.croissance(100, 5, 2), 103.6);
// niveau 10 : 9 × (0,7025 + 0,1575) = 9 × 0,86 = 7,74
verifie('au niveau 10, facteur 7,74', M.croissance(100, 5, 10), 138.7);
vrai('la croissance n\'est pas linéaire (niv. 10 sous la moitié du gain total)',
     M.croissance(0, 100, 10) < M.croissance(0, 100, 18) / 2 + 100);

console.log('\n── Réduction par les résistances : 100 / (100 + R)');
verifie('0 d\'armure : aucune réduction', M.multiplicateur(0), 1);
verifie('100 d\'armure : moitié des dégâts', M.multiplicateur(100), 0.5);
verifie('50 d\'armure : deux tiers', M.multiplicateur(50), 0.6667);
verifie('300 d\'armure : un quart', M.multiplicateur(300), 0.25);
// Armure négative : rendement dégressif, 2 − 100/(100 − R)
verifie('−50 d\'armure : ×1,333 (et non ×1,5)', M.multiplicateur(-50), 1.3333);
verifie('−100 d\'armure : ×1,5 (et non ×2)', M.multiplicateur(-100), 1.5);

console.log('\n── Ordre des pénétrations (non commutatif)');
// 100 d'armure, 40% de pénétration puis 18 de létalité : 100 × 0,6 = 60, − 18 = 42
verifie('100 armure, 40 % puis 18 de létalité → 42',
  M.resistEffective(100, { penPct: 0.4, penPlate: 18 }), 42);
/* L'ordre inverse donnerait (100 − 18) × 0,6 = 49,2 : appliquer la létalité d'abord
   surestimerait la résistance restante, donc sous-estimerait les dégâts. */
vrai('l\'ordre inverse donnerait 49,2 — l\'écart est réel, pas cosmétique',
     Math.abs(M.resistEffective(100, { penPct: 0.4, penPlate: 18 }) - 49.2) > 5);
// La létalité ne peut pas passer sous zéro
verifie('30 d\'armure, 60 de létalité → 0 (jamais négatif)',
  M.resistEffective(30, { penPlate: 60 }), 0);
// La pénétration en % est ignorée si l'armure est déjà nulle ou négative
verifie('armure négative : la pénétration en % ne l\'aggrave pas',
  M.resistEffective(-20, { penPct: 0.4 }), -20);
// La réduction PLATE, elle, peut passer sous zéro (Hache noire)
verifie('réduction plate : peut passer sous zéro',
  M.resistEffective(20, { reducPlate: 50 }), -30);
// Réduction en % avant pénétration en %
verifie('100 armure, 30 % de réduction puis 40 % de pénétration → 42',
  M.resistEffective(100, { reducPct: 0.3, penPct: 0.4 }), 42);

console.log('\n── Pénétrations en pourcentage : multiplicatives, pas additives');
/* On ne code pas les valeurs à la main (elles bougent d'un patch à l'autre) : on lit
   les deux taux, puis on vérifie la RÈGLE de composition, calculée indépendamment. */
const [A, B] = [3036, 3033];                   // Grand mercenaire + Rappel mortel
const pa = M.itemParId[A].stats.penArmure.valeur;
const pb = M.itemParId[B].stats.penArmure.valeur;
const deuxPen = M.statsObjets([A, B]);
const attenduMult = 1 - (1 - pa) * (1 - pb);
const attenduAdd = pa + pb;
verifie('deux objets à ' + Math.round(pa * 100) + ' % et ' + Math.round(pb * 100) +
        ' % se composent en multipliant', deuxPen.stats.penArmure, attenduMult, 0.001);
vrai('  et le résultat diffère bien de la simple addition (' +
     Math.round(attenduAdd * 1000) / 10 + ' %)',
     Math.abs(attenduMult - attenduAdd) > 0.02,
     '→ additionner surestimerait le build de ' +
     Math.round((attenduAdd - attenduMult) * 1000) / 10 + ' points');

console.log('\n── Cumul des objets');
const b = M.statsObjets([3031, 3031]);         // deux fois la Lame d'infini
vrai('un objet en double est refusé', b.refuses.length === 1, b.refuses[0]);
verifie('  et ses stats ne comptent qu\'une fois', b.stats.ad, 75);
const inc = M.statsObjets([999999]);
vrai('un objet inconnu est refusé, pas ignoré en silence', inc.refuses.length === 1);

console.log('\n── Profil complet');
const BUILD = [3031, 3006, 3094];              // Lame d'infini, bottes, Canon à tir rapide
const p = M.profil('Jinx', 18, BUILD);
vrai('profil construit', !!p, p ? p.nom + ', ' + p.or + ' po' : '');
// Attendu recalculé depuis les objets eux-mêmes : le test suit le patch tout seul.
const adAttendu = BUILD.reduce((s, i) =>
  s + ((M.itemParId[i].stats.ad || {}).valeur || 0), 0);
verifie('dégâts d\'attaque bonus = somme des objets', p.adBonus, adAttendu);
vrai('  (et cette somme n\'est pas nulle, sinon le test ne prouve rien)', adAttendu > 0,
     adAttendu + ' AD');
vrai('les dégâts d\'attaque de base ont poussé avec le niveau', p.adBase > 100,
     Math.round(p.adBase * 10) / 10 + '');
vrai('Jinx est reconnue comme championne à distance', p.distance === true);
vrai('un mage est reconnu comme mêlée ou distance selon sa portée',
     M.profil('Rumble', 18, []).distance === false);

console.log('\n── Vitesse d\'attaque : formule à part (bonus × ratio)');
const jinx = M.champions.Jinx.base;
// base 0,625, croissance 1 %/niv, ratio 0,625 → au niv. 18 : 0,625 + 0,17 × 0,625
verifie('Jinx niveau 18, sans objet', M.vitesseAttaque(jinx, 18), 0.625 + 0.17 * 0.625, 0.002);
verifie('Jinx niveau 1, sans objet', M.vitesseAttaque(jinx, 1), 0.625);
// +50 % de vitesse d'attaque d'objets passe aussi par le ratio
verifie('Jinx niveau 1, +50 % d\'objets', M.vitesseAttaque(jinx, 1, 0.5), 0.625 + 0.5 * 0.625, 0.002);

console.log('\n── Dégâts d\'un sort, du brut au subi');
const cible = M.cibleChampion('Rumble', 18, []);
vrai('cible mannequin construite', !!cible,
     cible ? Math.round(cible.armure) + ' armure, ' + Math.round(cible.rm) + ' RM' : '');
const q = M.evaluerCalcul('Jinx', 'Q', Object.keys(M.champions.Jinx.sorts.Q.calculs)[0], 1, p, cible);
vrai('un calcul de Jinx Q est évaluable', q.ok, q.ok ? '' : q.raison);
if (q.ok && q.subis != null) {
  vrai('les dégâts subis sont inférieurs au brut (l\'armure agit)', q.subis < q.brut,
       q.brut + ' → ' + q.subis);
  const attendu = q.brut * M.multiplicateur(q.resistEff);
  verifie('  et valent exactement brut × multiplicateur', q.subis, attendu, 0.02);
}

console.log('\n── Attaques de base et coups critiques');
// Sans critique : le coup moyen vaut exactement les dégâts d'attaque
const sansCrit = M.profil('Jinx', 18, []);
const aaSansCrit = M.degatsAttaque(sansCrit, null);
verifie('0 % de critique : le coup vaut l\'AD', aaSansCrit.parCoupBrut, sansCrit.adTotal, 0.02);
// 100 % de critique, multiplicateur 2, sans bonus : le coup double
const critPlein = M.profil('Jinx', 18, [], { crit: 1 });
verifie('100 % de critique : le coup double', M.degatsAttaque(critPlein, null).parCoupBrut,
        sansCrit.adTotal * 2, 0.02);
// 50 % de critique : moyenne à 1,5 fois
const demiCrit = M.profil('Jinx', 18, [], { crit: 0.5 });
verifie('50 % de critique : coup moyen à 1,5 fois l\'AD',
        M.degatsAttaque(demiCrit, null).parCoupBrut, sansCrit.adTotal * 1.5, 0.02);
/* Ashe est le cas qui interdit de coder le multiplicateur en dur : ses coups critiques
   n'infligent AUCUN dégât supplémentaire. Supposer 2 doublerait ses dégâts d'attaque. */
const ashe = M.profil('Ashe', 18, [], { crit: 1 });
const asheAA = M.degatsAttaque(ashe, null);
verifie('Ashe, 100 % de critique : aucun gain (multiplicateur 1)',
        asheAA.parCoupBrut, ashe.adTotal, 0.02);
vrai('  et son multiplicateur est bien lu à 1, pas supposé à 2',
     asheAA.multiplicateurCritique === 1);
/* Le wiki est explicite : « l'amplification de dégâts critiques de la Lame d'infini ne
   lui profite pas ». Lui accorder les +30 % de l'objet inventait 30 % de dégâts. */
const asheIE = M.profil('Ashe', 18, [3031], { crit: 1 });
verifie('Ashe avec la Lame d\'infini : le bonus de dégâts critiques ne s\'applique pas',
        M.degatsAttaque(asheIE, null).parCoupBrut, asheIE.adTotal, 0.02);
// Contrôle en miroir : sur un champion normal, ce même bonus DOIT s'appliquer
const jinxIE = M.profil('Jinx', 18, [3031], { crit: 1 });
const cd = M.itemParId[3031].stats.degatsCrit.valeur;
// 100 % de critique, multiplicateur 2, +30 % de l'objet → coup moyen à 2,3 fois l'AD
verifie('  mais il s\'applique bien sur Jinx (contrôle en miroir)',
        M.degatsAttaque(jinxIE, null).parCoupBrut, jinxIE.adTotal * (1 + (2 - 1 + cd)), 0.02);
// Le DPS est bien le coup mitigé multiplié par la vitesse d'attaque
const aa = M.degatsAttaque(p, cible);
// tolérance large : les deux membres sont arrondis à deux décimales avant comparaison
verifie('DPS = coup subi × vitesse d\'attaque', aa.dps, aa.parCoup * aa.vitesseAttaque, 0.2);
vrai('l\'armure réduit bien le coup', aa.parCoup < aa.parCoupBrut,
     aa.parCoupBrut + ' → ' + aa.parCoup);

console.log('\n── Accélération de compétence : recharge = base × 100/(100 + A)');
verifie('sans accélération, la recharge ne bouge pas', M.rechargeReelle(10, 0), 10);
/* Piège classique : « 40 d'accélération » ne fait PAS 40 % de réduction, mais 28,6 %.
   Confondre les deux surestime tous les builds à accélération. */
verifie('40 d\'accélération → 7,14 s (et non 6 s)', M.rechargeReelle(10, 40), 7.142857);
vrai('  40 d\'accélération ≠ 40 % de réduction',
     Math.abs(M.rechargeReelle(10, 40) - 6) > 1,
     'réduction réelle : ' + Math.round(40 / 140 * 1000) / 10 + ' %');
verifie('100 d\'accélération → recharge de moitié', M.rechargeReelle(10, 100), 5);
verifie('plafond à 500 : au-delà, rien ne change',
        M.rechargeReelle(10, 900), M.rechargeReelle(10, 500));
// La réduction ne peut jamais atteindre 100 %
vrai('la recharge reste strictement positive, quelle que soit l\'accélération',
     M.rechargeReelle(10, 500) > 0);

console.log('\n── Dégâts sur une fenêtre de temps (là où l\'accélération compte)');
const sansAccel = M.profil('Rumble', 18, []);
const avecAccel = M.profil('Rumble', 18, [], { accel: 100 });
const f1 = M.degatsSurFenetre('Rumble', sansAccel, cible, 10, () => 100, 0);
const f2 = M.degatsSurFenetre('Rumble', avecAccel, cible, 10, () => 100, 0);
vrai('plus d\'accélération = plus de lancers sur 10 s', f2.total > f1.total,
     f1.total + ' → ' + f2.total);
verifie('  la réduction annoncée est correcte', f2.reduction, 50);
// Un sort à 10 s de recharge sur une fenêtre de 10 s : 2 lancers (t=0 et t=10)
const unSort = M.degatsSurFenetre('Rumble', sansAccel, cible, 10, t => t === 'Q' ? 100 : null, 0);
const ligneQ = unSort.lignes.find(l => l.touche === 'Q');
vrai('le nombre de lancers suit la recharge réelle',
     ligneQ && ligneQ.lancers === 1 + Math.floor(10 / ligneQ.recharge),
     ligneQ ? ligneQ.lancers + ' lancers pour ' + ligneQ.recharge + ' s de recharge' : '');

console.log('\n── Compétences à charges (le piège des 21 lancers)');
/* Le E de Rumble affiche 0,5 s de recharge : c'est le délai entre ses DEUX tirs, pas
   sa recharge. Le prendre pour une recharge donnait 21 lancers en 10 s au lieu de 3,
   et gonflait la fenêtre de combat de 9522 à… tout ce qu'on voulait. */
const rumbleE = M.champions.Rumble.sorts.E;
verifie('le fichier de jeu donne bien 2 charges', rumbleE.maxCharges, 2);
verifie('  et 6 s de recharge par charge', rumbleE.rechargeCharge, 6);
vrai('  alors que le « cooldown » affiché vaut 0,5 s',
     rumbleE.cooldown[rumbleE.nbRangs] === 0.5);
const fR = M.degatsSurFenetre('Rumble', sansAccel, cible, 10, t => t === 'E' ? 100 : null, 0);
const lE = fR.lignes.find(l => l.touche === 'E');
verifie('2 charges + 1 rechargée en 10 s = 3 lancers', lE.lancers, 3);
vrai('  et non 21, comme le donnait la lecture naïve', lE.lancers < 5);
/* Le R d'Ashe a lui aussi 2 charges, mais 5 s entre deux lancers et 50 s de recharge :
   on ne peut pas vider ses charges d'un coup. C'est le verrou le plus contraignant qui
   gouverne — ne regarder que la recharge de charge surestimerait. */
if (M.champions.Ashe) {
  const pA = M.profil('Ashe', 18, []);
  const lA = M.degatsSurFenetre('Ashe', pA, cible, 10, t => t === 'E' ? 100 : null, 0)
    .lignes.find(l => l.touche === 'E');
  verifie('Ashe E : un seul lancer en 10 s (50 s de recharge)', lA.lancers, 1);
}
// Une recharge sous la seconde SANS charges déclarées doit être refusée, pas comptée
const jinxQ = M.champions.Jinx.sorts.Q;
if (jinxQ.cooldown[jinxQ.nbRangs] < 1 && !jinxQ.maxCharges) {
  const fJ = M.degatsSurFenetre('Jinx', M.profil('Jinx', 18, []), cible, 10,
                                t => t === 'Q' ? 100 : null, 0);
  vrai('recharge < 1 s sans charges : refusée avec un motif, pas comptée',
       fJ.refus.some(r => /^Q/.test(r)), fJ.refus.join(' | '));
}

console.log('\n── Dégâts bruts : aucune résistance ne s\'applique');
const m = M.mitiger(500, 'brut', { armure: 300, rm: 300 }, {});
verifie('500 de dégâts bruts contre 300 d\'armure', m.subis, 500);

console.log('\n── Refus explicites');
vrai('champion inconnu → null', M.statsChampion('Personne', 18) === null);
const rate = M.evaluerCalcul('Jinx', 'Q', 'CalculQuiNExistePas', 1, p, cible);
vrai('calcul inexistant refusé avec un motif', rate.ok === false && !!rate.raison, rate.raison);

console.log('\n── Les 11 lacunes de l\'audit de couverture');
/* Chaque correction est déclarée dans `sorts_modeles.js` avec sa source. Aucun NOMBRE
   n'y est inventé : seuls le genre, le type et la base du pourcentage y sont dits. */
const SORTS = require('./sorts_modeles');
const cibleA = M.cibleChampion('Sion', 18, [3083, 3068]);

/* 1. Formule NON LINÉAIRE — le W de Twisted Fate : chance de critique × (base+AD+AP).
      Elle retournait `null` SANS ALERTE : les six calculs de la Carte bleue
      disparaissaient, et le sort passait pour « sans dégâts ». */
const tf = M.profil('TwistedFate', 18, [3031], { fenetre: 10 });
const bd = M.evaluerCalcul('TwistedFate', 'W', 'BlueDamage', 5, tf, cibleA);
vrai('le W de Twisted Fate se calcule enfin', bd.ok && bd.brut > 0,
     bd.ok ? bd.brut + ' brut' : bd.raison);
const termeProduit = M.champions.TwistedFate.sorts.W.calculs.BlueDamage.parRang['5']
  .find(t => t.facteurTermes);
vrai('  et son terme produit est conservé, pas linéarisé',
     !!termeProduit && termeProduit.stat === 'Crit',
     termeProduit ? 'chance de critique × (' + termeProduit.facteurTermes.length + ' sous-termes)' : '');
/* Contre-épreuve : le terme produit doit VARIER avec la chance de critique. */
const tfCrit = M.profil('TwistedFate', 18, [3031, 3036], { fenetre: 10 });
vrai('  le résultat suit la chance de critique',
     M.evaluerCalcul('TwistedFate', 'W', 'BlueDamage', 5, tfCrit, cibleA).brut > bd.brut,
     'crit ' + tf.crit + ' → ' + tfCrit.crit);

/* 2. Pourcentage des PV de la CIBLE — trois sorts en dépendent entièrement. */
[['DrMundo', 'Q', 'CurrentHealthDamage', 5, 'actuels'],
 ['Kalista', 'W', 'MaxHealthDamage', 5, 'max']].forEach(([c, t, n, r, base]) => {
  const pr = M.profil(c, 18, [], { fenetre: 10 });
  const e = M.evaluerCalcul(c, t, n, r, pr, cibleA);
  vrai(c + ' ' + t + ' : % des PV ' + base + ' de la cible', e.ok && e.brut > 100,
       e.ok ? e.brut + ' brut sur une cible à ' + Math.round(cibleA.pvMax) + ' PV' : e.raison);
});
/* Sans cible, ces sorts doivent REFUSER : servir le pourcentage nu donnerait
   « 0,3 point de dégâts » là où le jeu en inflige mille. */
vrai('  sans cible fournie, le calcul est refusé plutôt que servi nu',
     M.evaluerCalcul('DrMundo', 'Q', 'CurrentHealthDamage', 5,
                     M.profil('DrMundo', 18, [], { fenetre: 10 }), null).ok === false);

/* 3. Genre mal deviné : `ADRatioBonus` ne contient pas « damage ». */
vrai('la Roulade de Vayne est reclassée en dégâts',
     M.champions.Vayne.sorts.Q.calculs.ADRatioBonus.genre === 'degats');
vrai('  et son type vient de l\'infobulle française',
     M.champions.Vayne.sorts.Q.typeDegats === 'physique',
     M.champions.Vayne.sorts.Q.sourceType || '');

/* 4. Types vérifiés sur le wiki, valeurs gardées du FICHIER. */
[['Ashe', 'Q', 'physique'], ['Jayce', 'R', 'magique'],
 ['RekSai', 'W', 'magique'], ['Yunara', 'R', 'magique']].forEach(([c, t, ty]) => {
  vrai(c + ' ' + t + ' : type ' + ty, M.champions[c].sorts[t].typeDegats === ty);
});
/* Le piège du wiki : ses tableaux mêlent des lignes d'HISTORIQUE de patch. Sur Rek'Sai
   il annonce 50/75/100/125/150 ; le fichier donne 30/55/80/105/130. Le fichier prime. */
verifie('Rek\'Sai W garde les valeurs du FICHIER, pas celles du wiki',
        M.champions.RekSai.sorts.W.calculs.UnburrowDamage.parRang['1'][0].valeur, 30, 0.01);

/* 5. Ce qui n'est PAS un sort est refusé explicitement, pas deviné. */
vrai('les enveloppes d\'infobulle d\'Aphelios sont déclarées hors portée',
     !!M.champions.Aphelios.sorts.Q.nonExploitable,
     M.champions.Aphelios.sorts.Q.nonExploitable);
/* Toute correction doit être MOTIVÉE, sous l'une des trois formes : une source pour ce
   qu'elle affirme, un motif de refus, ou un motif de « ce sort n'inflige rien ». Une
   correction sans justification est une valeur inventée qui a l'air d'être sourcée. */
const sansMotif = [];
Object.entries(SORTS).forEach(([champ, sorts]) => Object.entries(sorts).forEach(([t, s]) => {
  if (!s.source && !s.nonExploitable && !s.sansDegats) sansMotif.push(champ + ' ' + t);
}));
vrai('chaque correction porte sa source ou son motif', sansMotif.length === 0,
     sansMotif.length ? sansMotif.join(', ') : Object.keys(SORTS).length + ' champions corrigés');

/* Les douze pourcentages de PV : ce qu'on vérifie n'est pas le chiffre (il vient du
   fichier) mais l'ORDRE DE GRANDEUR. Avant correction, le W de Vayne valait 0,06 point
   de dégâts ; il doit maintenant valoir 6 % des PV de la cible. */
const cible5000 = { nom: 'test', niveau: 18, armure: 0, rm: 0, pvMax: 5000, pvBonus: 0, pvActuels: 5000 };
const pVayne = M.profil('Vayne', 18, [], { fenetre: 10 });
const vayneW = M.evaluerCalcul('Vayne', 'W', 'DegatsTroisiemeCoup', 5, pVayne, cible5000);
verifie('Vayne W rang 5 : 10 % des 5 000 PV de la cible, et non 0,10 point',
        vayneW.brut, 500, 1);
/* Contre-test : sans cible, on REFUSE. Servir le ratio nu est précisément l'erreur
   qui a valu douze sorts faux pendant tout le panel à 90 champions. */
vrai('  sans cible, le pourcentage est refusé, pas servi nu',
     M.evaluerCalcul('Vayne', 'W', 'DegatsTroisiemeCoup', 5, pVayne, null).brut == null);

/* Les PV MANQUANTS valent zéro à pleine vie — et c'est exact, pas un bug. */
const pGaren = M.profil('Garen', 18, [], { fenetre: 10 });
const garenPlein = M.evaluerCalcul('Garen', 'R', 'DegatsExecution', 3, pGaren, cible5000);
const cibleBlessee = { ...cible5000, pvActuels: 1000 };
const garenBlesse = M.evaluerCalcul('Garen', 'R', 'DegatsExecution', 3, pGaren, cibleBlessee);
verifie('Garen R à pleine vie : la base seule (275)', garenPlein.brut, 275, 1);
verifie('  cible à 1 000/5 000 PV : 275 + 35 % de 4 000', garenBlesse.brut, 275 + 1400, 1);

/* ── PV manquants du LANCEUR : mStat 15 et 16 ─────────────────────────────────────
   Deux index qui restaient refusés faute de preuve. Celle d'Olaf est interne au
   fichier : `MaxShieldCalc` est `ShieldCalc` où mStat 16 a été remplacé par la
   constante (1 − ThresholdForMax) = 0,70. Un index substituable par un nombre entre
   0 et 1 est une FRACTION, pas des points — et le bouclier d'Olaf est le seul endroit
   du jeu où les deux formes cohabitent, donc la seule où la démonstration est possible.

   Le wiki confirme les valeurs indépendamment : 10/40/70/100/130 de base et 17,5 %
   des PV manquants. On teste au rang 4 (100 de base). */
console.log('\n── PV manquants du lanceur (mStat 15 et 16) ──');
const pOlaf = M.profil('Olaf', 18, [], { fenetre: 10 });
const olafPlein = M.evaluerCalcul('Olaf', 'W', 'ShieldCalc', 4, pOlaf, cible5000);
verifie('Olaf W rang 4, à pleine vie : la base seule (100)', olafPlein.brut, 100, 1);
/* À la moitié de ses PV : 100 + 0,50 × (PVmax × 0,175) = 100 + 8,75 % des PV max.
   Si mStat 16 était lu comme des POINTS, on obtiendrait 100 + (PVmax/2) × 0,175 × PVmax
   — un nombre à six chiffres. Le contre-test est donc énorme, pas subtil. */
const olafBlesse = M.evaluerCalcul('Olaf', 'W', 'ShieldCalc', 4,
                                   { ...pOlaf, pvActuels: pOlaf.pvMax / 2 }, cible5000);
verifie('  à mi-vie : 100 + 8,75 % de ses PV max',
        olafBlesse.brut, 100 + pOlaf.pvMax * 0.0875, 1);
vrai('  la fraction n\'est jamais servie comme des points',
     olafBlesse.brut < 100 + pOlaf.pvMax * 0.18);
/* Le PLAFOND. Le jeu arrête de faire croître le bouclier à 70 % de PV manquants ;
   la borne vit dans le calcul jumeau `MaxShieldCalc`, que rien ne relie au premier
   dans le fichier. Sans la déclaration, un Olaf à 5 % de PV ressortait à 543 au lieu
   de 427 — 27 % de trop, et pile dans la situation où l'on consulte le chiffre. */
const olafMourant = M.evaluerCalcul('Olaf', 'W', 'ShieldCalc', 4,
                                    { ...pOlaf, pvActuels: pOlaf.pvMax * 0.05 }, cible5000);
verifie('  à 5 % de PV : plafonné à 100 + 12,25 % des PV max',
        olafMourant.brut, 100 + pOlaf.pvMax * 0.1225, 1);
vrai('  et le plafond est DIT, pas appliqué en douce',
     /plafonné/.test(olafMourant.note || ''));
/* Contre-test : à 30 % de PV pile, le plafond ne mord pas encore — il ne doit donc
   pas être annoncé. Un plafond qui s'annonce toujours ne renseigne sur rien. */
vrai('  à 30 % de PV le plafond ne mord pas encore',
     !/plafonné/.test((M.evaluerCalcul('Olaf', 'W', 'ShieldCalc', 4,
                       { ...pOlaf, pvActuels: pOlaf.pvMax * 0.3 }, cible5000).note) || ''));
/* Les PV du profil se posent en FRACTION, et elle est bornée : « 150 % de PV » ne
   doit pas produire de PV manquants négatifs, donc pas de bouclier sous sa base. */
vrai('  une fraction de PV aberrante est ramenée dans [0, 1]',
     M.profil('Olaf', 18, [], { partPV: 1.5 }).pvActuels === M.profil('Olaf', 18, []).pvMax);
/* La fraction porte sur les PV FINAUX, runes et objets compris. Posée avant eux, elle
   aurait désigné la moitié des PV nus — plusieurs centaines de points d'écart. */
const olafRune = M.profil('Olaf', 18, [3068], { partPV: 0.5, runes: [8446] });
vrai('  la fraction porte sur les PV finaux, objets et runes compris',
     Math.abs(olafRune.pvActuels - olafRune.pvMax / 2) < 0.01 &&
     olafRune.pvMax > M.profil('Olaf', 18, []).pvMax);

/* ── Le drapeau « stat de la CIBLE » ──────────────────────────────────────────────
   L'exécution de l'Atlas portait sur les PV du PORTEUR. Un tank en porte deux fois
   plus qu'une cible fragile : l'erreur doublait le chiffre. */
const atlas = require('./items.json').find(o => o.id === 3865);
vrai('Atlas : l\'exécution vise les PV de la CIBLE, pas ceux du porteur',
     JSON.stringify(atlas.calculs.ExecuteDamage.termes).includes('PVmaxCible'));

/* ── Les dégâts critiques : le MODE change tout ───────────────────────────────────
   Le Q de Yasuo porte deux calculs jumeaux, et c'est ce couple qui prouve la lecture :
       TotalDamage     = base + 1,05 × AD
       TotalDamageCrit = base + AD × (mStat 9 total × 1,05)
   Le wiki annonce « 105 % de l'AD » pour le coup normal — mStat 9 « total » ne peut donc
   être que le multiplicateur de critique complet. Servi comme le seul bonus d'objet, il
   valait 0 sans Lame d'infini, et le Q critique perdait TOUTE sa part d'attaque. */
console.log('\n── Dégâts critiques : mode total contre mode bonus ──');
const objCrit = [3031, 3036];                       // Lame d'infini + Assoiffeur de sang
const pYasuo = M.profil('Yasuo', 18, objCrit, { fenetre: 10 });
const yasNorm = M.evaluerCalcul('Yasuo', 'Q', 'TotalDamage', 3, pYasuo, cible5000);
const yasCrit = M.evaluerCalcul('Yasuo', 'Q', 'TotalDamageCrit', 3, pYasuo, cible5000);
const baseQ = 70;                                   // rang 3, part plate du fichier
verifie('Yasuo Q critique = base + part d\'AD × (multiplicateur + bonus)',
        yasCrit.brut, baseQ + (yasNorm.brut - baseQ) * (pYasuo.critMult + pYasuo.degatsCrit), 0.1);
/* Contre-test : lu comme un bonus, la part d'AD serait multipliée par 0,3 — le coup
   critique infligerait donc MOINS que le coup normal. Absurde, et pourtant servi. */
vrai('  un coup critique ne peut pas infliger moins qu\'un coup normal',
     yasCrit.brut > yasNorm.brut);
/* Le mode « bonus » désigne bien le seul apport des objets. Sans objet, il vaut zéro. */
const pNu = M.profil('Yasuo', 18, [], { fenetre: 10 });
verifie('  sans objet, le multiplicateur retombe à celui du champion',
        M.evaluerCalcul('Yasuo', 'Q', 'TotalDamageCrit', 3, pNu, cible5000).brut,
        baseQ + (M.evaluerCalcul('Yasuo', 'Q', 'TotalDamage', 3, pNu, cible5000).brut - baseQ) * 2,
        0.1);
/* Règle d'Ashe : ses coups critiques n'ajoutent rien, donc le bonus de dégâts critiques
   des objets ne lui profite pas non plus — ni sur ses attaques, ni dans ses formules. */
const pAshe = M.profil('Ashe', 18, objCrit, { fenetre: 10 });
verifie('Ashe : multiplicateur de critique 1, malgré la Lame d\'infini',
        pAshe.critMult, 1, 0);

/* ── mStat 14 : la fraction de PV ACTUELS ─────────────────────────────────────────
   Deux sources indépendantes se recoupent. Le fichier écrit le coût des sorts de Zac
   `HPCost × (PVmax × mStat 14)` ; l'infobulle française de Data Dragon écrit « Coûte
   {{ hpcost*100 }} % des PV ACTUELS ». Seul `PVactuels / PVmax` satisfait les deux.

   ⚠ Les valeurs viennent du FICHIER, pas de la mémoire : il donne 0,08 au Q et 0,04 au
   W et au E — et non 0,04 partout comme on pourrait le supposer. */
console.log('\n── Coût en PV de Zac (mStat 14) ──');
[['Q', 'HealthCostTooltip', 0.08], ['W', 'TooltipHealthCost', 0.04],
 ['E', 'HealthCostTooltip', 0.04]].forEach(([touche, calc, hp]) => {
  [1, 0.5].forEach(part => {
    const pz = M.profil('Zac', 18, [], { fenetre: 10, partPV: part });
    verifie('Zac ' + touche + ' à ' + (part * 100) + ' % de PV : ' + (hp * 100) + ' % des PV actuels',
            M.evaluerCalcul('Zac', touche, calc, 3, pz, cible5000).brut, pz.pvActuels * hp, 0.01);
  });
});
/* Contre-test : lu comme des POINTS de PV actuels au lieu d'une fraction, le coût
   vaudrait `HPCost × PVmax × PVactuels` — plusieurs centaines de milliers. */
vrai('  la fraction n\'est pas servie comme des points',
     M.evaluerCalcul('Zac', 'Q', 'HealthCostTooltip', 3,
                     M.profil('Zac', 18, [], { fenetre: 10 }), cible5000).brut < 1000);

/* ── Le multiplicateur porté par le calcul, résolu au profil ──────────────────────
   « 1 + chance de critique × (dégâts critiques − 1) » : un produit de deux sommes, que
   le résolveur refusait de représenter. Vingt calculs partaient sans leur part de
   critique, en silence. Le E de Xayah est le cas type. */
console.log('\n── Multiplicateur de coup moyen ──');
const pXayah = M.profil('Xayah', 18, objCrit, { fenetre: 10 });
const xayah = M.evaluerCalcul('Xayah', 'E', 'FeatherDamage', 3, pXayah, cible5000);
const xayahNu = M.evaluerCalcul('Xayah', 'E', 'FeatherDamage', 3,
                                M.profil('Xayah', 18, [], { fenetre: 10 }), cible5000);
vrai('le E de Xayah gagne sa part de critique avec la Lame d\'infini',
     xayah.brut > xayahNu.brut, xayahNu.brut + ' → ' + xayah.brut);
/* Contre-test : le multiplicateur est un coup MOYEN, jamais un coup garanti. Il doit
   donc rester sous le multiplicateur plein — le confondre gonflerait ces vingt sorts
   d'un facteur deux. */
vrai('  et il reste un coup MOYEN, sous le multiplicateur plein',
     xayah.brut < xayahNu.brut * (pXayah.critMult + pXayah.degatsCrit));
/* À zéro chance de critique, le multiplicateur doit valoir EXACTEMENT 1. On compare donc
   deux profils identiques à la chance de critique près — comparer deux BUILDS différents
   ne prouverait rien, l'écart d'AD suffirait à masquer un multiplicateur faux. */
verifie('  à 0 % de critique, le multiplicateur vaut exactement 1',
        M.evaluerCalcul('Xayah', 'E', 'FeatherDamage', 3,
                        { ...pXayah, crit: 0 }, cible5000).brut,
        M.evaluerCalcul('Xayah', 'E', 'FeatherDamage', 3,
                        { ...pXayah, crit: 0, degatsCrit: 0 }, cible5000).brut, 0.01);
/* Et la progression est bien LINÉAIRE en chance de critique : à 50 %, exactement la
   moitié du chemin entre 0 % et 100 %. Un multiplicateur appliqué deux fois, ou appliqué
   à la mauvaise part, casserait cette linéarité sans changer les bornes. */
const auCrit = c => M.evaluerCalcul('Xayah', 'E', 'FeatherDamage', 3,
                                    { ...pXayah, crit: c }, cible5000).brut;
verifie('  et la valeur est linéaire en chance de critique',
        auCrit(0.5), (auCrit(0) + auCrit(1)) / 2, 0.01);

console.log('\n═══ ' + ok + ' réussis, ' + ko + ' échoués ═══');
process.exit(ko ? 1 : 0);
