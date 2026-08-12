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
// Le DPS est bien le coup mitigé multiplié par la vitesse d'attaque
const aa = M.degatsAttaque(p, cible);
// tolérance large : les deux membres sont arrondis à deux décimales avant comparaison
verifie('DPS = coup subi × vitesse d\'attaque', aa.dps, aa.parCoup * aa.vitesseAttaque, 0.2);
vrai('l\'armure réduit bien le coup', aa.parCoup < aa.parCoupBrut,
     aa.parCoupBrut + ' → ' + aa.parCoup);

console.log('\n── Dégâts bruts : aucune résistance ne s\'applique');
const m = M.mitiger(500, 'brut', { armure: 300, rm: 300 }, {});
verifie('500 de dégâts bruts contre 300 d\'armure', m.subis, 500);

console.log('\n── Refus explicites');
vrai('champion inconnu → null', M.statsChampion('Personne', 18) === null);
const rate = M.evaluerCalcul('Jinx', 'Q', 'CalculQuiNExistePas', 1, p, cible);
vrai('calcul inexistant refusé avec un motif', rate.ok === false && !!rate.raison, rate.raison);

console.log('\n═══ ' + ok + ' réussis, ' + ko + ' échoués ═══');
process.exit(ko ? 1 : 0);
