/* Vérification du modèle de survie et d'utilitaire.

   Même exigence que pour les dégâts : chaque chiffre doit pouvoir se poser à la main,
   et chaque règle de composition doit avoir sa CONTRE-ÉPREUVE — la valeur qu'on aurait
   obtenue en se trompant. Sans elle, un test ne fait que confirmer ce qu'on a écrit. */

const M = require('./26_modele_degats');
const S = require('./34_modele_survie');
const items = require('./items.json');

let ok = 0, ko = 0;
function vrai(nom, cond, info) {
  cond ? ok++ : ko++;
  console.log('  ' + (cond ? 'OK   ' : 'ÉCHEC') + '  ' + nom + (info ? '  ' + info : ''));
}
function verifie(nom, obtenu, attendu, tol = 0.01) {
  const bon = Math.abs(obtenu - attendu) <= tol;
  bon ? ok++ : ko++;
  console.log('  ' + (bon ? 'OK   ' : 'ÉCHEC') + '  ' + nom.padEnd(56) +
              'obtenu ' + (Math.round(obtenu * 1000) / 1000) + '   attendu ' + (Math.round(attendu * 1000) / 1000));
}
const stat = (id, k) => (items.find(o => o.id === id).stats[k] || {}).valeur;

console.log('\n── Aucune statistique ne se perd entre l\'objet et le profil');
/* Le point de départ de tout ce fichier : dix familles de stats étaient extraites puis
   abandonnées. Ce test les reprend une par une sur un objet qui les porte. */
const perdues = [
  /* ⚠ Les bottes donnent de la vitesse PLATE (`vdPlate`), pas un pourcentage : c'est
     la Lame spectre de Youmuu qu'il faut prendre comme témoin de `vd`. Mon premier
     essai a échoué dessus — le test avait raison, pas moi. */
  ['vd', 3142], ['vdPlate', 3009], ['volVie', 3072], ['omnivamp', 3146],
  ['soinsEtBoucliers', 3222], ['tenacite', 3111], ['regenPVpct', 3083]
];
perdues.forEach(([cle, id]) => {
  const v = stat(id, cle);
  if (v == null) { vrai(cle + ' : objet témoin sans cette stat', false, String(id)); return; }
  const p = M.profil('Sion', 18, [id], { fenetre: 10 });
  vrai(cle + ' arrive jusqu\'au profil', p[cle] != null && p[cle] > 0,
       (items.find(o => o.id === id).nom) + ' → ' + p[cle]);
});

console.log('\n── PV effectifs : ce qui rend comparables PV et résistances');
/* Un objet de PV et un objet d'armure sont incomparables tant qu'on regarde les deux
   stats séparément. Les PV effectifs sont le seul terrain commun. */
const tank = M.profil('Sion', 18, [3068, 3143, 3083], { fenetre: 10 });
const e = S.pvEffectifs(tank, 0.5);
verifie('PV effectifs contre le physique = PV × (1 + armure/100)',
        e.contrePhysique, tank.pvMax * (1 + tank.armure / 100), 1);
verifie('PV effectifs contre le magique = PV × (1 + RM/100)',
        e.contreMagique, tank.pvMax * (1 + tank.rm / 100), 1);
/* LA contre-épreuve : le mixte est la moyenne des dégâts REÇUS, donc l'inverse de la
   moyenne des inverses. La moyenne arithmétique des deux PV effectifs surestimerait la
   survie, et d'autant plus que l'écart armure/RM est grand — le cas de tous les tanks. */
verifie('le mixte est la moyenne HARMONIQUE des deux',
        e.mixte, 2 / (1 / e.contrePhysique + 1 / e.contreMagique), 1);
vrai('  la moyenne arithmétique donnerait un chiffre nettement plus flatteur',
     (e.contrePhysique + e.contreMagique) / 2 > e.mixte * 1.1,
     Math.round((e.contrePhysique + e.contreMagique) / 2) + ' contre ' + e.mixte);

/* Une résistance NÉGATIVE (réduction poussée sous zéro) doit faire baisser les PV
   effectifs sous les PV bruts, avec le rendement dégressif de `multiplicateur`. */
verifie('une résistance négative descend sous les PV bruts',
        S.pvEffectifs({ pvMax: 1000, armure: -50, rm: 0 }, 1).contrePhysique,
        1000 / M.multiplicateur(-50), 1);

