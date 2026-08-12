/* Vérification du pont RUNES → PROFIL.

   Trois pièges y sont vérifiés nommément, parce que chacun est passé inaperçu une fois :
     — l'unité (10 affiché = 0,10 dans le profil) ;
     — les stats DÉRIVÉES, qui se recalculent au lieu de s'incrémenter ;
     — les gains portant sur une stat qu'aucun objet du build ne possède. */

const M = require('./26_modele_degats');
const P = require('./36_runes_profil');
const R = require('./14_moteur_runes');

let ok = 0, ko = 0;
function vrai(nom, cond, info) {
  cond ? ok++ : ko++;
  console.log('  ' + (cond ? 'OK   ' : 'ÉCHEC') + '  ' + nom + (info ? '  ' + info : ''));
}
function verifie(nom, obtenu, attendu, tol = 0.001) {
  const bon = Math.abs(obtenu - attendu) <= tol;
  bon ? ok++ : ko++;
  console.log('  ' + (bon ? 'OK   ' : 'ÉCHEC') + '  ' + nom.padEnd(56) +
              'obtenu ' + (Math.round(obtenu * 10000) / 10000) + '   attendu ' + (Math.round(attendu * 10000) / 10000));
}

console.log('\n── Les runes entrent enfin dans les stats du build');
const nu = M.profil('Caitlyn', 18, [], { fenetre: 10 });
const avec = M.profil('Caitlyn', 18, [], { fenetre: 10, runes: [5007, 5011, 8210], minutes: 20 });
vrai('un profil sans runes reste inchangé', nu.runes == null && nu.accel === 0);
verifie('l\'accélération des runes s\'ajoute', avec.accel,
        R.evaluerRune(5007, { niveau: 18 }).valeur + R.evaluerRune(8210, { niveau: 18 }).valeur);
verifie('les PV aussi', avec.pvMax - nu.pvMax, R.evaluerRune(5011, { niveau: 18 }).valeur, 0.5);
vrai('  et chaque apport est tracé rune par rune',
     (avec.statsDeRunes || []).length === 3,
     (avec.statsDeRunes || []).map(d => d.rune).join(', '));

console.log('\n── Unités : 10 affiché en jeu vaut 0,10 dans le profil');
/* Le moteur de runes rend les valeurs telles qu'AFFICHÉES. Le profil compte les
   pourcentages en fractions. Sans conversion, un fragment de vitesse d'attaque en
   aurait apporté mille pour cent. */
const asBrut = R.evaluerRune(5005, { niveau: 18 }).valeur;
vrai('le moteur de runes rend bien 10, pas 0,10', asBrut === 10, String(asBrut));
verifie('  et le profil en reçoit 0,10',
        M.profil('Caitlyn', 18, [], { runes: [5005] }).bonusVitesseAttaque, 0.1);
const tenBrut = R.evaluerRune(5013, { niveau: 18 }).valeur;
verifie('même conversion pour la ténacité',
        M.profil('Caitlyn', 18, [], { runes: [5013] }).tenacite, tenBrut / 100);

console.log('\n── Stats dérivées : elles se recalculent, elles ne s\'incrémentent pas');
/* Ajouter « +13 % » à une vitesse d'attaque de 1,106 donnerait 14,1 attaques par
   seconde. La vitesse d'attaque et la vitesse de déplacement ont leurs formules
   propres, et sont donc reprises en fin de profil. */
const vite = M.profil('Caitlyn', 18, [], { runes: [5005, 9104] });
verifie('la vitesse d\'attaque passe par la formule du champion',
        vite.vitesseAttaque, M.vitesseAttaque(M.champions.Caitlyn.base, 18, 0.13), 0.001);
vrai('  et non par une addition brute',
     Math.abs(vite.vitesseAttaque - (1.106 + 0.13)) > 0.04,
     'obtenu ' + Math.round(vite.vitesseAttaque * 1000) / 1000 + ', l\'addition donnerait 1.236');
