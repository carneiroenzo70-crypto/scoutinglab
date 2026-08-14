/* Vérification des runes de dégâts et de soin sur une fenêtre de combat.

   Le point du fichier : une rune ne vaut rien dans l'absolu, seulement rapportée à sa
   CADENCE. Chaque test compare donc un montant à un nombre de déclenchements, et non à
   une valeur d'étalage. */

const M = require('./26_modele_degats');
const C = require('./38_runes_combat');
const R = require('./14_moteur_runes');

let ok = 0, ko = 0;
function vrai(nom, cond, info) {
  cond ? ok++ : ko++;
  console.log('  ' + (cond ? 'OK   ' : 'ÉCHEC') + '  ' + nom + (info ? '  ' + info : ''));
}
function verifie(nom, obtenu, attendu, tol = 0.01) {
  const bon = Math.abs(obtenu - attendu) <= tol;
  bon ? ok++ : ko++;
  console.log('  ' + (bon ? 'OK   ' : 'ÉCHEC') + '  ' + nom.padEnd(56) +
              'obtenu ' + (Math.round(obtenu * 100) / 100) + '   attendu ' + (Math.round(attendu * 100) / 100));
}
const val = (id, cle) => R.parId[id].valeurs[cle];
const cible = M.cibleChampion('Sion', 18, [3068]);
const ligne = (r, nom) => r.lignes.find(l => new RegExp(nom).test(l.rune));

console.log('\n── La cadence, pas la valeur d\'étalage');
/* L'Électrocution inflige 270 toutes les 20 s, la Brûlure 40 toutes les 10. Comparées
   hors du temps, la première paraît sept fois meilleure ; sur 20 s, l'écart fond. */
const mage = M.profil('Ryze', 18, [], { fenetre: 20, runes: [8112, 8237] });
const f20 = C.surFenetre('Ryze', mage, cible, 20, {});
verifie('l\'Électrocution se déclenche 2 fois en 20 s',
        ligne(f20, 'Électro').declenchements, 1 + Math.floor(20 / val(8112, 'Cooldown')), 0);
verifie('  la Brûlure 3 fois', ligne(f20, 'Brûlure').declenchements,
        1 + Math.floor(20 / val(8237, 'BurnlockoutDuration')), 0);
vrai('  le rapport entre les deux n\'est plus celui des valeurs seules',
     ligne(f20, 'Électro').brut / ligne(f20, 'Brûlure').brut < 6,
     Math.round(ligne(f20, 'Électro').brut) + ' contre ' + Math.round(ligne(f20, 'Brûlure').brut) +
     ' sur 20 s, alors que les valeurs unitaires sont dans un rapport de ' +
     Math.round(ligne(f20, 'Électro').parDeclenchement / ligne(f20, 'Brûlure').parDeclenchement));
/* Plus la fenêtre s'allonge, plus l'écart se resserre — la rune à recharge courte
   rattrape. Elle ne passe PAS devant ici, et le prétendre serait aussi faux que
   d'ignorer la cadence : l'Électrocution frappe six fois plus fort pour une recharge
   seulement deux fois plus longue. C'est le SENS de la variation qui compte. */
const f60 = C.surFenetre('Ryze', mage, cible, 60, {});
const ecart = f => ligne(f, 'Électro').brut / ligne(f, 'Brûlure').brut;
vrai('plus la fenêtre s\'allonge, plus l\'écart se resserre',
     ecart(f60) < ecart(f20),
     'rapport de ' + Math.round(ecart(f20) * 100) / 100 + ' sur 20 s, ' +
     Math.round(ecart(f60) * 100) / 100 + ' sur 60 s, contre ' +
     Math.round(ligne(f20, 'Électro').parDeclenchement / ligne(f20, 'Brûlure').parDeclenchement * 100) / 100 +
     ' pour les valeurs unitaires');

/* ⚠ Les recharges de runes ne sont PAS réduites par l'accélération de compétence. */
const presse = M.profil('Ryze', 18, [3118, 6655], { fenetre: 20, runes: [8112] });
vrai('l\'accélération de compétence ne change pas la cadence des runes',
     presse.accel > 20 &&
     C.surFenetre('Ryze', presse, cible, 20, {}).lignes[0].declenchements
     === ligne(f20, 'Électro').declenchements,
     presse.accel + ' d\'accélération, toujours ' + ligne(f20, 'Électro').declenchements + ' déclenchements');

console.log('\n── Le type des dégâts adaptatifs suit le champion');
/* Magique du côté puissance, physique du côté dégâts d'attaque. Le confondre changerait
   la résistance qui les mitige — donc le résultat, pas seulement l'étiquette. */
