/* AUDIT DE COUVERTURE — à relancer après chaque patch, avant de se fier au modèle.

   Ne teste rien : il DÉCRIT ce que le modèle sait et ce qu'il ne sait pas, sans arrondi
   flatteur. Un calculateur dont on ignore les trous est plus dangereux qu'un calculateur
   incomplet dont on les connaît. */

const champions = require('./champions.json');
const items = require('./items.json');
const groupes = require('./groupes_objets.json');
const runesBrutes = require('./runes.json');
const modelesRunes = require('./runes_modeles');
const I = require('./30_moteur_items');
const C = require('./38_runes_combat');
const DD = require('./champFull.json');

const runes = Array.isArray(runesBrutes) ? runesBrutes : Object.values(runesBrutes);
const ligne = (l, v, sur) => console.log('  ' + l.padEnd(46) +
  String(v).padStart(5) + (sur != null ? ' / ' + sur : ''));

console.log('\n══ FRAÎCHEUR');
ligne('version Data Dragon des données', DD.version);
console.log('  (comparer à https://ddragon.leagueoflegends.com/api/versions.json)');

console.log('\n══ OBJETS');
const finis = items.filter(o => o.fini && o.prix >= 1800);
const avecPassif = finis.filter(o => Object.keys(o.calculs).length || Object.keys(o.valeurs).length);
const cv = I.couverture();
ligne('objets de la Faille extraits', items.length);
ligne('objets finis (≥ 1800 po)', finis.length);
ligne('  portant un passif chiffré', avecPassif.length);
ligne('  passif APPLIQUÉ au modèle', cv.modelises.length, avecPassif.length);
ligne('  écarté avec un motif écrit', cv.ecartes.length);
ligne('  PAS ENCORE MODÉLISÉ', cv.sansModele.length);
ligne('objets portant une alerte d\'extraction', items.filter(o => o.alertes.length).length);
ligne('groupes de légalité contraignants', Object.keys(groupes).length);

console.log('\n══ RUNES');
const actives = runes.filter(r => r.active);
ligne('runes dans le fichier', runes.length);
ligne('  actives en jeu', actives.length);
ligne('  modélisées', Object.keys(modelesRunes).length, actives.length);
const ampsRunes = require('./36_runes_profil');
ligne('  entrant dans les stats du profil', Object.keys(ampsRunes.PERMANENTES).length);
ligne('  écartées du profil avec un motif', Object.keys(ampsRunes.HORS_PROFIL).length);
ligne('  avec une cadence de combat', Object.keys(C.CADENCES).length);
ligne('  sans cadence déterminable', Object.keys(C.SANS_CADENCE).length);

console.log('\n══ CHAMPIONS');
const tous = Object.values(champions);
ligne('champions du panel', tous.length);
[4, 3, 2, 1, 0].forEach(n => {
  const c = tous.filter(x => x.sortsUtiles === n).length;
  if (c) ligne('  ' + n + ' sorts chiffrés', c);
});

/* Les deux seules lacunes qui empêchent RÉELLEMENT un calcul. Un sort sans dégâts
   (une ruée, un bouclier, un changement de posture) n'est pas une lacune : c'est un
   sort qui n'inflige rien. Les compter comme des trous gonflerait artificiellement
   le problème — et masquerait les vrais. */
const sansType = [], sansCalcul = [], declaresHorsPortee = [], sansDegats = [];
tous.forEach(x => ['Q', 'W', 'E', 'R'].forEach((t, i) => {
  const s = x.sorts[t]; if (!s) return;
  /* Un sort DÉCLARÉ non exploitable n'est pas une lacune : c'est un refus assumé et
     motivé (les deux « sorts » d'Aphelios sont des enveloppes d'infobulle). Le compter
     comme un trou entretiendrait un chiffre faussement inquiétant. */
  if (s.nonExploitable) { declaresHorsPortee.push(x.id + ' ' + t + ' — ' + s.nonExploitable); return; }
  /* Faux positif de la détection par mots-clés : l'infobulle parle de dégâts, mais le
     sort n'en inflige pas (bouclier de Morgana, réduction de Nilah, renvoi de Fiora
     vers son passif). Déclaré, motivé, donc pas une lacune. */
  if (s.sansDegats) { sansDegats.push(x.id + ' ' + t + ' — ' + s.sansDegats); return; }
  const aDegats = Object.values(s.calculs).some(c => c.genre === 'degats');
  if (aDegats && !s.typeDegats) { sansType.push(x.id + ' ' + t); return; }
  if (!aDegats) {
    const tip = ((DD.data[x.id] || {}).spells || [])[i];
    const txt = ((tip || {}).tooltip || '').replace(/<[^>]+>/g, ' ');
    if (/dégâts (physiques|magiques|bruts)/i.test(txt)) sansCalcul.push(x.id + ' ' + t);
  }
}));
const totalSorts = tous.reduce((s, x) => s + Object.keys(x.sorts).length, 0);
ligne('sorts extraits', totalSorts);
ligne('  inflige des dégâts, TYPE non déterminé', sansType.length);
if (sansType.length) console.log('      ' + sansType.join(', '));
ligne('  dégâts annoncés, AUCUN calcul extrait', sansCalcul.length);
if (sansCalcul.length) console.log('      ' + sansCalcul.join(', '));
ligne('  déclarés hors portée, avec motif', declaresHorsPortee.length);
if (declaresHorsPortee.length) declaresHorsPortee.forEach(x => console.log('      ' + x));
ligne('  n\'infligent rien, déclaré et motivé', sansDegats.length);
if (sansDegats.length) sansDegats.forEach(x => console.log('      ' + x));
const pct = Math.round((1 - (sansType.length + sansCalcul.length) / totalSorts) * 1000) / 10;
ligne('couverture exploitable des sorts', pct + ' %');

console.log('\n══ CE QUE LE MODÈLE NE SAIT TOUJOURS PAS');
[
  cv.sansModele.length + ' passifs d\'objet non modélisés (boucliers, soins, dissipations)',
  Object.keys(C.SANS_CADENCE).length + ' runes sans cadence déterminable (élimination, immobilisation)',
  (sansType.length + sansCalcul.length)
    ? (sansType.length + sansCalcul.length) + ' sorts encore incomplets'
    : 'aucune lacune de sort — les 11 du panel de 90, puis les 27 ouvertes par ' +
      'l\'élargissement à 173, sont corrigées',
  declaresHorsPortee.length + ' sorts déclarés hors portée, motif écrit',
  'les amplifications conditionnelles au placement ou au contrôle (4 objets)',
  'les boucliers antisorts et ceux posés sur un ALLIÉ, dont la valeur ne se chiffre pas en points'
].forEach(x => console.log('  · ' + x));
console.log('');