/* Contre-épreuve la plus parlante : Jhin a un ratio de vitesse d'attaque NUL — son
   passif convertit la vitesse d'attaque en dégâts. Sa vitesse ne doit pas bouger d'un
   iota, quelle que soit la rune. Un modèle qui additionne échouerait ici. */
verifie('Jhin, ratio nul : sa vitesse d\'attaque ne bouge pas',
        M.profil('Jhin', 18, [], { runes: [5005, 9104] }).vitesseAttaque,
        M.profil('Jhin', 18, []).vitesseAttaque, 0.0001);
const mob = M.profil('Caitlyn', 18, [], { runes: [5010] });
verifie('la vitesse de déplacement repasse par son plafond progressif',
        mob.ms, M.vitesseDeplacement(M.champions.Caitlyn.base.ms, 0, 0.025), 0.001);

console.log('\n── Une rune peut apporter une stat qu\'aucun objet ne porte');
/* Le gain était silencieusement perdu : l'application n'incrémentait que les stats
   déjà présentes dans le profil. Sur un build sans objet de ténacité, le fragment
   n'existait tout simplement pas. */
verifie('ténacité sans aucun objet de ténacité',
        M.profil('Caitlyn', 18, [3031], { runes: [5013] }).tenacite,
        R.evaluerRune(5013, {}).valeur / 100);
verifie('vol de vie sans aucun objet de vol de vie',
        M.profil('Caitlyn', 18, [3031], { runes: [9103] }).volVie,
        R.evaluerRune(9103, {}).valeur / 100, 0.0001);

console.log('\n── Force adaptative : la plus haute des deux stats bonus');
/* 1 point donne 1 puissance OU 0,6 dégât d'attaque. À égalité, c'est le TYPE ADAPTATIF
   du champion qui tranche — lu dans le fichier de jeu, pas déduit de la couleur des
   sorts. L'égalité n'est pas un cas d'école : elle vaut à chaque niveau 1. */
const pts = R.evaluerRune(5008, {}).valeur;
verifie('sur un champion à puissance, la force adaptative donne de la puissance',
        M.profil('Ryze', 18, [3089], { runes: [5008] }).ap
        - M.profil('Ryze', 18, [3089]).ap, pts * 1.3, 0.01);
vrai('  (et la Coiffe de Rabadon amplifie AUSSI ce gain de rune)', true,
     pts + ' de force adaptative → ' + Math.round(pts * 1.3 * 100) / 100 + ' de puissance');
verifie('sur un champion à dégâts, elle donne 0,6 AD par point',
        M.profil('Jhin', 18, [3031], { runes: [5008] }).adBonus
        - M.profil('Jhin', 18, [3031]).adBonus, pts * 0.6, 0.01);
/* Le départage à égalité, dans les deux sens. */
vrai('à égalité, Ryze reçoit de la puissance',
     M.profil('Ryze', 1, [], { runes: [5008] }).statsDeRunes[0].stat === 'ap');
vrai('  et Jhin des dégâts d\'attaque',
     M.profil('Jhin', 1, [], { runes: [5008] }).statsDeRunes[0].stat === 'ad');
vrai('  le type adaptatif vient du fichier de jeu, pas d\'une déduction',
     M.champions.Ryze.base.adaptatifAP === true && M.champions.Jhin.base.adaptatifAP === false);
/* Contre-épreuve : la règle principale doit primer sur le type. Un Ryze couvert de
   dégâts d'attaque reçoit de l'AD, quoi qu'en dise son type adaptatif. */
vrai('un champion à puissance couvert d\'AD reçoit pourtant de l\'AD',
     P.versAdaptatif(9, { ap: 0, adBonus: 200 }, true).stat === 'ad');

console.log('\n── Liste blanche : seul le permanent entre dans le profil');
/* Le Manteau nuageux affiche 45 % de vitesse de déplacement — une bouffée de quelques
   secondes après un sort d'invocateur. La verser au profil ferait passer un champion
   pour deux fois plus mobile qu'il n'est. */
const temporaires = M.profil('Caitlyn', 18, [], { runes: [8275, 8232, 8236] });
verifie('aucune rune temporaire n\'entre dans les stats', temporaires.vd || 0, 0);
vrai('  et chacune est refusée AVEC son motif',
     (temporaires.runesRefusees || []).length === 3,
     (temporaires.runesRefusees || []).join(' | '));