const ap = M.profil('Ryze', 18, [3089], { fenetre: 20, runes: [8112] });
const ad = M.profil('Jhin', 18, [3031], { fenetre: 20, runes: [8112] });
vrai('un build à puissance rend des dégâts magiques',
     C.surFenetre('Ryze', ap, cible, 20, {}).typeAdaptatif === 'magique');
vrai('  un build à dégâts d\'attaque, des dégâts physiques',
     C.surFenetre('Jhin', ad, cible, 20, {}).typeAdaptatif === 'physique');
/* Et la mitigation suit : la cible a beaucoup plus d'armure que de RM, donc le même
   montant brut ne donne pas les mêmes dégâts subis. */
const lAP = ligne(C.surFenetre('Ryze', ap, cible, 20, {}), 'Électro');
const lAD = ligne(C.surFenetre('Jhin', ad, cible, 20, {}), 'Électro');
vrai('  le type change réellement les dégâts subis',
     lAP.subis / lAP.brut > lAD.subis / lAD.brut,
     Math.round(lAP.subis / lAP.brut * 100) + ' % passent en magique contre ' +
     Math.round(lAD.subis / lAD.brut * 100) + ' % en physique');

console.log('\n── La pénalité « à distance » n\'était appliquée nulle part');
/* Le moteur de runes savait la traiter depuis toujours — personne ne lui disait de quel
   champion il s'agissait. Toutes les runes concernées servaient leur valeur de mêlée. */
const melee = M.profil('Sion', 18, [], { fenetre: 20, runes: [8437] });
const dist = M.profil('Jhin', 18, [], { fenetre: 20, runes: [8437] });
vrai('le profil porte bien le drapeau', melee.distance === false && dist.distance === true);
verifie('en mêlée, la Poigne inflige 3,5 % des PV max',
        ligne(C.surFenetre('Sion', melee, cible, 20, {}), 'immortel').parDeclenchement,
        melee.pvMax * val(8437, 'PercentHealthDamage'), 1);
verifie('  à distance, la pénalité du fichier s\'applique',
        ligne(C.surFenetre('Jhin', dist, cible, 20, {}), 'immortel').parDeclenchement,
        dist.pvMax * val(8437, 'PercentHealthDamage') * val(8437, 'RangedPenaltyMod'), 1);
/* Le soin associé doit la recevoir aussi : il ne passe pas par le montant principal. */
verifie('  et le SOIN associé la reçoit également',
        ligne(C.surFenetre('Jhin', dist, cible, 20, {}), 'immortel \\(soin\\)').parDeclenchement,
        dist.pvMax * val(8437, 'PercentHealthHeal') * val(8437, 'RangedPenaltyMod'), 1);
vrai('  sans elle, on servirait deux fois et demie trop',
     Math.abs(1 / val(8437, 'RangedPenaltyMod') - 2.5) < 0.01,
     'facteur ' + val(8437, 'RangedPenaltyMod'));

console.log('\n── Dégâts et soins ne se mélangent pas');
const mixte = M.profil('Sion', 18, [], { fenetre: 20, runes: [8437, 8139] });
const fm = C.surFenetre('Sion', mixte, cible, 20, {});
vrai('la Poigne compte deux lignes distinctes',
     fm.lignes.filter(l => /immortel/.test(l.rune)).length === 2,
     fm.lignes.filter(l => /immortel/.test(l.rune)).map(l => l.genre).join(' + '));
vrai('  et le soin n\'entre pas dans les dégâts',
     fm.lignes.filter(l => l.genre === 'soin').every(l => l.subis == null) && fm.soins > 0,
     fm.soins + ' points de soin, ' + fm.degatsSubis + ' de dégâts');

console.log('\n── Liste blanche : une cadence supposée serait une partie inventée');
const conditionnelles = M.profil('Ryze', 18, [], { fenetre: 20, runes: [8128, 9111, 8214, 8008] });
const fc = C.surFenetre('Ryze', conditionnelles, cible, 20, {});
verifie('aucune rune conditionnelle n\'est comptée', fc.degatsSubis, 0);
vrai('  et chacune est refusée avec son motif', fc.refus.length === 4,
     fc.refus.map(x => x.split(' :')[0]).join(', '));
vrai('une rune de stat n\'est ni comptée ni signalée comme un défaut',
     C.surFenetre('Ryze', M.profil('Ryze', 18, [], { runes: [5008] }), cible, 20, {}).refus.length === 0,
     'la force adaptative agit sur le profil, pas sur la fenêtre');

console.log('\n── Attaque soutenue : la moitié qui manquait');
/* La rune n'inflige pas que ses 160 points, elle amplifie AUSSI de 8 % tous les dégâts
   infligés. Le modèle ne voyait que la première moitié. Sa condition — 3 attaques
   consécutives — se CALCULE : fenêtre × vitesse d'attaque. */