console.log('\n── Le bon achat dépend de ce qu\'on a déjà');
/* C'est tout l'intérêt d'un calculateur : la réponse « PV ou armure ? » n'est jamais
   absolue. Sur un champion déjà très blindé, les PV rapportent davantage. */
const nu = [];
const blinde = [3068, 3143, 3110];
const gPV = S.gainSurvie('Sion', 18, blinde, 3083, 0.5);      // Warmog, PV purs
const gArm = S.gainSurvie('Sion', 18, blinde, 3075, 0.5);     // Cotte épineuse, armure
vrai('sur un champion déjà blindé, les PV rapportent plus par pièce d\'or',
     gPV.parMillePo > gArm.parMillePo,
     'Warmog ' + gPV.parMillePo + ' vs Cotte épineuse ' + gArm.parMillePo + ' PV effectifs / 1000 po');
vrai('  et le gain est chiffré, pas qualitatif', gPV.gain > 0 && gPV.prix > 0,
     '+' + gPV.gain + ' PV effectifs pour ' + gPV.prix + ' po');

console.log('\n── Ténacité : une réduction ne s\'additionne pas');
/* Erreur commise puis corrigée : les Sandales de Mercure (30 %) et le Gage de Sterak
   (20 %) donnaient 50 % de réduction là où le jeu en applique 44 %. Une réduction qui
   s'additionne finit par atteindre 100 %, ce qu'aucune réduction du jeu ne fait. */
const deux = M.profil('Sion', 18, [3111, 3053], { fenetre: 10 });
verifie('30 % et 20 % de ténacité composent à 44 %', deux.tenacite,
        1 - (1 - stat(3111, 'tenacite')) * (1 - stat(3053, 'tenacite')), 0.0001);
vrai('  et non à 50 % comme le donnerait une addition',
     Math.abs(deux.tenacite - 0.5) > 0.05, 'obtenu ' + deux.tenacite);
verifie('une seule source reste exacte',
        M.profil('Sion', 18, [3111], { fenetre: 10 }).tenacite, stat(3111, 'tenacite'), 0.0001);
/* La réserve la plus importante du modèle défensif : la ténacité ne touche pas tout. */
const c = S.controle(deux);
vrai('les contrôles hors de portée de la ténacité sont nommés',
     c.horsPortee.includes('projection') && c.horsPortee.includes('suppression'),
     c.horsPortee.join(', '));

console.log('\n── Vitesse de déplacement : le plafond progressif');
/* Trois régimes, et des bornes qui doivent se raccorder exactement — le meilleur
   contrôle possible d'une formule à seuils. */
verifie('sous 415, aucune correction', M.vitesseDeplacement(400, 0, 0), 400, 0.001);
verifie('à 415 pile, les deux régimes coïncident', M.vitesseDeplacement(415, 0, 0), 415, 0.001);
verifie('à 490, les deux paliers hauts coïncident aussi',
        M.vitesseDeplacement(490, 0, 0), 490 * 0.8 + 83, 0.001);
verifie('  et le palier suivant donne la même valeur', 490 * 0.5 + 230, 490 * 0.8 + 83, 0.001);
verifie('à 220, le palier bas se raccorde', M.vitesseDeplacement(220, 0, 0), 220, 0.001);
verifie('sous 220, la formule basse s\'applique', M.vitesseDeplacement(200, 0, 0), 110 + 200 * 0.5, 0.001);
/* Contre-épreuve : ignorer le plafond ferait croire qu'un quatrième objet de vitesse
   rapporte autant que le premier. */
const brut600 = 600;
vrai('au-delà de 490, un point brut ne vaut plus qu\'un demi-point',
     Math.abs((M.vitesseDeplacement(brut600 + 10, 0, 0) - M.vitesseDeplacement(brut600, 0, 0)) - 5) < 0.001,
     '+10 bruts → +' + (M.vitesseDeplacement(brut600 + 10, 0, 0) - M.vitesseDeplacement(brut600, 0, 0)) + ' réels');
/* Ordre officiel : plats d'abord, pourcentages ensuite sur le total. */
verifie('les bonus plats entrent avant les pourcentages',
        M.vitesseDeplacement(300, 45, 0.05), (300 + 45) * 1.05, 0.001);