vrai('une rune de dégâts n\'est ni appliquée ni signalée comme un défaut',
     (M.profil('Caitlyn', 18, [], { runes: [8112] }).runesRefusees || []).length === 0,
     'Électrocution : elle agit sur les dégâts, pas sur les stats');

console.log('\n── L\'ordre : les runes avant les passifs qui les lisent');
/* Trois passifs lisent des stats que les runes alimentent. Les appliquer après aurait
   fait perdre à chacun l'apport des runes. */
const sansR = M.profil('Sion', 18, [2501], { fenetre: 10 });
const avecR = M.profil('Sion', 18, [2501], { fenetre: 10, runes: [5011] });
const pvRune = R.evaluerRune(5011, {}).valeur;
verifie('l\'Armure sanguine convertit AUSSI les PV venus des runes',
        avecR.adBonus - sansR.adBonus, pvRune * 0.025, 0.01);

console.log('\n── Amplifications de runes : même seau additif que les objets');
const val = (id, cle) => R.parId[id].valeurs[cle];
/* `evaluerCalcul` ne remonte l'amplification que si elle a quelque chose à dire — un
   total non nul ou un refus. Un « rien du tout » est donc un `null` légitime. */
const amp = r => r.amplification || { total: 0, detail: [], refus: [] };
const cible = M.cibleChampion('Sion', 18, [3068]);
const cibleBasse = Object.assign({}, cible, { pvActuels: cible.pvMax * 0.3 });
const ryze = M.profil('Ryze', 18, [], { fenetre: 10, runes: [8014, 8017] });
const nomQ = Object.keys(M.champions.Ryze.sorts.Q.calculs)
  .find(n => M.champions.Ryze.sorts.Q.calculs[n].genre === 'degats');

/* Coup de grâce (sous 40 %) et Abattage (au-dessus de 60 %) sont exclusifs par
   construction : aucune cible ne peut déclencher les deux. C'est la meilleure preuve
   que la condition est réellement évaluée, et non contournée. */
const hautePV = amp(M.evaluerCalcul('Ryze', 'Q', nomQ, 5, ryze, cible));
const bassePV = amp(M.evaluerCalcul('Ryze', 'Q', nomQ, 5, ryze, cibleBasse));
vrai('contre une cible à pleine vie, seul Abattage s\'applique',
     hautePV.detail.length === 1 && /Abattage/.test(hautePV.detail[0].rune));
vrai('  et sous 40 %, seul Coup de grâce',
     bassePV.detail.length === 1 && /Coup de grâce/.test(bassePV.detail[0].rune));
verifie('  chacun vaut bien 8 %', hautePV.total, val(8017, 'BonusPercentDamage'));

/* LE point de composition : une rune et un objet s'additionnent, ils ne se multiplient
   pas. La différence est petite et donc invisible — c'est précisément pour ça qu'elle
   mérite un test. */
const mixte = M.profil('Ryze', 18, [3161], { fenetre: 10, runes: [8017] });
const ampMixte = amp(M.evaluerCalcul('Ryze', 'Q', nomQ, 5, mixte, cible));
const shojin = 0.03 * 4 * 0.5;                       // 3 % × 4 cumuls, moitié à distance
verifie('rune + objet s\'ADDITIONNENT', ampMixte.total, 0.08 + shojin, 0.0001);
vrai('  et ne se multiplient pas',
     Math.abs(ampMixte.facteur - 1.08 * (1 + shojin)) > 0.004,
     'additif ' + Math.round(ampMixte.facteur * 10000) / 10000 +
     ' contre multiplicatif ' + Math.round(1.08 * (1 + shojin) * 10000) / 10000);

/* Arcaniste axiomatique n'amplifie QUE l'ultime. L'étendre à tout multiplierait par
   près de quatre le champ d'une rune qui ne touche qu'un sort. */
