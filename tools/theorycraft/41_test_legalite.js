/* Vérification des règles de LÉGALITÉ — objets et pages de runes.

   Audit demandé avant câblage : le modèle savait chiffrer n'importe quelle combinaison,
   mais pas dire si elle est achetable. Un chiffre juste sur un build impossible ne vaut
   rien — et l'audit a trouvé un build impossible dans mes propres exemples. */

const L = require('./40_legalite');
const items = require('./items.json');
const groupes = require('./groupes_objets.json');
const runes = require('./runes.json');
const A = Array.isArray(runes) ? runes : Object.values(runes);

let ok = 0, ko = 0;
function vrai(nom, cond, info) {
  cond ? ok++ : ko++;
  console.log('  ' + (cond ? 'OK   ' : 'ÉCHEC') + '  ' + nom + (info ? '  ' + info : ''));
}
const parNom = n => items.find(o => o.nom === n);

console.log('\n── Les groupes viennent du fichier, pas d\'une liste écrite à la main');
vrai('21 groupes contraignants extraits', Object.keys(groupes).length === 21,
     Object.keys(groupes).length + ' groupes d\'au moins 2 objets de la Faille');
/* Le groupe le plus lourd de conséquences, et le seul dont le nom interne ne correspond
   plus au nom affiché : `LastWhisper` est le « Fatality » de la boutique. */
vrai('le groupe Fatality limite bien à 1', groupes.LastWhisper && groupes.LastWhisper.max === 1);
vrai('  et il contient le Couperet noir', groupes.LastWhisper.membres.includes(3071),
     groupes.LastWhisper.membres.map(i => items.find(o => o.id === i).nom).join(', '));

/* Identification du groupe haché de la Lame enchantée PAR SA DONNÉE : ses sept membres
   portent tous un calcul `SpellbladeDamage`. Ce n'est pas une ressemblance de noms. */
const spellblade = groupes['{8b55a7b3}'];
vrai('le groupe haché {8b55a7b3} est bien la Lame enchantée',
     spellblade && spellblade.membres.every(i => {
       const o = items.find(x => x.id === i);
       return Object.keys(o.calculs).some(c => /Spellblade/.test(c));
     }),
     spellblade.membres.length + ' membres, tous porteurs de SpellbladeDamage');

console.log('\n── Ce que le modèle acceptait et que le jeu refuse');
const illegal = [
  ['deux paires de bottes', [3111, 3006]],
  ['trois Lames enchantées', [3078, 3100, 6662]],
  ['deux Hydres', [3074, 3748]],
  ['Couperet noir + Salutations de Dominik', [3071, 3036]],
  ['deux objets à Larme', [3004, 3119]],
  ['deux Immolations', [3068, 6664]],
  ['sept objets', [3078, 3100, 3031, 3036, 3072, 3153, 3161]]
];
illegal.forEach(([nom, b]) => {
  const r = L.buildLegal(b);
  vrai(nom + ' : refusé', !r.legal,
       r.infractions.map(i => i.regle + (i.groupe ? ' (' + i.groupe + ')' : '')).join(' | '));
});
/* Un refus doit dire POURQUOI : « illégal » sans motif n'aide personne à corriger. */
const d = L.buildLegal([3071, 3036]).infractions[0];
vrai('  le motif nomme le groupe et les objets fautifs',
     d.groupe && d.objets.length === 2, d.groupe + ' → ' + d.objets.join(' + '));

console.log('\n── Et ce qu\'il accepte à juste titre');
const legaux = [
  ['build de mage complet', [3089, 3157, 3003, 4645, 3116, 3020]],
  ['tank quatre objets', [3068, 3143, 3083, 3075]],
  ['une seule paire de bottes', [3111, 3078, 3053]],
  ['Couperet noir + létalité', [3071, 3142]]
];
legaux.forEach(([nom, b]) => {
  const r = L.buildLegal(b);
  vrai(nom + ' : accepté', r.legal, r.legal ? r.or + ' po' : JSON.stringify(r.infractions));
});

/* Découverte de l'audit, et elle vaut d'être écrite noir sur blanc : réduction d'armure
   et pénétration d'armure en pourcentage ne peuvent JAMAIS coexister via l'équipement,
   puisque tous les objets concernés sont dans le même groupe limité à 1. */
const penPct = items.filter(o => o.stats.penArmure);
vrai('tous les objets à pénétration d\'armure en % sont dans le même groupe',
     penPct.length > 0 && penPct.every(o => (o.groupes || []).includes('LastWhisper')),
     penPct.map(o => o.nom).join(', '));
