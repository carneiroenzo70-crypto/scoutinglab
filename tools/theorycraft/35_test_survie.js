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

/* Les calculs de genre « soin » sont extraits depuis le début pour les 90 champions et
   n'avaient jamais servi. L'efficacité des soins et boucliers les amplifie. */
const sup = M.profil('Lulu', 18, [3222, 3504], { fenetre: 10 });
const bouclier = ['Q', 'W', 'E', 'R'].map(k => S.soinsDuChampion('Lulu', k, 5, sup)).find(r => r.ok);
vrai('un bouclier de champion est enfin chiffré', !!bouclier,
     bouclier ? bouclier.lignes[0].calcul + ' = ' + bouclier.lignes[0].brut : 'aucun');
if (bouclier) {
  verifie('  et amplifié par les soins et boucliers de l\'équipement',
          bouclier.lignes[0].amplifie,
          bouclier.lignes[0].brut * (1 + stat(3222, 'soinsEtBoucliers') + stat(3504, 'soinsEtBoucliers')),
          0.5);
}

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