const syndra = M.profil('Syndra', 18, [], { fenetre: 10, runes: [8224] });
const calcDe = t => Object.keys(M.champions.Syndra.sorts[t].calculs)
  .find(n => M.champions.Syndra.sorts[t].calculs[n].genre === 'degats');
const ampR = amp(M.evaluerCalcul('Syndra', 'R', calcDe('R'), 3, syndra, cible));
const ampQ = amp(M.evaluerCalcul('Syndra', 'Q', calcDe('Q'), 5, syndra, cible));
verifie('l\'Arcaniste axiomatique amplifie l\'ultime', ampR.total, val(8224, 'DamageAmp'));
verifie('  et rien d\'autre : le Q n\'est pas touché', ampQ.total, 0);
verifie('  ni les attaques de base',
        M.degatsAttaque(syndra, cible).parCoup,
        M.degatsAttaque(M.profil('Syndra', 18, []), cible).parCoup, 0.01);

/* Baroud d'honneur : de 5 % à 11 % selon les PV MANQUANTS du porteur. Le moteur de
   runes affiche 11 % — une valeur d'étalage. La servir telle quelle offrirait le
   maximum en permanence à qui prend la rune. */
const baroud = M.profil('Ryze', 18, [], { fenetre: 10, runes: [8299] });
const ampAt = f => amp(M.evaluerCalcul('Ryze', 'Q', nomQ, 5, baroud, cible, { partPvPorteur: f })).total;
verifie('à pleine vie, Baroud d\'honneur ne donne rien', ampAt(1), 0);
/* La rampe est CONTINUE entre 60 % et 30 % : à 59 % de PV on obtient 5,2 %, pas 5 %.
   C'est à la borne exacte que le minimum s'observe — et juste au-dessus, le saut à
   zéro, qui est la façon dont la rune fonctionne. */
verifie('à 60 % pile, Baroud d\'honneur donne son minimum', ampAt(0.6),
        val(8299, 'MinBonusDamagePercent'), 0.0001);
verifie('  et juste au-dessus, plus rien', ampAt(0.601), 0);
verifie('  à 40 %, une valeur interpolée', ampAt(0.4), 0.05 + 0.06 * (0.6 - 0.4) / 0.3, 0.0001);
verifie('  à 30 % et en dessous, son maximum', ampAt(0.2), val(8299, 'MaxBonusDamagePercent'));
vrai('  sans PV du porteur, le porteur est supposé à pleine vie — donc zéro',
     amp(M.evaluerCalcul('Ryze', 'Q', nomQ, 5, baroud, cible)).total === 0);

/* Premier coup dépend d'une fenêtre de 0,25 s au début du combat : invérifiable ici,
   donc REFUSÉE avec son motif plutôt que servie. */
const premier = M.profil('Ryze', 18, [], { fenetre: 10, runes: [8369] });
const sansOuv = amp(M.evaluerCalcul('Ryze', 'Q', nomQ, 5, premier, cible));
verifie('sans ouverture déclarée, Premier coup n\'apporte rien', sansOuv.total, 0);
vrai('  et le refus porte son motif', /Premier coup/.test(sansOuv.refus.join(' ')),
     sansOuv.refus.join(' '));
verifie('déclarée, elle vaut 7 %',
        amp(M.evaluerCalcul('Ryze', 'Q', nomQ, 5, premier, cible, { ouvertureCombat: true })).total,
        val(8369, 'DamageAmp'));

/* Abattage : le fichier porte des clés RÉSIDUELLES d'une version antérieure
   (Min/MaxBonusDamagePercent, MinHealthDifference). Les servir donnerait 15 % au lieu
   de 8 % — la leçon de `SiphonDamage`, transposée aux runes. */
vrai('les clés résiduelles d\'Abattage ne sont pas servies',
     hautePV.total !== val(8017, 'MaxBonusDamagePercent'),
     'servi ' + hautePV.total + ', la clé résiduelle vaudrait ' + val(8017, 'MaxBonusDamagePercent'));

console.log('\n═══ ' + ok + ' réussis, ' + ko + ' échoués ═══\n');
process.exit(ko ? 1 : 0);