console.log('\n── Soins, boucliers et drain : trois canaux distincts');
/* Les confondre donnerait un chiffre qui ne correspond à rien : le vol de vie ne porte
   que sur les attaques de base, l'omnivampirisme sur tout. */
const d = S.drain({ volVie: 0.2, omnivamp: 0.1 }, 200, 300);
verifie('le vol de vie ne s\'applique qu\'aux attaques', d.detail[0].valeur, 200 * 0.3, 0.01);
verifie('  et l\'omnivampirisme aussi aux compétences', d.detail[1].valeur, 300 * 0.1, 0.01);
vrai('  additionner les deux canaux serait un contresens',
     Math.abs(d.parSeconde - (200 + 300) * 0.3) > 1,
     'obtenu ' + d.parSeconde + ', le raccourci donnerait ' + (200 + 300) * 0.3);

/* Les calculs de soin et de bouclier sont extraits depuis le début pour les 90 champions
   et n'avaient jamais servi. L'efficacité des soins et boucliers de l'équipement les
   amplifie — les deux genres sont désormais rendus séparément. */
const sup = M.profil('Lulu', 18, [3222, 3504], { fenetre: 10 });
const protection = ['Q', 'W', 'E', 'R'].map(k => S.soinsDuChampion('Lulu', k, 5, sup))
  .find(r => r.ok && (r.soins.length || r.boucliers.length));
const premier = protection && (protection.boucliers[0] || protection.soins[0]);
vrai('une protection de champion est enfin chiffrée', !!premier,
     premier ? premier.calcul + ' = ' + premier.brut : 'aucune');
if (premier) {
  verifie('  et amplifiée par les soins et boucliers de l\'équipement',
          premier.amplifie,
          premier.brut * (1 + stat(3222, 'soinsEtBoucliers') + stat(3504, 'soinsEtBoucliers')),
          0.5);
}

console.log('\n── Régénération : une base qui n\'existait pas');
/* 12 objets à « % de régénération de vie » et 15 à « % de régénération de mana »
   multipliaient jusqu'ici une base absente du modèle. Elle est extraite du fichier de
   jeu, PAR SECONDE — Data Dragon, lui, publie par 5 secondes. */
const DD = require('./champFull.json').data;
verifie('la régénération de base concorde avec Data Dragon (facteur 5)',
        M.champions.Ryze.base.regenPV * 5, DD.Ryze.stats.hpregen, 0.02);
verifie('  de même pour le mana', M.champions.Ryze.base.regenMana * 5, DD.Ryze.stats.mpregen, 0.02);
/* Trois champions n'ont pas la clé dans le fichier : leur valeur vient d'un gabarit non
   exposé. Data Dragon comble, et le repli est marqué — pas silencieux. */
vrai('les trois champions sans la clé portent la mention de leur source',
     ['Maokai', 'Rakan', 'Milio'].every(c => /Data Dragon/.test(M.champions[c].base.sourceRegen)),
     M.champions.Maokai.base.sourceRegen);
vrai('  et les 87 autres viennent du fichier de jeu',
     Object.values(M.champions).filter(c => c.base.sourceRegen === 'fichier de jeu').length === 87);

/* Concordance de l'unité des OBJETS, vérifiée sur la boutique : le Bouclier de Doran est
   extrait à 0,8 et annonce « 4 PV toutes les 5 sec ». Même unité que les champions. */
const doran = stat(1054, 'regenPV');
verifie('un objet à régénération plate s\'ajoute dans la même unité',
        M.profil('Ryze', 18, [1054], { fenetre: 10 }).regenPVtotal,
        M.profil('Ryze', 18, [], { fenetre: 10 }).regenPVbase + doran, 0.01);
/* Et le pourcentage multiplie bien la base — c'était le point mort. */
const pct = stat(1006, 'regenPVpct');
verifie('un objet en pourcentage multiplie la base du champion',
        M.profil('Ryze', 18, [1006], { fenetre: 10 }).regenPVtotal,
        M.profil('Ryze', 18, [], { fenetre: 10 }).regenPVbase * (1 + pct), 0.01);

