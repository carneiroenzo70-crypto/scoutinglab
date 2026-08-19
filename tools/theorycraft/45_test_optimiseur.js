/* Vérification de l'OPTIMISEUR DE BUILD.

   Un optimiseur est le composant le plus facile à faire passer pour bon : il sort
   toujours un classement, et un classement a toujours l'air d'un résultat. On ne teste
   donc pas qu'il « rend quelque chose » — on teste qu'il rend AUTRE CHOSE quand la
   question change, et la même chose quand elle ne change pas. Un optimiseur qui
   recommanderait le même build contre une composition tout AP et contre une composition
   tout AD serait exactement aussi inutile qu'un site communautaire, en plus lent. */

const O = require('./44_optimiseur');
const items = require('./items.json');

let ok = 0, ko = 0;
function vrai(nom, cond, info) {
  cond ? ok++ : ko++;
  console.log('  ' + (cond ? 'OK   ' : 'ÉCHEC') + '  ' + nom + (info ? '  ' + info : ''));
}
function verifie(nom, obtenu, attendu, tol) {
  vrai(nom, Math.abs(obtenu - attendu) <= tol, 'obtenu ' + obtenu + '   attendu ' + attendu);
}
const nomsDe = b => b.noms.join(' · ');

const TOUT_AP = ['Ahri', 'Syndra', 'Viktor', 'Lux', 'Karthus'];
const TOUT_AD = ['Zed', 'Jhin', 'LeeSin', 'Darius', 'Draven'];

console.log('\n── Le matchup est DÉDUIT, jamais demandé ni supposé');
const mAP = O.matchupDepuisCompo(TOUT_AP, 18);
const mAD = O.matchupDepuisCompo(TOUT_AD, 18);
vrai('une composition de mages donne une part physique faible', mAP.partPhysique < 0.35,
     'part physique ' + mAP.partPhysique);
vrai('une composition de combattants la donne élevée', mAD.partPhysique > 0.75,
     'part physique ' + mAD.partPhysique);
/* Contre-test : sans déduction, le modèle aurait servi 0,5 dans les deux cas — la
   valeur par défaut, celle qui ne dit rien et ne change jamais rien. */
vrai('  et les deux diffèrent vraiment de la valeur par défaut de 0,5',
     Math.abs(mAP.partPhysique - 0.5) > 0.1 && Math.abs(mAD.partPhysique - 0.5) > 0.1);
vrai('les cinq adversaires sont bien tous pris comme cibles', mAP.cibles.length === 5);
vrai('une composition vide est refusée, pas remplie de valeurs neutres',
     O.matchupDepuisCompo([], 18) === null);
vrai('un champion inconnu est écarté sans faire tomber le reste',
     (O.matchupDepuisCompo(['Ahri', 'PasUnChampion'], 18) || {}).ids.length === 1);

console.log('\n── LA question : le matchup change-t-il la recommandation ?');
const dAP = O.chercherBuilds('Darius', 18, mAP, { objectif: 'survie', emplacements: 4, largeur: 6, combien: 1 });
const dAD = O.chercherBuilds('Darius', 18, mAD, { objectif: 'survie', emplacements: 4, largeur: 6, combien: 1 });
const bAP = dAP.builds[0], bAD = dAD.builds[0];
console.log('     face aux mages       : ' + nomsDe(bAP));
console.log('     face aux combattants : ' + nomsDe(bAD));
vrai('le build conseillé n\'est pas le même selon la composition d\'en face',
     nomsDe(bAP) !== nomsDe(bAD));
/* Et pas seulement « pas le même » : le bon type de résistance. C'est ce test-ci qui
   distingue un optimiseur qui marche d'un optimiseur qui brasse. */
/* Les résistances vivent dans `stats`, pas à la racine de l'objet — la première
   version de ce test lisait `o.rm` et trouvait 0 partout : il aurait donc échoué même
   si l'optimiseur avait été parfait, et réussi s'il avait été parfaitement faux. */
const statDe = (id, cle) => (((items.find(o => o.id === id) || {}).stats || {})[cle] || {}).valeur || 0;
const rmDe = id => statDe(id, 'rm');
const armDe = id => statDe(id, 'armure');
const somme = (b, f) => b.objets.reduce((s, i) => s + f(i), 0);
vrai('  face aux mages, il emporte plus de résistance magique que d\'armure',
     somme(bAP, rmDe) > somme(bAP, armDe),
     somme(bAP, rmDe) + ' RM contre ' + somme(bAP, armDe) + ' armure');
vrai('  face aux combattants, l\'inverse',
     somme(bAD, armDe) > somme(bAD, rmDe),
     somme(bAD, armDe) + ' armure contre ' + somme(bAD, rmDe) + ' RM');

console.log('\n── L\'objectif est un CHOIX, et il se voit dans le résultat');
const mMixte = O.matchupDepuisCompo(['Sion', 'Ahri', 'LeeSin', 'Jhin', 'Thresh'], 18);
const oDeg = O.chercherBuilds('Jhin', 18, mMixte, { objectif: 'degats', emplacements: 4, largeur: 6, combien: 1 });
const oSur = O.chercherBuilds('Jhin', 18, mMixte, { objectif: 'survie', emplacements: 4, largeur: 6, combien: 1 });
vrai('viser les dégâts donne plus de dégâts que viser la survie',
     oDeg.builds[0].degats > oSur.builds[0].degats);
vrai('viser la survie donne plus de survie que viser les dégâts',
     oSur.builds[0].survie > oDeg.builds[0].survie);