vrai('  le Couperet noir en fait partie, donc aucune combinaison n\'est possible',
     (parNom('Couperet noir').groupes || []).includes('LastWhisper'));

console.log('\n── Objets réservés à un champion');
const reserve = items.find(o => o.championRequis);
if (reserve) {
  vrai('un objet réservé est refusé au mauvais champion',
       !L.buildLegal([reserve.id], { champion: 'Ryze' }).legal, reserve.nom + ' → ' + reserve.championRequis);
  vrai('  et accepté au bon',
       L.buildLegal([reserve.id], { champion: reserve.championRequis }).legal);
} else { vrai('aucun objet réservé dans le périmètre', true); }

console.log('\n── Suggestion de correction plutôt que simple refus');
const c = L.conflits([3078, 3100, 6662]);
vrai('le conflit propose quoi garder et quoi retirer',
     c.length === 1 && c[0].aRetirer.length === 2,
     'garder ' + c[0].garder + ', retirer ' + c[0].aRetirer.join(' et '));
vrai('  et garde le plus cher', parNom(c[0].garder).prix >=
     Math.max(...c[0].aRetirer.map(n => parNom(n).prix)),
     c[0].garder + ' à ' + parNom(c[0].garder).prix + ' po');

console.log('\n── Pages de runes : la structure vient du fichier');
const parArbre = {};
A.filter(r => r.active).forEach(r => {
  const k = r.arbre + '/' + r.genre;
  (parArbre[k] = parArbre[k] || []).push(r);
});
vrai('5 arbres, chacun avec ses majeures et ses mineures',
     [...new Set(A.filter(r => r.active).map(r => r.arbre))].length === 5);
vrai('  et 7 fragments répartis sur 3 rangées',
     A.filter(r => r.active && r.genre === 'fragment').length === 7 &&
     [...new Set(A.filter(r => r.genre === 'fragment').map(r => r.slot))].sort().join(',') === '4,5,6');

/* Une page complète et valide, bâtie depuis les données elles-mêmes plutôt qu'à la main :
   si Riot déplace une rune, le test suit. */
const maj = A.find(r => r.active && r.genre === 'majeure' && r.arbre === 'Sorcellerie');
const min = s => A.find(r => r.active && r.genre === 'mineure' && r.arbre === 'Sorcellerie' && r.slot === s);
const sec = s => A.find(r => r.active && r.genre === 'mineure' && r.arbre === 'Précision' && r.slot === s);
const frag = s => A.find(r => r.active && r.genre === 'fragment' && r.slot === s);
const page = [maj.id, min(1).id, min(2).id, min(3).id, sec(1).id, sec(2).id,
              frag(4).id, frag(5).id, frag(6).id];
const pv = L.pageLegale(page);
vrai('une page complète est acceptée', pv.legale, JSON.stringify(pv.infractions));
vrai('  et ses deux arbres sont identifiés',
     pv.arbrePrincipal === 'Sorcellerie' && pv.arbreSecondaire === 'Précision',
     pv.arbrePrincipal + ' / ' + pv.arbreSecondaire);

const casInvalides = [
  ['deux majeures', page.concat([A.find(r => r.active && r.genre === 'majeure' && r.arbre === 'Précision').id])],
  ['aucun fragment', page.slice(0, 6)],
  ['deux mineures du même emplacement', [maj.id, min(1).id, min(2).id, min(3).id, sec(1).id,
                                         A.find(r => r.active && r.genre === 'mineure' && r.arbre === 'Précision' && r.slot === 1 && r.id !== sec(1).id) ?
                                         A.find(r => r.active && r.genre === 'mineure' && r.arbre === 'Précision' && r.slot === 1 && r.id !== sec(1).id).id : sec(1).id,
                                         frag(4).id, frag(5).id, frag(6).id]],
  ['deux arbres secondaires', [maj.id, min(1).id, min(2).id, min(3).id, sec(1).id,
                               A.find(r => r.active && r.genre === 'mineure' && r.arbre === 'Domination').id,
                               frag(4).id, frag(5).id, frag(6).id]]
];
casInvalides.forEach(([nom, p]) => {
  const r = L.pageLegale(p);
  vrai(nom + ' : refusé', !r.legale, r.infractions.map(i => i.regle).join(' | '));
});
/* Une rune retirée du jeu ne doit pas passer : 37 des 106 runes du fichier sont
   d'anciennes versions. */
const morte = A.find(r => !r.active);
vrai('une rune retirée du jeu est refusée',
     !L.pageLegale([morte.id]).legale, morte.nom);

console.log('\n═══ ' + ok + ' réussis, ' + ko + ' échoués ═══\n');
process.exit(ko ? 1 : 0);