console.log('\n── Autonomie en mana : les coûts des sorts servent enfin');
const ryze = S.ficheBuild('Ryze', 18, [3003]);
const auto = ryze.soutien.autonomie;
vrai('le coût d\'un cycle complet est chiffré', auto && auto.coutDuCycle > 0,
     auto.coutDuCycle + ' de mana pour Q+W+E+R');
verifie('  et le nombre de cycles suit la réserve', auto.cycles,
        Math.floor(M.profil('Ryze', 18, [3003], { fenetre: 10 }).mana / auto.coutDuCycle), 0);
/* Un champion sans mana ne doit pas recevoir « 0 cycle » — ce serait faux, pas
   incomplet : la question ne se pose pas dans les mêmes termes. */
vrai('un champion à chaleur n\'a pas d\'autonomie en mana, et non zéro',
     S.ficheBuild('Rumble', 18, []).soutien.autonomie === null);

console.log('\n── Accélération d\'ultime : elle ne touche que le R');
/* Trois objets finis la portent, dans une clé que Data Dragon ne publie pas. Elle
   n'était appliquée nulle part : la Malfaisance perdait tout son intérêt. */
const malf = M.profil('Syndra', 18, [3118], { fenetre: 10 });
verifie('la Malfaisance apporte 20 d\'accélération d\'ultime', malf.accelUltime, 20, 0.01);
const cdR = M.champions.Syndra.sorts.R.cooldown[3];
verifie('  et le R en profite', M.rechargeReelle(cdR, malf.accel + malf.accelUltime),
        cdR * 100 / (100 + malf.accel + malf.accelUltime), 0.01);
/* Contre-épreuve : si on la versait dans l'accélération générale, le Q en profiterait
   aussi — quatre fois l'effet réel. */
const fen = (p, t) => {
  const c = M.champions.Syndra.sorts[t];
  const nom = Object.keys(c.calculs).find(n => c.calculs[n].genre === 'degats');
  const r = M.degatsSurFenetre('Syndra', p, null, 60,
    x => (x === t && nom) ? 1 : null);
  return (r.lignes.find(l => l.touche === t) || {}).recharge;
};
const sans = M.profil('Syndra', 18, [], { fenetre: 10 });
verifie('le Q, lui, garde sa recharge inchangée', fen(malf, 'Q'),
        M.rechargeReelle(M.champions.Syndra.sorts.Q.cooldown[5], malf.accel), 0.05);
vrai('  alors que le R accélère nettement', fen(malf, 'R') < fen(sans, 'R') * 0.8,
     fen(sans, 'R') + ' s → ' + fen(malf, 'R') + ' s');

console.log('\n── Un bouclier n\'est pas un soin');
/* Les deux partageaient une même étiquette. Ce n'est pas du vocabulaire : le wiki
   officiel dit que « resistances will still mitigate the damage BEFORE being absorbed
   by shielding ». Un bouclier profite donc des résistances, un soin non. */
const genres = {};
Object.values(M.champions).forEach(c => Object.values(c.sorts).forEach(s =>
  Object.values(s.calculs).forEach(v => { genres[v.genre] = (genres[v.genre] || 0) + 1; })));
vrai('les deux genres sont désormais distincts',
     genres.bouclier > 0 && genres.soin > 0,
     genres.bouclier + ' boucliers, ' + genres.soin + ' soins (75 sous une seule étiquette avant)');

const lulu = M.profil('Lulu', 18, [3222, 3504, 3157], { fenetre: 10 });
const eLulu = ['Q', 'W', 'E', 'R'].map(t => S.soinsDuChampion('Lulu', t, 5, lulu)).find(r => r.ok && r.boucliers.length);
vrai('le bouclier de Lulu est classé comme tel', !!eLulu && eLulu.boucliers.length === 1,
     eLulu ? eLulu.boucliers[0].calcul : 'aucun');
if (eLulu) {
  const b = eLulu.boucliers[0];
  verifie('  amplifié par l\'efficacité des soins et boucliers',
          b.amplifie, b.brut * (1 + stat(3222, 'soinsEtBoucliers') + stat(3504, 'soinsEtBoucliers')), 0.5);
  /* LE point : ce que le bouclier absorbe RÉELLEMENT, résistances comprises. */
  verifie('  et il absorbe bien plus que sa valeur affichée',
          b.absorbePhysique, b.amplifie / M.multiplicateur(lulu.armure), 1);
  vrai('  soit deux fois et demie sa valeur sur ce profil',
       b.absorbePhysique > b.amplifie * 2,
       b.amplifie + ' affichés → ' + b.absorbePhysique + ' absorbés contre ' +
       Math.round(lulu.armure) + ' d\'armure');
}