/* Contre-test du score équilibré : il ne doit ressembler à AUCUN des deux extrêmes,
   sinon la moyenne géométrique ne servirait à rien et l'un des axes déciderait seul. */
const oEqu = O.chercherBuilds('Jhin', 18, mMixte, { objectif: 'equilibre', emplacements: 4, largeur: 6, combien: 1 });
vrai('l\'équilibré ne se confond ni avec l\'un ni avec l\'autre',
     nomsDe(oEqu.builds[0]) !== nomsDe(oDeg.builds[0]) &&
     nomsDe(oEqu.builds[0]) !== nomsDe(oSur.builds[0]),
     nomsDe(oEqu.builds[0]));

console.log('\n── Ce que l\'optimiseur n\'a pas le droit de recommander');
const tousBuilds = [].concat(oDeg.builds, oSur.builds, oEqu.builds, dAP.builds, dAD.builds);
const L = require('./40_legalite');
vrai('aucun build proposé n\'est illégal',
     tousBuilds.every(b => L.buildLegal(b.objets, { emplacements: 6 }).legal));
vrai('aucun build ne contient deux fois le même objet',
     tousBuilds.every(b => new Set(b.objets).size === b.objets.length));
/* Le budget est une contrainte dure : conseiller un build qu'on ne peut pas payer
   revient à ne rien conseiller. */
const pauvre = O.chercherBuilds('Jhin', 18, mMixte,
  { objectif: 'degats', emplacements: 6, largeur: 4, combien: 3, orMax: 7000 });
vrai('un budget de 7 000 po est respecté par tous les builds rendus',
     pauvre.builds.every(b => b.or <= 7000),
     pauvre.builds.map(b => b.or + ' po').join(', '));
vrai('  et il rend quand même des builds, au lieu de renoncer',
     pauvre.builds.length > 0 && pauvre.builds[0].objets.length > 0,
     nomsDe(pauvre.builds[0]));

console.log('\n── Le « pourquoi » : la contribution de chaque objet');
const b1 = oDeg.builds[0];
vrai('chaque objet du build porte sa contribution chiffrée',
     b1.apports.length === b1.objets.length + b1.inutiles.length &&
     b1.apports.every(a => a.partScore != null));
vrai('  les apports sont triés du plus décisif au moins décisif',
     b1.apports.every((a, i) => i === 0 || b1.apports[i - 1].partScore >= a.partScore));
/* La contribution doit être RÉELLE : retirer l'objet le plus décisif doit coûter au
   moins autant que retirer le moins décisif. Sans ce test, `partScore` pourrait être
   n'importe quel nombre trié — l'apparence d'une explication sans l'explication. */
const O44 = require('./44_optimiseur');
const sansMeilleur = O44.valeurBuild('Jhin', 18, b1.objets.filter(i => i !== b1.apports[0].id), mMixte, {});
const sansPire = O44.valeurBuild('Jhin', 18, b1.objets.filter(i => i !== b1.apports[b1.apports.length - 1].id), mMixte, {});
vrai('  retirer l\'objet le plus décisif coûte plus que retirer le moins décisif',
     (b1.degats - sansMeilleur.degats) >= (b1.degats - sansPire.degats),
     Math.round(b1.degats - sansMeilleur.degats) + ' contre ' + Math.round(b1.degats - sansPire.degats) + ' dégâts');

console.log('\n── La méthode est annoncée, pas maquillée en vérité');
vrai('le résultat dit qu\'il s\'agit des meilleurs TROUVÉS, pas d\'un optimum',
     /pas un optimum prouvé/.test(oDeg.methode), oDeg.methode);
vrai('  et il dit combien d\'évaluations ont été faites', oDeg.evaluations > 0,
     oDeg.evaluations + ' évaluations');
/* Élargir le faisceau ne doit JAMAIS dégrader le meilleur score : c'est la seule
   garantie qu'on puisse honnêtement donner sur une recherche gloutonne, et elle vaut
   d'être vérifiée plutôt qu'affirmée. */
const etroit = O.chercherBuilds('Jhin', 18, mMixte, { objectif: 'degats', emplacements: 4, largeur: 2, combien: 1 });
const large  = O.chercherBuilds('Jhin', 18, mMixte, { objectif: 'degats', emplacements: 4, largeur: 12, combien: 1 });
vrai('un faisceau plus large ne rend jamais un moins bon build',
     large.builds[0].degats >= etroit.builds[0].degats,
     'largeur 2 → ' + etroit.builds[0].degats + ' · largeur 12 → ' + large.builds[0].degats);

console.log('\n── La référence sans objets, qui donne son sens aux pourcentages');
vrai('la base est calculée, pas posée à zéro', oDeg.base.degats > 0 && oDeg.base.survie > 0,
     oDeg.base.degats + ' dégâts · ' + oDeg.base.survie + ' PV effectifs');
verifie('le gain annoncé correspond au rapport à cette base',
        oDeg.builds[0].gainDegatsPct,
        Math.round((oDeg.builds[0].degats / oDeg.base.degats - 1) * 100), 1);

console.log('\n── Comparaison de deux builds, terme à terme');
const cmp = O.comparerBuilds('Jhin', 18, [3031, 3036], [3031, 3033], mMixte);
vrai('les objets propres à chaque build sont isolés',
     cmp.propreA.length === 1 && cmp.propreB.length === 1,
     cmp.propreA + ' contre ' + cmp.propreB);
verifie('  et l\'écart de dégâts est la différence des deux mesures',
        cmp.ecartDegats, cmp.b.degats - cmp.a.degats, 1);

console.log('\n═══ ' + ok + ' réussis, ' + ko + ' échoués ═══');
process.exit(ko ? 1 : 0);