const nomQ = Object.keys(M.champions.Ryze.sorts.Q.calculs)
  .find(n => M.champions.Ryze.sorts.Q.calculs[n].genre === 'degats');
const amp = r => r.amplification || { total: 0, detail: [], refus: [] };
const longue = M.profil('Ryze', 18, [], { fenetre: 20, runes: [8005] });
const courte = M.profil('Ryze', 18, [], { fenetre: 2, runes: [8005] });
verifie('sur une fenêtre longue, les 3 frappes tombent : +8 %',
        amp(M.evaluerCalcul('Ryze', 'Q', nomQ, 5, longue, cible)).total,
        val(8005, 'AmpPotencyMaxSelf'), 0.0001);
verifie('  sur 2 s, elles n\'ont pas le temps : rien',
        amp(M.evaluerCalcul('Ryze', 'Q', nomQ, 5, courte, cible)).total, 0);
vrai('  et le refus dit combien de frappes la fenêtre permet',
     /n\'en permet que/.test(amp(M.evaluerCalcul('Ryze', 'Q', nomQ, 5, courte, cible)).refus.join(' ')),
     amp(M.evaluerCalcul('Ryze', 'Q', nomQ, 5, courte, cible)).refus.join(' '));
vrai('la condition est calculée, pas déclarée à la main',
     longue.vitesseAttaque * 20 >= val(8005, 'HitsRequired'),
     Math.floor(longue.vitesseAttaque * 20) + ' frappes possibles pour ' +
     val(8005, 'HitsRequired') + ' requises');

console.log('\n── Runes conditionnées à un FAIT de partie : refus, puis service sur hypothèse');
/* Neuf runes ne manquaient pas d'un chiffre mais d'un fait : « combien de fois
   immobilisez-vous la cible ? ». Le modèle ne le devine pas, il le demande. Les deux
   moitiés doivent être vérifiées — « refuse toujours » passerait le premier controle
   sans jamais rien servir. */
const pLeona = M.profil('Leona', 18, [], { fenetre: 10, runes: [8439, 8126] });
const cibleH = M.cibleChampion('Ryze', 18, []);
const sansH = C.surFenetre('Leona', pLeona, cibleH, 10, {});
verifie('sans hypothèse, ces runes n\'apportent rien', sansH.degatsSubis, 0);
vrai('  et chaque refus NOMME la donnée qui le lèverait',
     sansH.refus.length === 2 && sansH.refus.every(r => r.indexOf('hypotheses.') >= 0),
     sansH.refus[0] || '');
vrai('  le refus ne répète pas le nom de la rune',
     sansH.refus.every(r => r.indexOf(r.split(' :')[0] + ' : ' + r.split(' :')[0]) < 0),
     sansH.refus.join(' | ').slice(0, 90));

const avecH = C.surFenetre('Leona', pLeona, cibleH, 10, { hypotheses: { immobilisations: 2 } });
vrai('avec 2 immobilisations, les deux runes sont servies',
     avecH.lignes.length === 2 && avecH.degatsSubis > 0,
     avecH.degatsSubis + ' dégâts subis');
/* La RECHARGE borne l'hypothèse. Après-coup a 20 s de recharge : sur une fenêtre de
   10 s, deux immobilisations ne peuvent en déclencher qu'UNE. Sans ce plafond, une
   hypothèse généreuse produirait un chiffre que le jeu ne permet pas. */
const apresCoup = avecH.lignes.find(l => l.rune.indexOf('coup') >= 0);
verifie('  mais la recharge de 20 s ramène Après-coup à 1 déclenchement',
        apresCoup.declenchements, 1);
const coupBas = avecH.lignes.find(l => l.rune.indexOf('Coup bas') >= 0);
verifie('  tandis que Coup bas, à 4 s de recharge, en garde 2', coupBas.declenchements, 2);
vrai('  et chaque ligne servie porte l\'hypothèse qui la fonde',
     avecH.lignes.every(l => l.hypothese && l.hypothese.indexOf('fournis par l') >= 0),
     apresCoup.hypothese);
/* Contre-test : zéro immobilisation est une hypothèse VALIDE, et elle donne zéro —
   ce n'est pas la même chose qu'un refus. */
const zeroH = C.surFenetre('Leona', pLeona, cibleH, 10, { hypotheses: { immobilisations: 0 } });
verifie('zéro immobilisation fournie : zéro dégât, sans refus', zeroH.degatsSubis, 0);
vrai('  et c\'est bien un SERVICE à zéro, pas un refus', zeroH.refus.length === 0);

console.log('\n═══ ' + ok + ' réussis, ' + ko + ' échoués ═══\n');
process.exit(ko ? 1 : 0);