/* Boucliers d'objet : quatre sont désormais chiffrés, dont un qui ne vaut que contre
   la magie — le compter comme les autres doublerait sa valeur. */
const bouclierTank = S.ficheBuild('Sion', 18, [2504, 6673, 3068, 3143], { fenetre: 10 }).defensif;
vrai('les boucliers d\'objet sont comptés à part des PV effectifs',
     bouclierTank.pvEffectifsAvecBoucliers > bouclierTank.pvEffectifsMixte,
     bouclierTank.pvEffectifsMixte + ' → ' + bouclierTank.pvEffectifsAvecBoucliers);
const rookern = bouclierTank.boucliers.lignes.find(l => /Rookern/.test(l.objet));
vrai('  et le Rookern est marqué « contre la magie » seulement',
     rookern && rookern.contre === 'magique',
     rookern ? rookern.montant + ' de bouclier, ' + rookern.absorbe + ' absorbés' : 'absent');
vrai('  un bouclier ordinaire du même profil absorbe davantage, à montant comparable',
     (() => {
       const arc = bouclierTank.boucliers.lignes.find(l => /Arc-bouclier/.test(l.objet));
       return arc && rookern && (arc.absorbe / arc.montant) > (rookern.absorbe / rookern.montant);
     })(), 'le Rookern ne couvre que la moitié magique du combat');

/* Éclipse n'a AUCUN calcul dans le fichier : ses nombres vivent dans les DataValues.
   Les termes sont déclarés, les valeurs restent lues — et la version à distance suit. */
const ecl = require('./30_moteur_items');
const eclM = ecl.evaluerPassif(6692, M.profil('Sion', 18, [6692], { fenetre: 10 }), null, {});
const eclD = ecl.evaluerPassif(6692, M.profil('Jhin', 18, [6692], { fenetre: 10 }), null, {});
verifie('Éclipse en mêlée : base + 40 % de l\'AD bonus', eclM.brut,
        stat(6692, 'ad') * 0.4 + 150, 0.5);
verifie('  et la moitié à distance', eclD.brut, eclM.brut * 0.5, 0.5);

console.log('\n── La fiche d\'un build ne se résume pas à ses dégâts');
const fTank = S.ficheBuild('Sion', 18, [3068, 3143, 3083, 3075]);
const fMage = S.ficheBuild('Ryze', 18, [3089, 3157, 3003, 4645]);
vrai('les cinq axes sont renseignés',
     !!(fTank.offensif && fTank.defensif && fTank.utilitaire && fTank.soutien && fTank.passifs));
/* Le rapport constaté est de 1,9 — pas de seuil rond inventé : on affirme l'écart
   mesuré, et on l'affiche pour qu'il soit relisible au prochain patch. */
vrai('le tank survit près de deux fois plus longtemps, à or comparable',
     fTank.defensif.pvEffectifsMixte > fMage.defensif.pvEffectifsMixte * 1.5,
     fTank.defensif.pvEffectifsMixte + ' contre ' + fMage.defensif.pvEffectifsMixte +
     ' (rapport ' + Math.round(fTank.defensif.pvEffectifsMixte / fMage.defensif.pvEffectifsMixte * 100) / 100 +
     ', pour ' + fTank.or + ' po contre ' + fMage.or + ')');
vrai('  et le mage en puissance', fMage.offensif.ap > fTank.offensif.ap,
     fMage.offensif.ap + ' contre ' + fTank.offensif.ap);
/* Le point de la démonstration : un build peut être meilleur sans infliger plus. */
vrai('un build peut gagner sur un axe et perdre sur l\'autre',
     fTank.defensif.pvEffectifsMixte > fMage.defensif.pvEffectifsMixte &&
     fMage.offensif.ap > fTank.offensif.ap);

console.log('\n═══ ' + ok + ' réussis, ' + ko + ' échoués ═══\n');
process.exit(ko ? 1 : 0);
